/**
 * Bank Fee Configuration Service
 * TXN-002: Make Bank Fee Amounts Configurable
 *
 * Provides configurable bank fee structure per tenant:
 * - Support different fee types (transaction, monthly, ATM)
 * - Allow custom fee rules based on transaction type/amount
 * - Store fee configuration in tenant settings
 * - Apply fees to transactions during import
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ValidationException,
  NotFoundException,
} from '../../shared/exceptions';

/**
 * Bank fee types supported by the system
 */
export enum BankFeeType {
  TRANSACTION_FEE = 'TRANSACTION_FEE',
  MONTHLY_FEE = 'MONTHLY_FEE',
  ATM_FEE = 'ATM_FEE',
  CASH_DEPOSIT_FEE = 'CASH_DEPOSIT_FEE',
  CARD_TRANSACTION_FEE = 'CARD_TRANSACTION_FEE',
  INTER_BANK_FEE = 'INTER_BANK_FEE',
  INSUFFICIENT_FUNDS_FEE = 'INSUFFICIENT_FUNDS_FEE',
  STATEMENT_FEE = 'STATEMENT_FEE',
  ADT_DEPOSIT_FEE = 'ADT_DEPOSIT_FEE',
  EFT_DEBIT_FEE = 'EFT_DEBIT_FEE',
  EFT_CREDIT_FEE = 'EFT_CREDIT_FEE',
  TRANSFER_FEE = 'TRANSFER_FEE',
  RTC_PAYMENT_FEE = 'RTC_PAYMENT_FEE',
  FUEL_CARD_FEE = 'FUEL_CARD_FEE',
  SEND_MONEY_FEE = 'SEND_MONEY_FEE',
}

/**
 * Transaction type for fee calculation
 */
export enum TransactionType {
  CASH_DEPOSIT = 'CASH_DEPOSIT',
  ATM_DEPOSIT = 'ATM_DEPOSIT',
  ADT_DEPOSIT = 'ADT_DEPOSIT',
  EFT_CREDIT = 'EFT_CREDIT',
  EFT_DEBIT = 'EFT_DEBIT',
  CARD_PURCHASE = 'CARD_PURCHASE',
  CASH_WITHDRAWAL = 'CASH_WITHDRAWAL',
  ATM_WITHDRAWAL = 'ATM_WITHDRAWAL',
  DEBIT_ORDER = 'DEBIT_ORDER',
  TRANSFER = 'TRANSFER',
  RTC_PAYMENT = 'RTC_PAYMENT',
  FUEL_PURCHASE = 'FUEL_PURCHASE',
  SEND_MONEY = 'SEND_MONEY',
  UNKNOWN = 'UNKNOWN',
}

/**
 * TASK-FIX-005: Supported South African banks
 */
export enum SouthAfricanBank {
  FNB = 'FNB',
  STANDARD_BANK = 'STANDARD_BANK',
  NEDBANK = 'NEDBANK',
  ABSA = 'ABSA',
  CAPITEC = 'CAPITEC',
}

/**
 * Fee rule configuration
 */
export interface FeeRule {
  id?: string;
  feeType: BankFeeType;
  transactionTypes: TransactionType[];
  fixedAmountCents: number; // Fixed fee in cents
  percentageRate?: number; // Percentage of transaction amount (0.01 = 1%)
  minimumAmountCents?: number; // Min transaction amount to apply fee
  maximumAmountCents?: number; // Max transaction amount to apply fee
  isActive: boolean;
  description?: string;
}

/**
 * Bank fee configuration for a tenant
 */
export interface BankFeeConfiguration {
  tenantId: string;
  bankName?: string;
  accountNumber?: string;
  feeRules: FeeRule[];
  defaultTransactionFeeCents: number;
  isEnabled: boolean;
  updatedAt: Date;
}

/**
 * Calculated fee result
 */
export interface CalculatedFee {
  feeType: BankFeeType;
  feeAmountCents: number;
  appliedRule: FeeRule;
  description: string;
}

