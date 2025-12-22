import 'dotenv/config';
import { PrismaClient, InvoiceStatus, MatchType, MatchedBy } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

// Database setup
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Constants
const DEMO_TENANT_ID = 'DEMO_TENANT_ID';
const AUTO_APPLY_THRESHOLD = 70; // Lower threshold since we match child names
const CANDIDATE_THRESHOLD = 40;

/**
 * Calculate string similarity using Levenshtein distance
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;

  const matrix: number[][] = [];

  for (let i = 0; i <= str1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str1.length; i++) {
    for (let j = 1; j <= str2.length; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  const distance = matrix[str1.length][str2.length];
  const maxLength = Math.max(str1.length, str2.length);
  return 1 - distance / maxLength;
}

/**
 * Normalize string for comparison
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

/**
 * Extract potential names from transaction description
 */
function extractNamesFromDescription(description: string): string[] {
  // Remove common banking prefixes
  const cleaned = description
    .replace(/^(FNB App Payment From|FNB App Transfer From|Magtape Credit Capitec|ADT Cash Deposit|Payshap Credit|Int-Banking Pmt Frm|Rtc Credit|Scheduled Pymt From)/i, '')
    .replace(/\d+/g, '') // Remove numbers
    .trim();

  // Split by spaces and return non-empty parts
  const parts = cleaned.split(/\s+/).filter(p => p.length > 2);

  // Also try the full cleaned string
  return [cleaned, ...parts];
}

interface MatchCandidate {
  transactionId: string;
  invoiceId: string;
  invoiceNumber: string;
  childName: string;
  parentName: string;
  confidenceScore: number;
  matchReasons: string[];
  transactionAmount: number;
  invoiceAmount: number;
}

/**
 * Match transactions to invoices
 */
