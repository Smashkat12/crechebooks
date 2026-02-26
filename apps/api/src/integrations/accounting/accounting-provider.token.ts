/**
 * Injection token for the accounting provider.
 *
 * Use this symbol with NestJS `@Inject(ACCOUNTING_PROVIDER)` to receive
 * whichever `AccountingProvider` implementation is registered for the
 * current application configuration.
 *
 * @example
 * ```typescript
 * constructor(
 *   @Inject(ACCOUNTING_PROVIDER)
 *   private readonly accounting: AccountingProvider,
 * ) {}
 * ```
 */
export const ACCOUNTING_PROVIDER = Symbol('ACCOUNTING_PROVIDER');