/**
 * Default FNB bank fees (as of 2024) for creche/childcare businesses
 * These can be overridden by tenant configuration
 */
const DEFAULT_FNB_FEES: FeeRule[] = [
  {
    feeType: BankFeeType.ADT_DEPOSIT_FEE,
    transactionTypes: [TransactionType.ADT_DEPOSIT],
    fixedAmountCents: 1470, // R14.70
    isActive: true,
    description: 'FNB ADT Cash Deposit fee',
  },
  {
    feeType: BankFeeType.CASH_DEPOSIT_FEE,
    transactionTypes: [TransactionType.CASH_DEPOSIT],
    fixedAmountCents: 1470, // R14.70
    isActive: true,
    description: 'FNB Cash Deposit fee',
  },
  {
    feeType: BankFeeType.ATM_FEE,
    transactionTypes: [TransactionType.ATM_DEPOSIT],
    fixedAmountCents: 500, // R5.00
    isActive: true,
    description: 'FNB ATM Deposit fee',
  },
  {
    feeType: BankFeeType.ATM_FEE,
    transactionTypes: [TransactionType.ATM_WITHDRAWAL],
    fixedAmountCents: 1200, // R12.00
    isActive: true,
    description: 'FNB ATM Withdrawal fee',
  },
  {
    feeType: BankFeeType.EFT_DEBIT_FEE,
    transactionTypes: [TransactionType.EFT_DEBIT, TransactionType.DEBIT_ORDER],
    fixedAmountCents: 470, // R4.70
    isActive: true,
    description: 'FNB EFT Debit/Debit Order fee',
  },
  {
    feeType: BankFeeType.EFT_CREDIT_FEE,
    transactionTypes: [TransactionType.EFT_CREDIT],
    fixedAmountCents: 575, // R5.75 (incoming EFT received)
    isActive: true,
    description: 'FNB EFT Credit (incoming payment) fee',
  },
  {
    feeType: BankFeeType.TRANSFER_FEE,
    transactionTypes: [TransactionType.TRANSFER],
    fixedAmountCents: 940, // R9.40 (outgoing transfer)
    isActive: true,
    description: 'FNB Transfer/Outgoing EFT fee',
  },
  {
    feeType: BankFeeType.CARD_TRANSACTION_FEE,
    transactionTypes: [TransactionType.CARD_PURCHASE],
    fixedAmountCents: 545, // R5.45
    isActive: true,
    description: 'FNB Card Transaction fee',
  },
  {
    feeType: BankFeeType.RTC_PAYMENT_FEE,
    transactionTypes: [TransactionType.RTC_PAYMENT],
    fixedAmountCents: 800, // R8.00
    isActive: true,
    description: 'FNB Real-Time Clearing (RTC) payment fee',
  },
  {
    feeType: BankFeeType.FUEL_CARD_FEE,
    transactionTypes: [TransactionType.FUEL_PURCHASE],
    fixedAmountCents: 625, // R6.25
    isActive: true,
    description: 'FNB Fuel card transaction fee',
  },
  {
    feeType: BankFeeType.SEND_MONEY_FEE,
    transactionTypes: [TransactionType.SEND_MONEY],
    fixedAmountCents: 700, // R7.00 base fee
    percentageRate: 0.02, // ~2% of transaction amount
    isActive: true,
    description: 'FNB Send Money (eWallet/App) fee',
  },
];

/**
 * TASK-FIX-005: Standard Bank fees (as of 2024)
 */
