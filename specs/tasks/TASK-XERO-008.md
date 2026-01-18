<task_spec id="TASK-XERO-008" version="2.0">

<metadata>
  <title>Implement Distributed Rate Limiting for Xero API</title>
  <status>ready</status>
  <layer>integration</layer>
  <sequence>184</sequence>
  <implements>
    <requirement_ref>REQ-XERO-RATELIMIT-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-XERO-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-01-17</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Modify:**
  - `apps/api/src/integrations/xero/xero-journal.service.ts`
  - `apps/api/src/integrations/xero/xero-journal.errors.ts`
  - `apps/api/src/integrations/xero/bank-feed.service.ts`

  **Current Problem:**
  Rate limiting is handled per-instance (in-memory). In a multi-instance deployment:
  1. Each instance tracks its own rate limit counter
  2. Total API calls across instances can exceed Xero limits
  3. Results in 429 errors and degraded service

  **Xero API Rate Limits:**
  - 60 calls per minute per tenant (app level)
  - 5,000 calls per day per tenant
  - Rate limit headers: X-Rate-Limit-Problem, Retry-After

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Redis Rate Limiter Pattern
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';
  import { Redis } from 'ioredis';
  import { ConfigService } from '@nestjs/config';

  @Injectable()
  export class XeroRateLimiter {
    private readonly logger = new Logger(XeroRateLimiter.name);
    private redis: Redis;

    constructor(private readonly configService: ConfigService) {
      this.redis = new Redis(this.configService.get('REDIS_URL'));
    }

    /**
     * Check if request can proceed, decrement available quota
     * Uses sliding window rate limiting with Redis
     */
    async acquireSlot(tenantId: string): Promise<{
      allowed: boolean;
      remaining: number;
      retryAfter?: number;
    }> {
      const key = `xero:rate:${tenantId}`;
      const limit = 60; // per minute
      const window = 60; // seconds

      const multi = this.redis.multi();
      const now = Date.now();
      const windowStart = now - (window * 1000);

      // Remove old entries
      multi.zremrangebyscore(key, 0, windowStart);
      // Count current entries
      multi.zcard(key);
      // Add new entry
      multi.zadd(key, now, `${now}`);
      // Set expiry
      multi.expire(key, window);

      const results = await multi.exec();
      const currentCount = results?.[1]?.[1] as number || 0;

      if (currentCount >= limit) {
        const oldestEntry = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
        const retryAfter = oldestEntry.length > 1
          ? Math.ceil((parseInt(oldestEntry[1]) + (window * 1000) - now) / 1000)
          : window;

        return { allowed: false, remaining: 0, retryAfter };
      }

      return { allowed: true, remaining: limit - currentCount - 1 };
    }

    async releaseSlot(tenantId: string): Promise<void> {
      // For cleanup if request fails before being counted
      const key = `xero:rate:${tenantId}`;
      const now = Date.now();
      await this.redis.zrem(key, `${now}`);
    }
  }
  ```

  ### 3. Integration Pattern
  ```typescript
  async createJournal(dto: CreateJournalDto): Promise<JournalResponseDto> {
    // Acquire rate limit slot BEFORE making API call
    const rateLimit = await this.rateLimiter.acquireSlot(dto.tenantId);

    if (!rateLimit.allowed) {
      throw new XeroRateLimitError(
        rateLimit.retryAfter || 60,
        0,
        rateLimit.remaining
      );
    }

    try {
      // Make Xero API call
      const response = await this.httpService.post(url, payload, { headers });
      return this.mapResponse(response.data);
    } catch (error) {
      // Handle 429 response from Xero
      if (isXeroRateLimitError(error)) {
        const retryAfter = extractRetryAfter(error);
        throw new XeroRateLimitError(retryAfter, 0, 0);
      }
      throw error;
    }
  }
  ```

  ### 4. Fallback Pattern (No Redis)
  ```typescript
  // If Redis unavailable, fall back to in-memory with warning
  private inMemoryFallback: Map<string, number[]> = new Map();

  async acquireSlot(tenantId: string): Promise<RateLimitResult> {
    if (!this.redis.status === 'ready') {
      this.logger.warn('Redis unavailable, using in-memory rate limiting');
      return this.acquireSlotInMemory(tenantId);
    }
    // ... Redis implementation
  }
  ```

  ### 5. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task implements distributed rate limiting for Xero API calls using Redis as a shared state store. This ensures that rate limits are respected across multiple application instances.

**Key Features:**
1. Sliding window rate limiting (more accurate than fixed windows)
2. Redis-based shared state for multi-instance deployments
3. Graceful fallback to in-memory when Redis unavailable
4. Proper Retry-After header handling
5. Per-tenant rate tracking

**Architecture:**
- XeroRateLimiter service (new)
- Integration with XeroJournalService
- Integration with XeroBankFeedService
- Redis connection via existing infrastructure
</context>

<scope>
  <in_scope>
    - Create XeroRateLimiter service with Redis backend
    - Implement sliding window rate limiting algorithm
    - Add rate limit check before each Xero API call
    - Handle Xero 429 responses and Retry-After header
    - Add fallback to in-memory rate limiting when Redis unavailable
    - Update XeroJournalService to use rate limiter
    - Update XeroBankFeedService to use rate limiter
    - Add comprehensive tests for rate limiting logic
  </in_scope>
  <out_of_scope>
    - Daily rate limit tracking (5,000/day - separate task)
    - Rate limit dashboard/monitoring UI
    - Redis cluster setup (ops task)
    - Circuit breaker pattern (separate task)
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Create rate limiter service
# Create apps/api/src/integrations/xero/xero-rate-limiter.service.ts

# 2. Update Xero services
# Edit apps/api/src/integrations/xero/xero-journal.service.ts
# Edit apps/api/src/integrations/xero/bank-feed.service.ts

# 3. Update module
# Edit apps/api/src/integrations/xero/xero.module.ts

# 4. Create tests
# Create apps/api/tests/integrations/xero/xero-rate-limiter.service.spec.ts

# 5. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing

# 6. Run specific tests
pnpm test -- xero-rate-limiter --runInBand
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Rate limit: 60 requests per minute per tenant
    - Sliding window algorithm (not fixed window)
    - Redis-based for distributed deployments
    - Graceful fallback to in-memory
    - Thread-safe implementation
    - Proper cleanup on process shutdown
    - Must not affect performance (< 5ms overhead)
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: Rate limit enforced at 60/min
    - Test: Sliding window works correctly
    - Test: Redis connection failure fallback
    - Test: Retry-After calculation correct
    - Test: Multi-tenant isolation
    - Test: Performance overhead < 5ms
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Use fixed window rate limiting (use sliding window)
  - Store rate limit state in application memory only
  - Block indefinitely on rate limit (return error with Retry-After)
  - Share rate limit across tenants
  - Ignore Redis connection errors (must fallback gracefully)
  - Use setTimeout for rate limit delays (client should retry)
</anti_patterns>

</task_spec>
