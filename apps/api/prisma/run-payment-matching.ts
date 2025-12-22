/**
 * Integration Test: Run Payment Matching Service with Real Data
 *
 * This script bootstraps the NestJS application and calls the real
 * PaymentMatchingService to test the payment matching workflow
 * with the imported demo data.
 *
 * NO WORKAROUNDS - Uses the actual service implementation.
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PaymentMatchingService } from '../src/database/services/payment-matching.service';
import { PrismaService } from '../src/database/prisma/prisma.service';

const DEMO_TENANT_ID = 'DEMO_TENANT_ID';

async function runPaymentMatching(): Promise<void> {
  console.log('🚀 Starting Payment Matching Integration Test...\n');

  // Bootstrap NestJS application
  let app: INestApplication;
  try {
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    await app.init();
    console.log('✅ NestJS application bootstrapped\n');
  } catch (error) {
    console.error('❌ Failed to bootstrap NestJS application:', error);
    process.exit(1);
  }

  // Get services
  const paymentMatchingService = app.get(PaymentMatchingService);
  const prisma = app.get(PrismaService);

  try {
    // Pre-check: Display current state
    console.log('📊 Pre-matching Status:');
    const totalTransactions = await prisma.transaction.count({
      where: { tenantId: DEMO_TENANT_ID },
    });
    const creditTransactions = await prisma.transaction.count({
      where: { tenantId: DEMO_TENANT_ID, isCredit: true },
    });
    const existingPayments = await prisma.payment.count({
      where: { tenantId: DEMO_TENANT_ID },
    });
    const outstandingInvoices = await prisma.invoice.count({
      where: {
        tenantId: DEMO_TENANT_ID,
        status: { notIn: ['PAID', 'VOID'] },
      },
    });

    console.log(`   Total transactions: ${totalTransactions}`);
    console.log(`   Credit transactions: ${creditTransactions}`);
    console.log(`   Existing payments: ${existingPayments}`);
    console.log(`   Outstanding invoices: ${outstandingInvoices}\n`);

    // Get sample of credit transactions with descriptions
    console.log('📝 Sample Credit Transactions (for name matching):');
    const sampleCredits = await prisma.transaction.findMany({
      where: { tenantId: DEMO_TENANT_ID, isCredit: true },
      take: 5,
      orderBy: { amountCents: 'desc' },
    });
    for (const tx of sampleCredits) {
      console.log(`   R${(tx.amountCents / 100).toFixed(2)} | ${tx.description}`);
    }
    console.log('');

    // Run payment matching
    console.log('💰 Running Payment Matching Service...');
    const startTime = Date.now();

    const result = await paymentMatchingService.matchPayments({
      tenantId: DEMO_TENANT_ID,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`   ⏱️  Completed in ${duration}s\n`);

    // Display results
    console.log('📊 Matching Results:');
    console.log(`   ✅ Auto-applied: ${result.autoApplied}`);
    console.log(`   ⚠️  Review required: ${result.reviewRequired}`);
    console.log(`   ❌ No match: ${result.noMatch}`);
    console.log(`   📊 Total processed: ${result.processed}`);

    // Show auto-applied details
    if (result.autoApplied > 0) {
      console.log('\n📝 Auto-Applied Matches:');
      const autoAppliedResults = result.results.filter(
        (r) => r.status === 'AUTO_APPLIED' && r.appliedMatch,
      );
      for (const match of autoAppliedResults.slice(0, 10)) {
        const m = match.appliedMatch!;
        console.log(
          `   R${(m.amountCents / 100).toFixed(2)} → ${m.invoiceNumber} (${m.confidenceScore}%)`,
        );
        console.log(`      Reason: ${match.reason}`);
      }
      if (autoAppliedResults.length > 10) {
        console.log(`   ... and ${autoAppliedResults.length - 10} more`);
      }
    }

    // Show review required details (sample)
    if (result.reviewRequired > 0) {
      console.log('\n⚠️  Review Required (sample of 5):');
      const reviewResults = result.results.filter(
        (r) => r.status === 'REVIEW_REQUIRED' && r.candidates,
      );
      for (const review of reviewResults.slice(0, 5)) {
        console.log(`   Transaction ${review.transactionId.substring(0, 8)}...`);
        console.log(`      Reason: ${review.reason}`);
        if (review.candidates && review.candidates.length > 0) {
          const top = review.candidates[0];
          console.log(
            `      Top candidate: ${top.invoiceNumber} (${top.confidenceScore}%) - ${top.childName}`,
          );
          console.log(`      Match reasons: ${top.matchReasons.join(', ')}`);
        }
      }
    }

    // Post-check: Display updated state
    console.log('\n📊 Post-matching Status:');
    const newPaymentCount = await prisma.payment.count({
      where: { tenantId: DEMO_TENANT_ID },
    });
    const paidInvoices = await prisma.invoice.count({
      where: { tenantId: DEMO_TENANT_ID, status: 'PAID' },
    });
    const partiallyPaidInvoices = await prisma.invoice.count({
      where: {
        tenantId: DEMO_TENANT_ID,
        status: 'PARTIALLY_PAID',
      },
    });
    const totalPaid = await prisma.payment.aggregate({
      where: { tenantId: DEMO_TENANT_ID },
      _sum: { amountCents: true },
    });

    console.log(`   Total payments: ${newPaymentCount}`);
    console.log(`   New payments created: ${newPaymentCount - existingPayments}`);
    console.log(`   Total paid: R${((totalPaid._sum.amountCents || 0) / 100).toFixed(2)}`);
    console.log(`   Invoices fully paid: ${paidInvoices}`);
    console.log(`   Invoices partially paid: ${partiallyPaidInvoices}`);

    // Success summary
    console.log('\n✨ Payment Matching Complete!');
    if (result.autoApplied === 0 && result.reviewRequired > 0) {
      console.log('\n⚠️  Note: No auto-applied matches.');
      console.log('   This may indicate the confidence threshold (80%) was not met.');
      console.log('   Review candidates are available for manual matching.');
    }

  } catch (error) {
    console.error('\n💥 Payment matching failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

// Run the script
runPaymentMatching().catch((error) => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