const DEFAULT_STANDARD_BANK_FEES: FeeRule[] = [
  {
    feeType: BankFeeType.CASH_DEPOSIT_FEE,
    transactionTypes: [
      TransactionType.CASH_DEPOSIT,
      TransactionType.ADT_DEPOSIT,
    ],
    fixedAmountCents: 1350,
    isActive: true,
    description: 'Standard Bank Cash Deposit fee',
  },
  {
    feeType: BankFeeType.ATM_FEE,
    transactionTypes: [TransactionType.ATM_DEPOSIT],
    fixedAmountCents: 450,
    isActive: true,
    description: 'Standard Bank ATM Deposit fee',
  },
  {
    feeType: BankFeeType.ATM_FEE,
    transactionTypes: [TransactionType.ATM_WITHDRAWAL],
    fixedAmountCents: 1100,
    isActive: true,
    description: 'Standard Bank ATM Withdrawal fee',
  },
  {
    feeType: BankFeeType.EFT_DEBIT_FEE,
    transactionTypes: [TransactionType.EFT_DEBIT, TransactionType.DEBIT_ORDER],
    fixedAmountCents: 450,
    isActive: true,
    description: 'Standard Bank EFT Debit fee',
  },
  {
    feeType: BankFeeType.EFT_CREDIT_FEE,
    transactionTypes: [TransactionType.EFT_CREDIT, TransactionType.TRANSFER],
    fixedAmountCents: 850,
    isActive: true,
    description: 'Standard Bank EFT Credit fee',
  },
  {
    feeType: BankFeeType.CARD_TRANSACTION_FEE,
    transactionTypes: [TransactionType.CARD_PURCHASE],
    fixedAmountCents: 500,
    isActive: true,
    description: 'Standard Bank Card Transaction fee',
  },
];

/**
 * TASK-FIX-005: Nedbank fees (as of 2024)
 */
const DEFAULT_NEDBANK_FEES: FeeRule[] = [
  {
    feeType: BankFeeType.CASH_DEPOSIT_FEE,
    transactionTypes: [
      TransactionType.CASH_DEPOSIT,
      TransactionType.ADT_DEPOSIT,
    ],
    fixedAmountCents: 1400,
    isActive: true,
    description: 'Nedbank Cash Deposit fee',
  },
  {
    feeType: BankFeeType.ATM_FEE,
    transactionTypes: [TransactionType.ATM_DEPOSIT],
    fixedAmountCents: 500,
    isActive: true,
    description: 'Nedbank ATM Deposit fee',
  },
  {
    feeType: BankFeeType.ATM_FEE,
    transactionTypes: [TransactionType.ATM_WITHDRAWAL],
    fixedAmountCents: 1150,
    isActive: true,
    description: 'Nedbank ATM Withdrawal fee',
  },
  {
    feeType: BankFeeType.EFT_DEBIT_FEE,
    transactionTypes: [TransactionType.EFT_DEBIT, TransactionType.DEBIT_ORDER],
    fixedAmountCents: 500,
    isActive: true,
    description: 'Nedbank EFT Debit fee',
  },
  {
    feeType: BankFeeType.EFT_CREDIT_FEE,
    transactionTypes: [TransactionType.EFT_CREDIT, TransactionType.TRANSFER],
    fixedAmountCents: 900,
    isActive: true,
    description: 'Nedbank EFT Credit fee',
  },
  {
    feeType: BankFeeType.CARD_TRANSACTION_FEE,
    transactionTypes: [TransactionType.CARD_PURCHASE],
    fixedAmountCents: 525,
    isActive: true,
    description: 'Nedbank Card Transaction fee',
  },
];

/**
 * TASK-FIX-005: ABSA fees (as of 2024)
 */
