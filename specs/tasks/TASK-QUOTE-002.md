<task_spec id="TASK-QUOTE-002" version="2.0">

<metadata>
  <title>Quote Public Acceptance Portal</title>
  <status>ready</status>
  <layer>api</layer>
  <sequence>422</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-ACCT-QUOTE-004</requirement_ref>
    <requirement_ref>REQ-ACCT-QUOTE-005</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="pending">TASK-QUOTE-001</task_ref>
    <task_ref status="complete">TASK-ACCT-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>5 hours</estimated_effort>
  <last_updated>2026-02-03</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/api/src/api/public/public-quote.controller.ts` (NEW)
  - `apps/api/src/api/public/public-quote.module.ts` (NEW)
  - `apps/api/src/api/public/dto/quote-action.dto.ts` (NEW)
  - `apps/api/tests/api/public/public-quote.controller.spec.ts` (NEW)
  - `apps/web/src/app/quote/[token]/page.tsx` (NEW - Next.js page)
  - `apps/web/src/app/quote/[token]/accept/page.tsx` (NEW)
  - `apps/web/src/app/quote/[token]/decline/page.tsx` (NEW)

  **Files to Modify:**
  - `apps/api/src/app.module.ts` (import PublicQuoteModule)
  - `apps/api/src/database/services/quote.service.ts` (add token-based methods)

  **Current Problem:**
  After TASK-QUOTE-001, quotes are sent via email with viewToken and action URLs.
  However, there is no:
  - Public API endpoint to view quote by token
  - Public API endpoints to accept/decline quote by token
  - Frontend pages for recipients to view and act on quotes
  - Quote-to-invoice conversion trigger on acceptance

  **Quote Lifecycle States:**
  - DRAFT -> SENT (via sendQuote with viewToken)
  - SENT -> VIEWED (when recipient opens public page)
  - VIEWED -> ACCEPTED (recipient accepts)
  - VIEWED -> DECLINED (recipient declines with optional reason)
  - ACCEPTED -> CONVERTED (quote converted to enrollment/invoice)
  - SENT/VIEWED -> EXPIRED (automatic after expiryDate)

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Public Quote Controller (No Auth Required)
  ```typescript
  // apps/api/src/api/public/public-quote.controller.ts
  import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    HttpCode,
    HttpStatus,
    Logger,
  } from '@nestjs/common';
  import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiParam,
  } from '@nestjs/swagger';
  import { QuoteService } from '../../database/services/quote.service';
  import { DeclineQuoteDto, AcceptQuoteDto } from './dto/quote-action.dto';

  /**
   * Public endpoints for quote recipients
   * NO AUTHENTICATION REQUIRED - Access controlled by viewToken
   */
  @ApiTags('Public - Quotes')
  @Controller('public/quotes')
  export class PublicQuoteController {
    private readonly logger = new Logger(PublicQuoteController.name);

    constructor(private readonly quoteService: QuoteService) {}

    @Get(':token')
    @ApiOperation({ summary: 'View quote by token (public access)' })
    @ApiParam({ name: 'token', description: 'Quote view token (UUID)' })
    @ApiResponse({ status: 200, description: 'Quote details for recipient' })
    @ApiResponse({ status: 404, description: 'Quote not found or expired' })
    async getQuoteByToken(@Param('token') token: string) {
      this.logger.log(`Public quote view: token=${token.substring(0, 8)}...`);
      return this.quoteService.getQuoteByViewToken(token);
    }

    @Post(':token/accept')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Accept quote (public access)' })
    @ApiParam({ name: 'token', description: 'Quote view token (UUID)' })
    @ApiResponse({ status: 200, description: 'Quote accepted' })
    @ApiResponse({ status: 400, description: 'Quote cannot be accepted' })
    @ApiResponse({ status: 404, description: 'Quote not found' })
    async acceptQuote(
      @Param('token') token: string,
      @Body() body: AcceptQuoteDto,
    ) {
      this.logger.log(`Public quote accept: token=${token.substring(0, 8)}...`);
      return this.quoteService.acceptQuoteByToken(token, body.confirmedBy);
    }

    @Post(':token/decline')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Decline quote (public access)' })
    @ApiParam({ name: 'token', description: 'Quote view token (UUID)' })
    @ApiResponse({ status: 200, description: 'Quote declined' })
    @ApiResponse({ status: 400, description: 'Quote cannot be declined' })
    @ApiResponse({ status: 404, description: 'Quote not found' })
    async declineQuote(
      @Param('token') token: string,
      @Body() body: DeclineQuoteDto,
    ) {
      this.logger.log(`Public quote decline: token=${token.substring(0, 8)}...`);
      return this.quoteService.declineQuoteByToken(token, body.reason);
    }
  }
  ```

  ### 3. DTOs for Public Actions
  ```typescript
  // apps/api/src/api/public/dto/quote-action.dto.ts
  import { IsString, IsOptional, IsEmail, MaxLength } from 'class-validator';
  import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

  export class AcceptQuoteDto {
    @ApiProperty({ description: 'Name of person accepting the quote' })
    @IsString()
    @MaxLength(200)
    confirmedBy: string;

    @ApiPropertyOptional({ description: 'Email for confirmation receipt' })
    @IsOptional()
    @IsEmail()
    email?: string;
  }

  export class DeclineQuoteDto {
    @ApiPropertyOptional({ description: 'Reason for declining', maxLength: 500 })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string;
  }

  export interface PublicQuoteResponse {
    quoteNumber: string;
    recipientName: string;
    childName: string | null;
    expectedStartDate: Date | null;
    quoteDate: Date;
    expiryDate: Date;
    validityDays: number;
    subtotalCents: number;
    vatAmountCents: number;
    totalCents: number;
    status: string;
    isExpired: boolean;
    canAccept: boolean;
    canDecline: boolean;
    lines: Array<{
      description: string;
      quantity: number;
      unitPriceCents: number;
      lineTotalCents: number;
    }>;
    tenant: {
      name: string;
      phone: string;
      email: string;
    };
  }
  ```

  ### 4. QuoteService Token-Based Methods
  ```typescript
  // Add to apps/api/src/database/services/quote.service.ts

  /**
   * Get quote by view token (public access)
   * Also marks as VIEWED if currently SENT
   */
  async getQuoteByViewToken(viewToken: string): Promise<PublicQuoteResponse> {
    const quote = await this.prisma.quote.findUnique({
      where: { viewToken },
      include: {
        lines: { orderBy: { lineNumber: 'asc' } },
        tenant: {
          select: {
            name: true,
            tradingName: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    if (!quote) {
      throw new NotFoundException('Quote not found or link expired');
    }

    // Check if expired
    const isExpired = quote.expiryDate < new Date();

    // Auto-expire if needed
    if (isExpired && ['SENT', 'VIEWED'].includes(quote.status)) {
      await this.prisma.quote.update({
        where: { id: quote.id },
        data: { status: 'EXPIRED' },
      });
      quote.status = 'EXPIRED';
    }

    // Mark as viewed if first view
    if (quote.status === 'SENT' && !quote.viewedAt) {
      await this.prisma.quote.update({
        where: { id: quote.id },
        data: {
          status: 'VIEWED',
          viewedAt: new Date(),
        },
      });
      quote.status = 'VIEWED';
      quote.viewedAt = new Date();
    }

    const canAccept = ['SENT', 'VIEWED'].includes(quote.status) && !isExpired;
    const canDecline = ['SENT', 'VIEWED'].includes(quote.status);

    return {
      quoteNumber: quote.quoteNumber,
      recipientName: quote.recipientName,
      childName: quote.childName,
      expectedStartDate: quote.expectedStartDate,
      quoteDate: quote.quoteDate,
      expiryDate: quote.expiryDate,
      validityDays: quote.validityDays,
      subtotalCents: quote.subtotalCents,
      vatAmountCents: quote.vatAmountCents,
      totalCents: quote.totalCents,
      status: quote.status,
      isExpired,
      canAccept,
      canDecline,
      lines: quote.lines.map(line => ({
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        lineTotalCents: line.lineTotalCents,
      })),
      tenant: {
        name: quote.tenant.tradingName || quote.tenant.name,
        phone: quote.tenant.phone,
        email: quote.tenant.email,
      },
    };
  }

  /**
   * Accept quote by view token (public access)
   */
  async acceptQuoteByToken(
    viewToken: string,
    confirmedBy: string,
  ): Promise<{ success: boolean; message: string; nextStep: string }> {
    const quote = await this.prisma.quote.findUnique({
      where: { viewToken },
    });

    if (!quote) {
      throw new NotFoundException('Quote not found or link expired');
    }

    if (!['SENT', 'VIEWED'].includes(quote.status)) {
      throw new BadRequestException(
        `Cannot accept quote with status ${quote.status}`,
      );
    }

    // Check expiry
    if (quote.expiryDate < new Date()) {
      await this.prisma.quote.update({
        where: { id: quote.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Quote has expired and can no longer be accepted');
    }

    // Accept the quote
    await this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        notes: quote.notes
          ? `${quote.notes}\n\nAccepted by: ${confirmedBy} on ${new Date().toISOString()}`
          : `Accepted by: ${confirmedBy} on ${new Date().toISOString()}`,
      },
    });

    // Log the acceptance (without userId - public action)
    await this.auditService.logUpdate({
      tenantId: quote.tenantId,
      userId: 'PUBLIC', // Special marker for public actions
      entityType: 'Quote',
      entityId: quote.id,
      beforeValue: { status: quote.status },
      afterValue: { status: 'ACCEPTED', acceptedBy: confirmedBy },
    });

    return {
      success: true,
      message: `Thank you! Quote ${quote.quoteNumber} has been accepted.`,
      nextStep: 'The creche will contact you to complete the enrollment process.',
    };
  }

  /**
   * Decline quote by view token (public access)
   */
  async declineQuoteByToken(
    viewToken: string,
    reason?: string,
  ): Promise<{ success: boolean; message: string }> {
    const quote = await this.prisma.quote.findUnique({
      where: { viewToken },
    });

    if (!quote) {
      throw new NotFoundException('Quote not found or link expired');
    }

    if (!['SENT', 'VIEWED'].includes(quote.status)) {
      throw new BadRequestException(
        `Cannot decline quote with status ${quote.status}`,
      );
    }

    await this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        status: 'DECLINED',
        declinedAt: new Date(),
        declineReason: reason,
      },
    });

    await this.auditService.logUpdate({
      tenantId: quote.tenantId,
      userId: 'PUBLIC',
      entityType: 'Quote',
      entityId: quote.id,
      beforeValue: { status: quote.status },
      afterValue: { status: 'DECLINED', reason },
    });

    return {
      success: true,
      message: 'Quote has been declined. Thank you for letting us know.',
    };
  }
  ```

  ### 5. Public Quote Module
  ```typescript
  // apps/api/src/api/public/public-quote.module.ts
  import { Module } from '@nestjs/common';
  import { PublicQuoteController } from './public-quote.controller';
  import { DatabaseModule } from '../../database/database.module';

  @Module({
    imports: [DatabaseModule],
    controllers: [PublicQuoteController],
  })
  export class PublicQuoteModule {}
  ```

  ### 6. Next.js Public Quote Page
  ```tsx
  // apps/web/src/app/quote/[token]/page.tsx
  'use client';

  import { useEffect, useState } from 'react';
  import { useParams, useRouter } from 'next/navigation';

  interface QuoteData {
    quoteNumber: string;
    recipientName: string;
    childName: string | null;
    expectedStartDate: string | null;
    quoteDate: string;
    expiryDate: string;
    subtotalCents: number;
    vatAmountCents: number;
    totalCents: number;
    status: string;
    isExpired: boolean;
    canAccept: boolean;
    canDecline: boolean;
    lines: Array<{
      description: string;
      quantity: number;
      unitPriceCents: number;
      lineTotalCents: number;
    }>;
    tenant: {
      name: string;
      phone: string;
      email: string;
    };
  }

  export default function PublicQuotePage() {
    const { token } = useParams();
    const router = useRouter();
    const [quote, setQuote] = useState<QuoteData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      fetchQuote();
    }, [token]);

    const fetchQuote = async () => {
      try {
        const res = await fetch(`/api/public/quotes/${token}`);
        if (!res.ok) {
          throw new Error('Quote not found or link has expired');
        }
        const data = await res.json();
        setQuote(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load quote');
      } finally {
        setLoading(false);
      }
    };

    const formatCurrency = (cents: number) => {
      return `R ${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    };

    const formatDate = (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString('en-ZA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    };

    if (loading) return <div className="p-8 text-center">Loading...</div>;
    if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
    if (!quote) return null;

    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-white shadow rounded-lg p-6">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">{quote.tenant.name}</h1>
            <h2 className="text-xl text-gray-600">Quote #{quote.quoteNumber}</h2>
          </div>

          {/* Status Banner */}
          {quote.isExpired && (
            <div className="bg-red-100 text-red-800 p-4 rounded mb-6 text-center">
              This quote has expired and is no longer valid.
            </div>
          )}
          {quote.status === 'ACCEPTED' && (
            <div className="bg-green-100 text-green-800 p-4 rounded mb-6 text-center">
              This quote has been accepted. The creche will contact you shortly.
            </div>
          )}
          {quote.status === 'DECLINED' && (
            <div className="bg-gray-100 text-gray-800 p-4 rounded mb-6 text-center">
              This quote has been declined.
            </div>
          )}

          {/* Quote Details */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-500">Prepared for</p>
              <p className="font-medium">{quote.recipientName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Valid until</p>
              <p className="font-medium">{formatDate(quote.expiryDate)}</p>
            </div>
            {quote.childName && (
              <div>
                <p className="text-sm text-gray-500">Child</p>
                <p className="font-medium">{quote.childName}</p>
              </div>
            )}
            {quote.expectedStartDate && (
              <div>
                <p className="text-sm text-gray-500">Expected Start</p>
                <p className="font-medium">{formatDate(quote.expectedStartDate)}</p>
              </div>
            )}
          </div>

          {/* Line Items */}
          <table className="w-full mb-6">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3">Description</th>
                <th className="text-right p-3">Qty</th>
                <th className="text-right p-3">Price</th>
                <th className="text-right p-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line, i) => (
                <tr key={i} className="border-b">
                  <td className="p-3">{line.description}</td>
                  <td className="text-right p-3">{line.quantity}</td>
                  <td className="text-right p-3">{formatCurrency(line.unitPriceCents)}</td>
                  <td className="text-right p-3">{formatCurrency(line.lineTotalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="border-t pt-4 mb-6">
            <div className="flex justify-between py-1">
              <span>Subtotal</span>
              <span>{formatCurrency(quote.subtotalCents)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span>VAT (15%)</span>
              <span>{formatCurrency(quote.vatAmountCents)}</span>
            </div>
            <div className="flex justify-between py-2 text-xl font-bold border-t">
              <span>Total</span>
              <span>{formatCurrency(quote.totalCents)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          {(quote.canAccept || quote.canDecline) && (
            <div className="flex gap-4 justify-center">
              {quote.canAccept && (
                <button
                  onClick={() => router.push(`/quote/${token}/accept`)}
                  className="bg-green-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-green-700"
                >
                  Accept Quote
                </button>
              )}
              {quote.canDecline && (
                <button
                  onClick={() => router.push(`/quote/${token}/decline`)}
                  className="bg-gray-200 text-gray-800 px-8 py-3 rounded-lg font-medium hover:bg-gray-300"
                >
                  Decline
                </button>
              )}
            </div>
          )}

          {/* Contact */}
          <div className="mt-8 text-center text-sm text-gray-500">
            <p>Questions? Contact us at:</p>
            <p>{quote.tenant.phone} | {quote.tenant.email}</p>
          </div>
        </div>
      </div>
    );
  }
  ```

  ### 7. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task creates the public-facing quote acceptance portal.

**User Journey:**
1. Parent receives quote email with link (from TASK-QUOTE-001)
2. Parent clicks link, views quote without logging in
3. Quote automatically marked as VIEWED
4. Parent reviews line items, totals, validity
5. Parent clicks Accept or Decline
6. On Accept: confirmation shown, creche notified
7. On Decline: optional reason captured, quote closed

**Security Considerations:**
- No authentication required - access controlled by viewToken UUID
- Token is unguessable (UUID v4 = 122 bits of entropy)
- Token grants read-only access to single quote
- Accept/decline require form submission (CSRF protection)
- Expired quotes cannot be accepted
- Status changes are audit-logged with "PUBLIC" as userId

**Business Rules:**
- Viewing a SENT quote changes status to VIEWED
- Only SENT or VIEWED quotes can be accepted/declined
- Expired quotes show error message, cannot accept
- Accepted quotes trigger notification to creche staff
- Decline reason is optional but encouraged

**Enrollment Flow After Acceptance:**
After acceptance, the creche staff will:
1. See quote status changed to ACCEPTED in dashboard
2. Contact parent to complete enrollment forms
3. Create child record and enrollment
4. Convert quote to invoice via TASK-ACCT-012 convertToInvoice
</context>

<scope>
  <in_scope>
    - Public API controller for token-based quote access
    - GET /public/quotes/:token - view quote
    - POST /public/quotes/:token/accept - accept quote
    - POST /public/quotes/:token/decline - decline quote
    - QuoteService methods for token-based operations
    - Auto-view tracking (SENT -> VIEWED on first view)
    - Expiry checking and auto-expire
    - Next.js public quote view page
    - Next.js accept confirmation page
    - Next.js decline form page
    - Responsive design for mobile viewers
    - Unit tests for controller
    - Integration tests for public endpoints
  </in_scope>
  <out_of_scope>
    - Email notification to creche on accept/decline (future enhancement)
    - Quote PDF download from public page (use email attachment)
    - Quote modification by recipient
    - Multiple acceptance attempts
    - Quote revision/resend flow
    - E-signature capture
    - Payment collection at acceptance
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Create public quote controller and module
# Create apps/api/src/api/public/public-quote.controller.ts
# Create apps/api/src/api/public/public-quote.module.ts
# Create apps/api/src/api/public/dto/quote-action.dto.ts

# 2. Add token-based methods to QuoteService
# Edit apps/api/src/database/services/quote.service.ts

# 3. Register PublicQuoteModule in app.module.ts
# Edit apps/api/src/app.module.ts

# 4. Create Next.js pages
# Create apps/web/src/app/quote/[token]/page.tsx
# Create apps/web/src/app/quote/[token]/accept/page.tsx
# Create apps/web/src/app/quote/[token]/decline/page.tsx

# 5. Create tests
# Create apps/api/tests/api/public/public-quote.controller.spec.ts

# 6. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Public endpoints require no authentication
    - Token-based access only (no tenantId in URL)
    - Auto-view tracking on first access
    - Expired quotes show clear error message
    - Accept requires confirmedBy name
    - Decline reason is optional
    - All state changes are audit-logged
    - Responsive design for mobile
    - Proper error handling and user feedback
  </constraints>

  <verification>
    - pnpm run build: 0 errors (both apps/api and apps/web)
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: GET quote by valid token returns quote data
    - Test: GET quote by invalid token returns 404
    - Test: SENT quote changes to VIEWED on first access
    - Test: VIEWED quote stays VIEWED on subsequent access
    - Test: POST accept on VIEWED quote changes to ACCEPTED
    - Test: POST accept on expired quote returns 400
    - Test: POST accept on ACCEPTED quote returns 400
    - Test: POST decline captures optional reason
    - Test: POST decline on DECLINED quote returns 400
    - Test: Currency formatted as ZAR (R)
    - Test: Dates formatted DD/MM/YYYY
    - Test: Mobile-responsive layout
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Require authentication for public quote endpoints
  - Expose tenantId in public URLs
  - Allow accepting expired quotes
  - Allow multiple accept/decline actions on same quote
  - Skip audit logging for public actions
  - Use hardcoded API base URLs in frontend
  - Expose internal quote ID (use only viewToken)
  - Skip CSRF protection on POST endpoints
  - Return full quote object with internal fields to public
</anti_patterns>

</task_spec>
