/**
 * Regression test for FNB-decline-row amount extraction.
 *
 * pdf-parse renders the FNB compact statement with the masked card number
 * glued directly onto the fee amount: "400568******2678" + "6.00" appears
 * in the extracted text as "400568******26786.00", which used to make the
 * parser pick R26,786 instead of R6 for every declined-card fee.
 *
 * The April 2026 Elle Elephant statement is the captured ground truth.
 */
import { PdfParser } from '../../../src/database/parsers/pdf-parser';

jest.mock('pdf-parse', () =>
  jest.fn(async () => ({
    text: SAMPLE_FNB_TEXT,
    numpages: 1,
  })),
);

// Real pdf-parse output for the 22 Apr 2026 FNB statement, captured from prod
// logs via FNB-RAW debug dump. Trimmed to the transaction-relevant lines plus
// the 'FNB' marker and 'Statement Period' line the parser keys off.
const SAMPLE_FNB_TEXT = `FNB
Gold Business Account : 62739960484
Statement Period : 20 March 2026 to 21 April 2026
Transactions in RAND (ZAR)
Date
DescriptionAmount
Balance
Accrued
Charges
23 Mar#Debit Card POS Unsuccessful F #Fee Declined Purch Tran 400568******26786.00198.53
28 Mar#Debit Card POS Unsuccessful F #Fee Declined Purch Tran 400568******26786.00204.53
02 Apr#Debit Card POS Unsuccessful F #Fee Declined Purch Tran 400568******26786.00210.53
07 Apr#Debit Card POS Unsuccessful F #Fee Declined Purch Tran 400568******26786.00216.53
09 Apr#Debit Card POS Unsuccessful F #Fee Declined Purch Tran 400568******26786.00222.53
13 Apr#Debit Card POS Unsuccessful F #Fee Declined Purch Tran 400568******26786.00228.53
17 Apr#Debit Card POS Unsuccessful F #Fee Declined Purch Tran 400568******26786.00234.53
21 AprInt On Debit Balance4.39238.92
21 Apr#Monthly Account Fee93.00331.92
Closing Balance331.92 Dr
`;

describe('PdfParser - FNB decline-row regression', () => {
  it('extracts R6 decline-card fees, not R26,786', async () => {
    const parser = new PdfParser();
    const buffer = Buffer.from('not-a-real-pdf');
    const txs = await parser.parse(buffer);

    const declines = txs.filter((t) => /Declined/i.test(t.description));
    expect(declines).toHaveLength(7);
    for (const tx of declines) {
      expect(tx.amountCents).toBe(600);
      expect(tx.isCredit).toBe(false);
    }

    const interest = txs.find((t) => /Int On Debit Balance/i.test(t.description));
    expect(interest?.amountCents).toBe(439);

    const fee = txs.find((t) => /Monthly Account Fee/i.test(t.description));
    expect(fee?.amountCents).toBe(9300);

    // Total debit movement should match the change in balance:
    // 192.53 -> 331.92 = +139.39, parsed sum = 7*6 + 4.39 + 93 = 139.39
    const totalCents = txs.reduce(
      (sum, t) => sum + (t.isCredit ? -t.amountCents : t.amountCents),
      0,
    );
    expect(totalCents).toBe(13939);
  });
});