const DEFAULT_ABSA_FEES: FeeRule[] = [
  {
    feeType: BankFeeType.CASH_DEPOSIT_FEE,
    transactionTypes: [
      TransactionType.CASH_DEPOSIT,
      TransactionType.ADT_DEPOSIT,
    ],
    fixedAmountCents: 1450,
    isActive: true,
    description: 'ABSA Cash Deposit fee',
  },
  {
    feeType: BankFeeType.ATM_FEE,
    transactionTypes: [TransactionType.ATM_DEPOSIT],
    fixedAmountCents: 550,
    isActive: true,
    description: 'ABSA ATM Deposit fee',
  },
  {
    feeType: BankFeeType.ATM_FEE,
    transactionTypes: [TransactionType.ATM_WITHDRAWAL],
    fixedAmountCents: 1200,
    isActive: true,
    description: 'ABSA ATM Withdrawal fee',
  },
  {
    feeType: BankFeeType.EFT_DEBIT_FEE,
    transactionTypes: [TransactionType.EFT_DEBIT, TransactionType.DEBIT_ORDER],
    fixedAmountCents: 475,
    isActive: true,
    description: 'ABSA EFT Debit fee',
  },
  {
    feeType: BankFeeType.EFT_CREDIT_FEE,
    transactionTypes: [TransactionType.EFT_CREDIT, TransactionType.TRANSFER],
    fixedAmountCents: 925,
    isActive: true,
    description: 'ABSA EFT Credit fee',
  },
  {
    feeType: BankFeeType.CARD_TRANSACTION_FEE,
    transactionTypes: [TransactionType.CARD_PURCHASE],
    fixedAmountCents: 550,
    isActive: true,
    description: 'ABSA Card Transaction fee',
  },
];

/**
 * TASK-FIX-005: Capitec fees (as of 2024) - typically lower fees
 */
const DEFAULT_CAPITEC_FEES: FeeRule[] = [
  {
    feeType: BankFeeType.CASH_DEPOSIT_FEE,
    transactionTypes: [
      TransactionType.CASH_DEPOSIT,
      TransactionType.ADT_DEPOSIT,
    ],
    fixedAmountCents: 0,
    isActive: true,
    description: 'Capitec Cash Deposit fee (free at Capitec ATMs)',
  },
  {
    feeType: BankFeeType.ATM_FEE,
    transactionTypes: [TransactionType.ATM_DEPOSIT],
    fixedAmountCents: 0,
    isActive: true,
    description: 'Capitec ATM Deposit fee (free)',
  },
  {
    feeType: BankFeeType.ATM_FEE,
    transactionTypes: [TransactionType.ATM_WITHDRAWAL],
    fixedAmountCents: 0,
    isActive: true,
    description: 'Capitec ATM Withdrawal fee (free at Capitec ATMs)',
  },
  {
    feeType: BankFeeType.EFT_DEBIT_FEE,
    transactionTypes: [TransactionType.EFT_DEBIT, TransactionType.DEBIT_ORDER],
    fixedAmountCents: 0,
    isActive: true,
    description: 'Capitec EFT Debit fee (free)',
  },
  {
    feeType: BankFeeType.EFT_CREDIT_FEE,
    transactionTypes: [TransactionType.EFT_CREDIT, TransactionType.TRANSFER],
    fixedAmountCents: 0,
    isActive: true,
    description: 'Capitec EFT Credit fee (free)',
  },
  {
    feeType: BankFeeType.CARD_TRANSACTION_FEE,
    transactionTypes: [TransactionType.CARD_PURCHASE],
    fixedAmountCents: 0,
    isActive: true,
    description: 'Capitec Card Transaction fee (free)',
  },
];

@Injectable()
export class BankFeeService {
  private readonly logger = new Logger(BankFeeService.name);

