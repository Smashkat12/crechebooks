# SimplePay-Xero Integration Architecture

## Overview

CrecheBooks integrates with SimplePay for payroll processing and Xero for accounting, enabling automated payroll journal entries to be posted to Xero.

## Integration Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  SimplePay  │────▶│ CrecheBooks │────▶│    Xero     │
│  (Payroll)  │     │   (Bridge)  │     │ (Accounts)  │
└─────────────┘     └─────────────┘     └─────────────┘
     │                    │                    │
     │ 1. Payslips        │ 2. Journal         │ 3. Manual
     │    Import          │    Creation        │    Journal
     │                    │                    │    POST
     ▼                    ▼                    ▼
  Employees          PayrollJournal        Xero Manual
  Payslips           JournalLines          Journal Entry
  IRP5/EMP201        Account Mappings      Bank Transactions
```

## SimplePay Integration (TASK-STAFF-004)

### API Configuration
- **Base URL**: `https://api.payroll.simplepay.cloud/v1`
- **Authentication**: API Key in `Authorization` header
- **Rate Limit**: 60 requests/minute

### Response Format
SimplePay returns nested responses:
```json
[
  { "client": { "id": 353117, "name": "Elle Elephant Kindergarten" } },
  { "employee": { "id": "123", "first_name": "John" } }
]
```

### Available Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/integrations/simplepay/discover-clients` | POST | List accessible clients with API key |
| `/integrations/simplepay/connect` | POST | Establish connection |
| `/integrations/simplepay/status` | GET | Check connection status |
| `/integrations/simplepay/employees/sync-all` | POST | Sync all staff to SimplePay |
| `/integrations/simplepay/employees/:id/sync` | POST | Sync single employee |
| `/integrations/simplepay/payslips/import` | POST | Import payslips for period |
| `/integrations/simplepay/employees/:id/irp5` | GET | Get IRP5 certificates |
| `/integrations/simplepay/emp201` | GET | Get EMP201 tax data |

### Setup Steps
1. Get SimplePay API key from SimplePay admin portal
2. Call `POST /discover-clients` to find your client ID
3. Call `POST /connect` with clientId and apiKey
4. Credentials are encrypted with AES-256-GCM before storage

## Xero Integration (TASK-STAFF-003)

### OAuth 2.0 Flow
- **Authorization URL**: `https://login.xero.com/identity/connect/authorize`
- **Token Endpoint**: `https://identity.xero.com/connect/token`
- **Token Expiry**: 30 minutes (auto-refresh supported)
- **Scopes Required**:
  - `openid`, `profile`, `email`, `offline_access`
  - `accounting.transactions`, `accounting.contacts`, `accounting.settings`

### Manual Journals API
Since Xero doesn't have a native Payroll API for South Africa, we use the Manual Journals API:
- Journal entries must balance (debits = credits)
- Line amounts: positive for debits, negative for credits
- All amounts in ZAR

### Available Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/xero/connect` | POST | Initiate OAuth flow |
| `/xero/callback` | GET | OAuth callback (public) |
| `/xero/status` | GET | Check connection status |
| `/xero/disconnect` | POST | Remove connection |
| `/xero/payroll-journals` | GET | List journals |
| `/xero/payroll-journals` | POST | Create journal from payroll |
| `/xero/payroll-journals/:id/post` | POST | Post to Xero |
| `/xero/payroll-journals/bulk-post` | POST | Post multiple journals |
| `/xero/account-mappings` | GET/POST | Manage account mappings |
| `/xero/account-mappings/auto-configure` | POST | Auto-map from Xero COA |

### Account Mappings
Required mappings for payroll journals:
| CrecheBooks Type | Description | Typical Xero Account |
|------------------|-------------|---------------------|
| SALARY_EXPENSE | Gross salary expense | Salaries & Wages |
| PAYE_PAYABLE | Tax liability | PAYE Payable |
| UIF_PAYABLE | UIF liability | UIF Payable |
| NET_PAY_CLEARING | Amount to pay | Net Pay Clearing |

Optional mappings:
- UIF_EMPLOYER_EXPENSE
- BONUS_EXPENSE
- OVERTIME_EXPENSE
- OTHER_DEDUCTION

## Journal Entry Structure

### Example Payroll Journal
For an employee with R25,000 gross salary:

| Account | Debit | Credit |
|---------|-------|--------|
| Salaries & Wages (Expense) | R25,000 | - |
| PAYE Payable (Liability) | - | R4,000 |
| UIF Payable (Liability) | - | R500 |
| Net Pay Clearing (Liability) | - | R20,500 |
| **Totals** | **R25,000** | **R25,000** |

## Security Considerations

1. **API Key Storage**: Encrypted with AES-256-GCM
2. **OAuth Tokens**: Encrypted at rest, auto-refreshed
3. **State Parameter**: CSRF protection for OAuth
4. **Rate Limiting**: Respects SimplePay 60/min limit
5. **Tenant Isolation**: All queries filtered by tenantId

## Error Handling

### SimplePay Errors
- 401: Invalid API key
- 429: Rate limit exceeded (auto-retry with backoff)
- 5xx: Server errors (retry up to 3 times)

### Xero Errors
- 401: Token expired (auto-refresh)
- 429: Rate limit (exponential backoff)
- 400: Validation error (details in response)

## Testing

### Verify SimplePay Connection
```bash
cd apps/api
npx ts-node scripts/test-simplepay-connection.ts
```

### Verify Full Integration
```bash
cd apps/api
npx ts-node scripts/test-integration-flow.ts
```

### Manual Testing
1. Start API: `npm run start:dev`
2. Open: http://localhost:3000/settings/integrations
3. Connect SimplePay (Client ID: 353117)
4. Connect Xero (OAuth flow)
5. Configure account mappings
6. Import payslips
7. Create and post journal entries

## Environment Variables

```env
# SimplePay
SIMPLEPAY_API_KEY=your_api_key_here

# Xero OAuth
XERO_CLIENT_ID=your_client_id
XERO_CLIENT_SECRET=your_client_secret
XERO_REDIRECT_URI=http://localhost:3001/api/v1/xero/callback

# Encryption
TOKEN_ENCRYPTION_KEY=32_character_encryption_key_here
```

## Files

### SimplePay Integration
- `src/integrations/simplepay/simplepay-api.client.ts` - HTTP client with rate limiting
- `src/integrations/simplepay/simplepay-connection.service.ts` - Connection management
- `src/integrations/simplepay/simplepay-employee.service.ts` - Employee sync
- `src/integrations/simplepay/simplepay-payslip.service.ts` - Payslip import
- `src/integrations/simplepay/simplepay-tax.service.ts` - IRP5/EMP201

### Xero Integration
- `src/integrations/xero/xero.controller.ts` - OAuth and bank feeds
- `src/api/xero/payroll-journal.controller.ts` - Journal management
- `src/database/services/xero-payroll-journal.service.ts` - Journal creation/posting
- `src/database/services/xero-account-mapping.service.ts` - Account mapping

### Shared
- `src/mcp/xero-mcp/auth/token-manager.ts` - Token encryption/refresh
- `src/shared/services/encryption.service.ts` - AES-256-GCM encryption
