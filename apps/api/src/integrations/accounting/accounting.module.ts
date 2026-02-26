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

import { DynamicModule, Logger, Module, type Provider } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
   * @example
   * ```typescript
   * AccountingModule.register({ provider: 'xero' })
   * ```
   */
  static register(options: AccountingModuleOptions): DynamicModule {
    return AccountingModule.buildModule(options.provider);
  }

  /**
   * Register using the `ACCOUNTING_PROVIDER` environment variable.
   * Falls back to 'xero' when the env var is not set.
   */
  static forRoot(): DynamicModule {
    const providerName =
      (process.env.ACCOUNTING_PROVIDER as AccountingProviderType) || 'xero';

    AccountingModule.logger.log(
      `Accounting provider resolved from env: ${providerName}`,
    );

    return AccountingModule.buildModule(providerName);
  }

  /**
   * Build a dynamic module for a specific provider.
   * Imports the provider-specific module and binds the adapter to ACCOUNTING_PROVIDER.
   */
  private static buildModule(provider: AccountingProviderType): DynamicModule {
    AccountingModule.logger.log(
      `Registering accounting provider: ${provider}`,
    );

    const { imports, providers } =
      AccountingModule.resolveProviderDependencies(provider);

    return {
      module: AccountingModule,
      imports: [ConfigModule, ...(imports ?? [])],
      controllers: [AccountingController],
      providers: [...providers],
      exports: [ACCOUNTING_PROVIDER],
    };
  }

  /**
   * Resolve the imports and providers needed for a specific provider.
   * Uses lazy require() to avoid circular dependencies at module declaration time.
   */
  private static resolveProviderDependencies(
    provider: AccountingProviderType,
  ): { imports: DynamicModule['imports']; providers: Provider[] } {
    switch (provider) {
      case 'xero': {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { XeroModule } = require('../xero/xero.module');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { XeroAccountingAdapter } = require('../xero/xero-accounting.adapter');

        AccountingModule.logger.log(
          'Xero provider selected -- registering XeroAccountingAdapter',
        );

        return {
          imports: [XeroModule],
          providers: [
            XeroAccountingAdapter,
            {
              provide: ACCOUNTING_PROVIDER,
              useExisting: XeroAccountingAdapter,
            },
          ],
        };
      }

      case 'stub': {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { StubModule } = require('../stub/stub.module');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { StubAccountingAdapter } = require('../stub/stub-accounting.adapter');

        AccountingModule.logger.log(
          'Stub.africa provider selected -- registering StubAccountingAdapter',
        );

        return {
          imports: [StubModule],
          providers: [
            StubAccountingAdapter,
            {
              provide: ACCOUNTING_PROVIDER,
              useExisting: StubAccountingAdapter,
            },
          ],
        };
      }

      default:
        throw new Error(
          `Unknown accounting provider: '${provider}'. ` +
            `Supported providers: xero, stub`,
        );
    }
  }
}