async function matchPayments(): Promise<void> {
  console.log('💰 Starting payment matching...\n');

  // Get unallocated credit transactions
  const allocatedIds = await prisma.payment.findMany({
    where: {
      tenantId: DEMO_TENANT_ID,
      isReversed: false,
      transactionId: { not: null },
    },
    select: { transactionId: true },
  });

  const allocatedTransactionIds = new Set(
    allocatedIds.map(p => p.transactionId).filter(Boolean)
  );

  const creditTransactions = await prisma.transaction.findMany({
    where: {
      tenantId: DEMO_TENANT_ID,
      isCredit: true,
      isDeleted: false,
    },
    orderBy: { date: 'asc' },
  });

  const unallocatedCredits = creditTransactions.filter(
    t => !allocatedTransactionIds.has(t.id)
  );

  console.log(`📊 Found ${unallocatedCredits.length} unallocated credit transactions`);

  // Get outstanding invoices with child info
  const outstandingInvoices = await prisma.invoice.findMany({
    where: {
      tenantId: DEMO_TENANT_ID,
      isDeleted: false,
      status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.VOID] },
    },
    include: {
      parent: true,
      child: true,
    },
    orderBy: { dueDate: 'asc' },
  });

  console.log(`📋 Found ${outstandingInvoices.length} outstanding invoices\n`);

  let autoApplied = 0;
  let reviewRequired = 0;
  let noMatch = 0;

  for (const transaction of unallocatedCredits) {
    const candidates: MatchCandidate[] = [];
    const description = transaction.description || '';
    const payeeName = transaction.payeeName || '';
    const potentialNames = extractNamesFromDescription(description);

    // Add payeeName if different from description
    if (payeeName && !potentialNames.includes(payeeName)) {
      potentialNames.push(payeeName);
    }

    const transactionAmount = Math.abs(transaction.amountCents);

    for (const invoice of outstandingInvoices) {
      const outstandingAmount = invoice.totalCents - invoice.amountPaidCents;
      if (outstandingAmount <= 0) continue;

      let score = 0;
      const reasons: string[] = [];

      const childFirstName = normalizeString(invoice.child.firstName);
      const childLastName = normalizeString(invoice.child.lastName);
      const childFullName = `${childFirstName} ${childLastName}`;
      const parentFirstName = normalizeString(invoice.parent.firstName);
      const parentLastName = normalizeString(invoice.parent.lastName);
      const parentFullName = `${parentFirstName} ${parentLastName}`;

      // Check name matches in description (40 points max)
      let nameScore = 0;
      let bestNameMatch = '';

      for (const name of potentialNames) {
        const normalizedName = normalizeString(name);

        // Check child name
        if (normalizedName.includes(childFirstName) && childFirstName.length >= 3) {
          const similarity = calculateStringSimilarity(normalizedName, childFullName);
          if (similarity > 0.6 && similarity * 40 > nameScore) {
            nameScore = Math.round(similarity * 40);
            bestNameMatch = `Child name match: ${invoice.child.firstName}`;
          }
        }

        // Check child last name
        if (normalizedName.includes(childLastName) && childLastName.length >= 3) {
          const similarity = calculateStringSimilarity(normalizedName, childLastName);
          if (similarity > 0.6 && similarity * 35 > nameScore) {
            nameScore = Math.round(similarity * 35);
            bestNameMatch = `Child surname match: ${invoice.child.lastName}`;
          }
        }

        // Check parent name
        if (normalizedName.includes(parentFirstName) && parentFirstName.length >= 3) {
          const similarity = calculateStringSimilarity(normalizedName, parentFullName);
          if (similarity > 0.6 && similarity * 30 > nameScore) {
            nameScore = Math.round(similarity * 30);
            bestNameMatch = `Parent name match: ${invoice.parent.firstName}`;
          }
        }

        // Check parent last name
        if (normalizedName.includes(parentLastName) && parentLastName.length >= 3) {
          const similarity = calculateStringSimilarity(normalizedName, parentLastName);
          if (similarity > 0.6 && similarity * 25 > nameScore) {
            nameScore = Math.round(similarity * 25);
            bestNameMatch = `Parent surname match: ${invoice.parent.lastName}`;
          }
        }
      }

      if (nameScore > 0) {
        score += nameScore;
        reasons.push(bestNameMatch);
      }

      // Amount matching (40 points max)
      const amountDiff = Math.abs(transactionAmount - outstandingAmount);
      const percentDiff = outstandingAmount > 0 ? amountDiff / outstandingAmount : 1;

      if (amountDiff === 0) {
        score += 40;
        reasons.push('Exact amount match');
      } else if (percentDiff <= 0.05) {
        score += 30;
        reasons.push('Amount within 5%');
      } else if (percentDiff <= 0.15) {
        score += 20;
        reasons.push('Amount within 15%');
      } else if (transactionAmount < outstandingAmount) {
        score += 10;
        reasons.push('Partial payment');
      }

      // Date proximity bonus (10 points max)
      const daysDiff = Math.abs(
        (transaction.date.getTime() - invoice.billingPeriodStart.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysDiff <= 30) {
        score += 10;
        reasons.push('Payment within 30 days of invoice');
      } else if (daysDiff <= 60) {
        score += 5;
        reasons.push('Payment within 60 days of invoice');
      }

      if (score >= CANDIDATE_THRESHOLD) {
        candidates.push({
          transactionId: transaction.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          childName: `${invoice.child.firstName} ${invoice.child.lastName}`,
          parentName: `${invoice.parent.firstName} ${invoice.parent.lastName}`,
          confidenceScore: Math.min(score, 100),
          matchReasons: reasons,
          transactionAmount,
          invoiceAmount: outstandingAmount,
        });
      }
    }

    // Sort candidates by score
    candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);

    if (candidates.length === 0) {
      noMatch++;
      continue;
    }

    const topCandidate = candidates[0];

    // Auto-apply if single high-confidence match
    const highConfidence = candidates.filter(c => c.confidenceScore >= AUTO_APPLY_THRESHOLD);

    if (highConfidence.length === 1) {
      // Create payment
      const payment = await prisma.payment.create({
        data: {
          id: randomUUID(),
          tenantId: DEMO_TENANT_ID,
          transactionId: transaction.id,
          invoiceId: topCandidate.invoiceId,
          amountCents: transactionAmount,
          paymentDate: transaction.date,
          matchType: MatchType.PARTIAL,
          matchConfidence: topCandidate.confidenceScore,
          matchedBy: MatchedBy.AI_AUTO,
        },
      });

      // Update invoice
      await prisma.invoice.update({
        where: { id: topCandidate.invoiceId },
        data: {
          amountPaidCents: { increment: transactionAmount },
        },
      });

      // Check if fully paid
      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: topCandidate.invoiceId },
      });

      if (updatedInvoice && updatedInvoice.amountPaidCents >= updatedInvoice.totalCents) {
        await prisma.invoice.update({
          where: { id: topCandidate.invoiceId },
          data: { status: InvoiceStatus.PAID },
        });
      }

      console.log(`✅ Auto-matched: R${(transactionAmount/100).toFixed(2)} → ${topCandidate.childName} (${topCandidate.invoiceNumber}) [${topCandidate.confidenceScore}%]`);
      console.log(`   Reasons: ${topCandidate.matchReasons.join(', ')}`);
      autoApplied++;
    } else {
      reviewRequired++;
      // console.log(`⚠️ Review: ${description.substring(0, 50)}... - ${candidates.length} candidates`);
    }
  }

  console.log('\n✨ Payment matching complete!');
  console.log(`   ✅ Auto-applied: ${autoApplied}`);
  console.log(`   ⚠️ Review required: ${reviewRequired}`);
  console.log(`   ❌ No match: ${noMatch}`);
}

