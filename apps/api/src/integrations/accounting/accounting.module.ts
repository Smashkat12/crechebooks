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
   * Uses an async factory so the provider can be resolved through
   * NestJS DI with all its dependencies properly injected.
   *
   * @example
   * ```typescript
   * AccountingModule.forRoot()
   * ```
   *
   * @returns Configured dynamic module
   */
  static forRoot(): DynamicModule {
    // Resolve provider name synchronously from env (available at import time)
    const providerName =
      (process.env.ACCOUNTING_PROVIDER as AccountingProviderType) || 'xero';

    AccountingModule.logger.log(
      `Accounting provider resolved from env: ${providerName}`,
    );

    return AccountingModule.buildModule(providerName);
  }

  /**
   * Build a dynamic module for a specific provider.
   *
   * Imports the appropriate provider-specific module (e.g. XeroModule)
   * so that all service dependencies are available for DI, then binds
   * the adapter class to the ACCOUNTING_PROVIDER token.
   *
   * @param provider - Provider type to register
   * @returns Configured dynamic module
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
   * Resolve the imports and providers needed for a specific accounting
   * provider. Returns the provider-specific module to import and the
   * DI provider binding for the ACCOUNTING_PROVIDER token.
   *
   * @param provider - Provider type identifier
   * @returns Object with imports array and providers array
   */
  private static resolveProviderDependencies(
    provider: AccountingProviderType,
  ): { imports: DynamicModule['imports']; providers: Provider[] } {
    switch (provider) {
      case 'xero': {
        // Lazy-require to avoid circular dependency at module declaration time.
        // XeroModule provides all Xero-specific services (auth, invoices, etc.)
        // that XeroAccountingAdapter depends on.
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

      case 'stub':
        // Stub.africa adapter will be added in a future task.
        AccountingModule.logger.log(
          'Stub.africa provider selected -- adapter registration pending',
        );
        return {
          imports: [],
          providers: [
            {
              provide: ACCOUNTING_PROVIDER,
              useValue: { providerName: 'stub', __pending: true },
            },
          ],
        };

      default:
        throw new Error(
          `Unknown accounting provider: '${provider}'. ` +
            `Supported providers: xero, stub`,
        );
    }
  }
}
