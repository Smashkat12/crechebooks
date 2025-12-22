import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { HybridPdfParser } from '../src/database/parsers/hybrid-pdf-parser';
import { ParsedTransaction } from '../src/database/dto/import.dto';

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
const BANK_ACCOUNT = '63061274808';
const BANK_STATEMENTS_DIR = join(__dirname, '../../../bank-statements');

// Maximum reasonable amount (R100,000 = 10,000,000 cents)
// Amounts above this are parsing errors
const MAX_REASONABLE_AMOUNT = 10_000_000;

/**
 * Parse all PDF bank statements and import transactions
 */
async function importTransactions(): Promise<void> {
  console.log('🏦 Starting bank statement import...\n');

  const parser = new HybridPdfParser();
  const pdfFiles = readdirSync(BANK_STATEMENTS_DIR)
    .filter(f => f.endsWith('.pdf'))
    .sort(); // Sort chronologically

  console.log(`📂 Found ${pdfFiles.length} PDF files to process\n`);

  let totalParsed = 0;
  let totalImported = 0;
  let totalSkipped = 0;
  let totalDuplicates = 0;
  let totalInvalidAmounts = 0;

  const importBatchId = randomUUID();

  for (const file of pdfFiles) {
    const filePath = join(BANK_STATEMENTS_DIR, file);
    console.log(`📄 Processing: ${file}`);

    try {
      const buffer = readFileSync(filePath);
      const transactions = await parser.parse(buffer);

      const credits = transactions.filter(tx => tx.isCredit);
      const debits = transactions.filter(tx => !tx.isCredit);

      console.log(`   Parsed: ${transactions.length} (${credits.length} credits, ${debits.length} debits)`);

      // Filter out invalid amounts
      const validTransactions = transactions.filter(tx => {
        if (tx.amountCents > MAX_REASONABLE_AMOUNT) {
          totalInvalidAmounts++;
          return false;
        }
        return true;
      });

      // Import each transaction
      for (const tx of validTransactions) {
        totalParsed++;

        // Check for duplicates (same date, description, amount)
        const existing = await prisma.transaction.findFirst({
          where: {
            tenantId: DEMO_TENANT_ID,
            date: tx.date,
            description: tx.description,
            amountCents: tx.amountCents,
          },
        });

        if (existing) {
          totalDuplicates++;
          continue;
        }

        // Create transaction
        try {
          await prisma.transaction.create({
            data: {
              id: randomUUID(),
              tenantId: DEMO_TENANT_ID,
              bankAccount: BANK_ACCOUNT,
              date: tx.date,
              description: tx.description,
              payeeName: tx.payeeName,
              reference: tx.reference,
              amountCents: tx.amountCents,
              isCredit: tx.isCredit,
              source: 'PDF_IMPORT',
              importBatchId,
              status: 'PENDING',
              isReconciled: false,
              isDeleted: false,
            },
          });
          totalImported++;
        } catch (error) {
          console.error(`   ❌ Failed to import transaction: ${error instanceof Error ? error.message : String(error)}`);
          totalSkipped++;
        }
      }

    } catch (error) {
      console.error(`   ❌ Error processing ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log('\n✨ Import completed!');
  console.log(`   📊 Total parsed: ${totalParsed}`);
  console.log(`   ✅ Imported: ${totalImported}`);
  console.log(`   🔄 Duplicates skipped: ${totalDuplicates}`);
  console.log(`   ⚠️ Invalid amounts filtered: ${totalInvalidAmounts}`);
  console.log(`   ❌ Skipped/errors: ${totalSkipped}`);
  console.log(`   📦 Batch ID: ${importBatchId}`);
}

/**
 * Display summary of imported transactions
 */
async function displaySummary(): Promise<void> {
  console.log('\n📊 Transaction Summary:\n');

  const total = await prisma.transaction.count({
    where: { tenantId: DEMO_TENANT_ID },
  });

  const credits = await prisma.transaction.count({
    where: { tenantId: DEMO_TENANT_ID, isCredit: true },
  });

  const debits = await prisma.transaction.count({
    where: { tenantId: DEMO_TENANT_ID, isCredit: false },
  });

  const totalCreditsAmount = await prisma.transaction.aggregate({
    where: { tenantId: DEMO_TENANT_ID, isCredit: true },
    _sum: { amountCents: true },
  });

  const totalDebitsAmount = await prisma.transaction.aggregate({
    where: { tenantId: DEMO_TENANT_ID, isCredit: false },
    _sum: { amountCents: true },
  });

  console.log(`   Total transactions: ${total}`);
  console.log(`   Credits: ${credits} (R${((totalCreditsAmount._sum.amountCents || 0) / 100).toFixed(2)})`);
  console.log(`   Debits: ${debits} (R${((totalDebitsAmount._sum.amountCents || 0) / 100).toFixed(2)})`);

  // Show sample credits with child names
  console.log('\n📝 Sample Credit Transactions (potential payments):');
  const sampleCredits = await prisma.transaction.findMany({
    where: { tenantId: DEMO_TENANT_ID, isCredit: true },
    orderBy: { date: 'desc' },
    take: 10,
  });

  for (const tx of sampleCredits) {
    console.log(`   ${tx.date.toISOString().split('T')[0]} | R${(tx.amountCents / 100).toFixed(2)} | ${tx.description}`);
  }
}

// Main execution
async function main() {
  try {
    await importTransactions();
    await displaySummary();
  } catch (error) {
    console.error('\n💥 Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
