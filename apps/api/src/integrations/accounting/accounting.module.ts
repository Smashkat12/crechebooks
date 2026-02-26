/**
 * AccountingModule
 *
 * Dynamic NestJS module that registers the appropriate accounting provider
 * based on configuration. Supports two registration modes:
 *
 * 1. `forRoot()` -- reads `ACCOUNTING_PROVIDER` env var at bootstrap.
 * 2. `register({ provider })` -- explicitly selects a provider.
 *
 * Both modes bind the chosen provider to the `ACCOUNTING_PROVIDER`
 * injection token so the `AccountingController` (and any other consumer)
 * can remain provider-agnostic.
 *
 * Defaults to 'xero' for backwards compatibility when no env var is set.
 */

import { DynamicModule, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ACCOUNTING_PROVIDER } from './accounting-provider.token';
import { AccountingController } from './accounting.controller';

/** Supported provider identifiers. */
export type AccountingProviderType = 'xero' | 'stub';

/** Options for explicit provider registration. */
export interface AccountingModuleOptions {
  /** Which provider to use */
  provider: AccountingProviderType;
}

@Module({})
export class AccountingModule {
  private static readonly logger = new Logger(AccountingModule.name);

  /**
   * Register with an explicit provider selection.
   *
   * Use this when you want to hard-code the provider in your module
   * imports rather than relying on environment variables.
   *
   * @example
   * ```typescript
   * AccountingModule.register({ provider: 'xero' })
   * ```
   *
   * @param options - Module options including provider selection
   * @returns Configured dynamic module
   */
  static register(options: AccountingModuleOptions): DynamicModule {
    return AccountingModule.buildModule(options.provider);
  }

  /**
   * Register using the `ACCOUNTING_PROVIDER` environment variable.
   *
   * Falls back to 'xero' when the env var is not set, ensuring
   * backwards compatibility with existing deployments.
   *
   * @example
   * ```typescript
   * AccountingModule.forRoot()
   * ```
   *
   * @returns Configured dynamic module
   */
  static forRoot(): DynamicModule {
    return {
      module: AccountingModule,
      imports: [ConfigModule],
      controllers: [AccountingController],
      providers: [
        {
          provide: ACCOUNTING_PROVIDER,
          useFactory: (configService: ConfigService) => {
            const providerName =
              configService.get<string>('ACCOUNTING_PROVIDER') || 'xero';

            AccountingModule.logger.log(
              `Accounting provider resolved from env: ${providerName}`,
            );

            return AccountingModule.resolveProvider(
              providerName as AccountingProviderType,
            );
          },
          inject: [ConfigService],
        },
      ],
      exports: [ACCOUNTING_PROVIDER],
    };
  }

  /**
   * Build a dynamic module for a specific provider.
   *
   * @param provider - Provider type to register
   * @returns Configured dynamic module
   */
  private static buildModule(provider: AccountingProviderType): DynamicModule {
    AccountingModule.logger.log(
      `Registering accounting provider: ${provider}`,
    );

    return {
      module: AccountingModule,
      imports: [ConfigModule],
      controllers: [AccountingController],
      providers: [
        {
          provide: ACCOUNTING_PROVIDER,
          useFactory: () =>
            AccountingModule.resolveProvider(provider),
        },
      ],
      exports: [ACCOUNTING_PROVIDER],
    };
  }

  /**
   * Resolve a provider type to an instance placeholder.
   *
   * In a full implementation each provider would be a concrete class
   * injected via NestJS DI. For now this serves as a registry stub
   * that will be connected to real implementations when the Xero
   * adapter and Stub.africa adapter are built.
   *
   * @param provider - Provider type identifier
   * @returns A placeholder or real provider instance
   */
  private static resolveProvider(provider: AccountingProviderType): unknown {
    switch (provider) {
      case 'xero':
        // The Xero adapter will implement AccountingProvider and be
        // returned here once it wraps the existing Xero services.
        // For now, return a marker that signals Xero is selected.
        AccountingModule.logger.log(
          'Xero provider selected -- adapter registration pending',
        );
        return { providerName: 'xero', __pending: true };

      case 'stub':
        // Stub.africa adapter will be added in a future task.
        AccountingModule.logger.log(
          'Stub.africa provider selected -- adapter registration pending',
        );
        return { providerName: 'stub', __pending: true };

      default:
        throw new Error(
          `Unknown accounting provider: '${provider}'. ` +
            `Supported providers: xero, stub`,
        );
    }
  }
}