  // In-memory cache for fee configurations
  private configCache: Map<string, BankFeeConfiguration> = new Map();
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly prisma: PrismaService) {}

  /**
   * TASK-FIX-005: Get or create bank fee configuration for a tenant
   * Now loads from database bankFeeConfig JSON field
   */
  async getConfiguration(tenantId: string): Promise<BankFeeConfiguration> {
    // Check cache first
    const cached = this.configCache.get(tenantId);
    if (cached && Date.now() - cached.updatedAt.getTime() < this.cacheTtlMs) {
      return cached;
    }

    // Load from tenant settings
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        bankName: true,
        bankFeeConfig: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant', tenantId);
    }

    // Check if there's stored configuration
    if (tenant.bankFeeConfig) {
      const storedConfig =
        tenant.bankFeeConfig as unknown as BankFeeConfiguration;
      storedConfig.tenantId = tenantId;
      storedConfig.updatedAt = new Date();
      this.configCache.set(tenantId, storedConfig);
      return storedConfig;
    }

    // Return default configuration based on tenant's bank
    const bankName = tenant.bankName || 'FNB';
    const config: BankFeeConfiguration = {
      tenantId,
      bankName,
      feeRules: this.getDefaultFeeRules(bankName),
      defaultTransactionFeeCents: 500,
      isEnabled: true,
      updatedAt: new Date(),
    };

    this.configCache.set(tenantId, config);
    return config;
  }

  /**
   * Update bank fee configuration for a tenant
   */
  async updateConfiguration(
    tenantId: string,
    updates: Partial<BankFeeConfiguration>,
  ): Promise<BankFeeConfiguration> {
    // Validate tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant', tenantId);
    }

    // Validate fee rules
    if (updates.feeRules) {
      this.validateFeeRules(updates.feeRules);
    }

    // Get current config and merge
    const currentConfig = await this.getConfiguration(tenantId);
    const newConfig: BankFeeConfiguration = {
      ...currentConfig,
      ...updates,
      tenantId,
      updatedAt: new Date(),
    };

    // Store in cache (in production, persist to database)
    this.configCache.set(tenantId, newConfig);

    this.logger.log(
      `Updated bank fee configuration for tenant ${tenantId}: ${newConfig.feeRules.length} rules`,
    );

    return newConfig;
  }

  /**
   * Add a custom fee rule to tenant configuration
   */
  async addFeeRule(tenantId: string, rule: FeeRule): Promise<FeeRule> {
    this.validateFeeRules([rule]);

    const config = await this.getConfiguration(tenantId);

    // Generate ID for rule
    const ruleWithId: FeeRule = {
      ...rule,
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    config.feeRules.push(ruleWithId);
    config.updatedAt = new Date();

    this.configCache.set(tenantId, config);

    this.logger.log(
      `Added fee rule ${ruleWithId.id} for tenant ${tenantId}: ${ruleWithId.feeType}`,
    );

    return ruleWithId;
  }

  /**
   * Remove a fee rule from tenant configuration
   */
  async removeFeeRule(tenantId: string, ruleId: string): Promise<void> {
    const config = await this.getConfiguration(tenantId);

    const ruleIndex = config.feeRules.findIndex((r) => r.id === ruleId);
    if (ruleIndex === -1) {
      throw new NotFoundException('FeeRule', ruleId);
    }

    config.feeRules.splice(ruleIndex, 1);
    config.updatedAt = new Date();

    this.configCache.set(tenantId, config);

    this.logger.log(`Removed fee rule ${ruleId} for tenant ${tenantId}`);
  }

  /**
   * Calculate applicable fees for a transaction
   */
  async calculateFees(
    tenantId: string,
    transactionType: TransactionType,
    amountCents: number,
  ): Promise<CalculatedFee[]> {
    const config = await this.getConfiguration(tenantId);

    if (!config.isEnabled) {
      return [];
    }

    const applicableFees: CalculatedFee[] = [];

    for (const rule of config.feeRules) {
      if (!rule.isActive) {
        continue;
      }

      if (!rule.transactionTypes.includes(transactionType)) {
        continue;
      }

      // Check amount thresholds
      if (
        rule.minimumAmountCents !== undefined &&
        amountCents < rule.minimumAmountCents
      ) {
        continue;
      }

      if (
        rule.maximumAmountCents !== undefined &&
        amountCents > rule.maximumAmountCents
      ) {
        continue;
      }

      // Calculate fee amount
      let feeAmountCents = rule.fixedAmountCents;

      if (rule.percentageRate !== undefined && rule.percentageRate > 0) {
        const percentageFee = Math.round(amountCents * rule.percentageRate);
        feeAmountCents += percentageFee;
      }

      applicableFees.push({
        feeType: rule.feeType,
        feeAmountCents,
        appliedRule: rule,
        description: rule.description || `Bank fee: ${rule.feeType}`,
      });
    }

    return applicableFees;
  }

  /**
   * Detect transaction type from description/reference
   */
  detectTransactionType(
    description: string,
    payeeName?: string | null,
    reference?: string | null,
  ): TransactionType {
    const text =
      `${description} ${payeeName || ''} ${reference || ''}`.toUpperCase();

    // ADT Deposit patterns
    if (/ADT\s*(CASH\s*)?DEP/i.test(text)) {
      return TransactionType.ADT_DEPOSIT;
    }

    // ATM patterns
    if (/ATM\s*DEP/i.test(text)) {
      return TransactionType.ATM_DEPOSIT;
    }
    if (/ATM\s*(WITHDRAWAL|W\/D|WDL)/i.test(text)) {
      return TransactionType.ATM_WITHDRAWAL;
    }

    // Cash deposit
    if (/CASH\s*DEP/i.test(text)) {
      return TransactionType.CASH_DEPOSIT;
    }
    if (/CASH\s*(WITHDRAWAL|W\/D)/i.test(text)) {
      return TransactionType.CASH_WITHDRAWAL;
    }

    // RTC (Real-Time Clearing) payments — must match before generic PAYMENT
    if (/RTC\s*(CR|CREDIT|PMT|PAYMENT)?/i.test(text) || /REAL[\s-]*TIME\s*CLEAR/i.test(text)) {
      return TransactionType.RTC_PAYMENT;
    }

    // EFT patterns
    if (/(EFT|ACB|NAEDO)\s*(CR|CREDIT)/i.test(text)) {
      return TransactionType.EFT_CREDIT;
    }
    if (/(EFT|ACB|NAEDO)\s*(DR|DEBIT)/i.test(text)) {
      return TransactionType.EFT_DEBIT;
    }

    // Debit order
    if (/DEBIT\s*ORDER|D\/O|MAGTAPE/i.test(text)) {
      return TransactionType.DEBIT_ORDER;
    }

    // Fuel card transactions — must match before generic CARD/POS
    if (/FUEL|PETROL|DIESEL|ENGEN|SHELL|CALTEX|SASOL|BP\s/i.test(text)) {
      return TransactionType.FUEL_PURCHASE;
    }

    // Card transactions
    if (/CARD|POS|MASTERCARD|VISA/i.test(text)) {
      return TransactionType.CARD_PURCHASE;
    }

    // FNB Send Money (eWallet/App) — must match before generic PAYMENT
    if (/SEND\s*MONEY/i.test(text) || /E[\s-]*WALLET/i.test(text)) {
      return TransactionType.SEND_MONEY;
    }

    // Transfer
    if (/TRANSFER|TRF|PAYMENT/i.test(text)) {
      return TransactionType.TRANSFER;
    }

    return TransactionType.UNKNOWN;
  }

  /**
   * Get total fees for a transaction based on detected type
   */
  async getTotalFeeForTransaction(
    tenantId: string,
    description: string,
    amountCents: number,
    payeeName?: string | null,
    reference?: string | null,
  ): Promise<number> {
    const transactionType = this.detectTransactionType(
      description,
      payeeName,
      reference,
    );

    const fees = await this.calculateFees(
      tenantId,
      transactionType,
      amountCents,
    );

    return fees.reduce((total, fee) => total + fee.feeAmountCents, 0);
  }

  /**
   * Validate fee rules
   */
  private validateFeeRules(rules: FeeRule[]): void {
    const errors: Array<{ field: string; message: string }> = [];

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];

      if (rule.fixedAmountCents < 0) {
        errors.push({
          field: `rules[${i}].fixedAmountCents`,
          message: 'Fixed amount cannot be negative',
        });
      }

      if (
        rule.percentageRate !== undefined &&
        (rule.percentageRate < 0 || rule.percentageRate > 1)
      ) {
        errors.push({
          field: `rules[${i}].percentageRate`,
          message: 'Percentage rate must be between 0 and 1',
        });
      }

      if (rule.transactionTypes.length === 0) {
        errors.push({
          field: `rules[${i}].transactionTypes`,
          message: 'At least one transaction type is required',
        });
      }

      if (
        rule.minimumAmountCents !== undefined &&
        rule.maximumAmountCents !== undefined &&
        rule.minimumAmountCents > rule.maximumAmountCents
      ) {
        errors.push({
          field: `rules[${i}].minimumAmountCents`,
          message: 'Minimum amount cannot exceed maximum amount',
        });
      }
    }

    if (errors.length > 0) {
      throw new ValidationException('Invalid fee rules', errors);
    }
  }

  /**
   * Clear configuration cache for a tenant
   */
  clearCache(tenantId?: string): void {
    if (tenantId) {
      this.configCache.delete(tenantId);
    } else {
      this.configCache.clear();
    }
  }

  /**
   * TASK-FIX-005: Get default fee rules for a bank
   * Now supports all major South African banks
   */
  getDefaultFeeRules(bankName: string = 'FNB'): FeeRule[] {
    const normalizedBank = bankName.toUpperCase().replace(/\s+/g, '_');

    switch (normalizedBank) {
      case 'FNB':
      case 'FIRST_NATIONAL_BANK':
        return [...DEFAULT_FNB_FEES];
      case 'STANDARD_BANK':
        return [...DEFAULT_STANDARD_BANK_FEES];
      case 'NEDBANK':
        return [...DEFAULT_NEDBANK_FEES];
      case 'ABSA':
        return [...DEFAULT_ABSA_FEES];
      case 'CAPITEC':
        return [...DEFAULT_CAPITEC_FEES];
      default:
        return [
          {
            feeType: BankFeeType.TRANSACTION_FEE,
            transactionTypes: Object.values(TransactionType),
            fixedAmountCents: 500,
            isActive: true,
            description: 'Generic transaction fee',
          },
        ];
    }
  }

  /**
   * TASK-FIX-005: Get list of supported banks
   */
  getSupportedBanks(): { code: SouthAfricanBank; name: string }[] {
    return [
      { code: SouthAfricanBank.FNB, name: 'First National Bank (FNB)' },
      { code: SouthAfricanBank.STANDARD_BANK, name: 'Standard Bank' },
      { code: SouthAfricanBank.NEDBANK, name: 'Nedbank' },
      { code: SouthAfricanBank.ABSA, name: 'ABSA' },
      { code: SouthAfricanBank.CAPITEC, name: 'Capitec' },
    ];
  }

  /**
   * TASK-FIX-005: Save bank fee configuration for a tenant
   */
  async saveConfiguration(
    tenantId: string,
    config: Partial<BankFeeConfiguration>,
  ): Promise<BankFeeConfiguration> {
    const currentConfig = await this.getConfiguration(tenantId);
    const newConfig: BankFeeConfiguration = {
      ...currentConfig,
      ...config,
      tenantId,
      updatedAt: new Date(),
    };

    // Validate fee rules
    if (newConfig.feeRules) {
      this.validateFeeRules(newConfig.feeRules);
    }

    // Save to database
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        bankFeeConfig: newConfig as unknown as Prisma.JsonObject,
        ...(config.bankName && { bankName: config.bankName }),
      },
    });

    // Update cache
    this.configCache.set(tenantId, newConfig);

    this.logger.log(
      `Saved bank fee configuration for tenant ${tenantId}: ${newConfig.bankName}`,
    );

    return newConfig;
  }

  /**
   * TASK-FIX-005: Apply bank preset to tenant
   */
  async applyBankPreset(
    tenantId: string,
    bankCode: SouthAfricanBank,
  ): Promise<BankFeeConfiguration> {
    const bankName =
      this.getSupportedBanks().find((b) => b.code === bankCode)?.name ||
      bankCode;
    const feeRules = this.getDefaultFeeRules(bankCode);

    return this.saveConfiguration(tenantId, {
      bankName,
      feeRules,
      isEnabled: true,
    });
  }
}