/**
 * Display payment summary
 */
async function displaySummary(): Promise<void> {
  console.log('\n📊 Payment Summary:\n');

  const totalPayments = await prisma.payment.count({
    where: { tenantId: DEMO_TENANT_ID },
  });

  const totalPaid = await prisma.payment.aggregate({
    where: { tenantId: DEMO_TENANT_ID },
    _sum: { amountCents: true },
  });

  const paidInvoices = await prisma.invoice.count({
    where: { tenantId: DEMO_TENANT_ID, status: InvoiceStatus.PAID },
  });

  const partiallyPaidInvoices = await prisma.invoice.count({
    where: {
      tenantId: DEMO_TENANT_ID,
      status: InvoiceStatus.SENT,
      amountPaidCents: { gt: 0 },
    },
  });

  const totalInvoices = await prisma.invoice.count({
    where: { tenantId: DEMO_TENANT_ID },
  });

  console.log(`   Total payments: ${totalPayments}`);
  console.log(`   Total paid: R${((totalPaid._sum.amountCents || 0) / 100).toFixed(2)}`);
  console.log(`   Invoices paid: ${paidInvoices} / ${totalInvoices}`);
  console.log(`   Partially paid: ${partiallyPaidInvoices}`);

  // Show recent payments
  console.log('\n📝 Recent Payments:');
  const recentPayments = await prisma.payment.findMany({
    where: { tenantId: DEMO_TENANT_ID },
    include: {
      invoice: { include: { child: true } },
    },
    orderBy: { paymentDate: 'desc' },
    take: 10,
  });

  for (const payment of recentPayments) {
    const childName = payment.invoice?.child
      ? `${payment.invoice.child.firstName} ${payment.invoice.child.lastName}`
      : 'Unknown';
    console.log(`   ${payment.paymentDate.toISOString().split('T')[0]} | R${(payment.amountCents/100).toFixed(2)} | ${childName} | ${payment.invoice?.invoiceNumber} | ${payment.matchConfidence}%`);
  }
}

// Main execution
async function main(): Promise<void> {
  try {
    await matchPayments();
    await displaySummary();
  } catch (error) {
    console.error('\n💥 Payment matching failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
