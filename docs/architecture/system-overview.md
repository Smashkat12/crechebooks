# System Overview

> High-level architecture of the CrecheBooks platform.

## Architecture Diagram

```mermaid
graph TB
    subgraph "Presentation Tier"
        BROWSER[Web Browser]
        MOBILE[Mobile Browser]
    end

    subgraph "Frontend Tier"
        NEXTJS[Next.js 14 App Router]
        SSR[Server Components]
        CLIENT[Client Components]
        ZUSTAND[Zustand State]
    end

    subgraph "Gateway Tier"
        NGINX[Nginx / Load Balancer]
        RATE[Rate Limiter]
        CORS[CORS Handler]
    end

    subgraph "Application Tier"
        NEST[NestJS Application]

        subgraph "Middleware"
            AUTH_MW[Auth Middleware]
            TENANT_MW[Tenant Context]
            CSRF_MW[CSRF Protection]
        end

        subgraph "Controllers"
            AUTH_C[Auth Controller]
            PARENT_C[Parent Controller]
            CHILD_C[Child Controller]
            BILLING_C[Billing Controller]
            STAFF_C[Staff Controller]
            SARS_C[SARS Controller]
            RECON_C[Reconciliation Controller]
        end

        subgraph "Services"
            AUTH_S[Auth Service]
            PARENT_S[Parent Service]
            CHILD_S[Child Service]
            BILLING_S[Billing Service]
            STAFF_S[Staff Service]
            SARS_S[SARS Service]
            RECON_S[Reconciliation Service]
        end

        subgraph "Repositories"
            REPOS[Prisma Repositories]
        end
    end

    subgraph "Data Tier"
        PG[(PostgreSQL)]
        REDIS[(Redis)]
    end

    subgraph "External Services"
        XERO[Xero Accounting]
        SIMPLEPAY[SimplePay Payroll]
        BANK[Bank APIs]
        EMAIL[Email Service]
    end

    BROWSER --> NEXTJS
    MOBILE --> NEXTJS
    NEXTJS --> SSR
    NEXTJS --> CLIENT
    CLIENT --> ZUSTAND

    NEXTJS --> NGINX
    NGINX --> RATE
    RATE --> CORS
    CORS --> NEST

    NEST --> AUTH_MW
    AUTH_MW --> TENANT_MW
    TENANT_MW --> CSRF_MW

    CSRF_MW --> AUTH_C
    CSRF_MW --> PARENT_C
    CSRF_MW --> CHILD_C
    CSRF_MW --> BILLING_C
    CSRF_MW --> STAFF_C
    CSRF_MW --> SARS_C
    CSRF_MW --> RECON_C

    AUTH_C --> AUTH_S
    PARENT_C --> PARENT_S
    CHILD_C --> CHILD_S
    BILLING_C --> BILLING_S
    STAFF_C --> STAFF_S
    SARS_C --> SARS_S
    RECON_C --> RECON_S

    AUTH_S --> REPOS
    PARENT_S --> REPOS
    CHILD_S --> REPOS
    BILLING_S --> REPOS
    STAFF_S --> REPOS
    SARS_S --> REPOS
    RECON_S --> REPOS

    REPOS --> PG
    AUTH_S --> REDIS

    BILLING_S --> XERO
    STAFF_S --> SIMPLEPAY
    RECON_S --> BANK
    AUTH_S --> EMAIL
```

## Component Responsibilities

### Presentation Tier
- **Web/Mobile Browsers**: End-user access points
- Responsive design supporting desktop and mobile

### Frontend Tier
- **Next.js 14**: React framework with App Router
- **Server Components**: SEO, initial data fetching
- **Client Components**: Interactive UI elements
- **Zustand**: Lightweight client state management

### Gateway Tier
- **Load Balancer**: Traffic distribution
- **Rate Limiter**: DDoS protection, API throttling
- **CORS Handler**: Cross-origin request security

### Application Tier
- **NestJS**: Enterprise-grade Node.js framework
- **Middleware**: Request processing pipeline
- **Controllers**: HTTP request handlers
- **Services**: Business logic encapsulation
- **Repositories**: Data access abstraction

### Data Tier
- **PostgreSQL**: Primary relational database
- **Redis**: Session storage, caching, rate limiting

### External Services
- **Xero**: Accounting integration
- **SimplePay**: Payroll processing
- **Bank APIs**: Statement reconciliation
- **Email**: Transactional notifications

## Deployment Architecture

```mermaid
graph LR
    subgraph "Development"
        DEV_DB[(Dev DB)]
        DEV_API[Dev API]
        DEV_WEB[Dev Web]
    end

    subgraph "Staging"
        STG_DB[(Staging DB)]
        STG_API[Staging API]
        STG_WEB[Staging Web]
    end

    subgraph "Production"
        subgraph "Primary Region"
            PROD_LB[Load Balancer]
            PROD_API1[API Instance 1]
            PROD_API2[API Instance 2]
            PROD_WEB[Web CDN]
            PROD_DB[(Primary DB)]
            PROD_REDIS[(Redis Cluster)]
        end

        subgraph "Backup"
            BACKUP_DB[(Replica DB)]
        end
    end

    DEV_API --> DEV_DB
    STG_API --> STG_DB

    PROD_LB --> PROD_API1
    PROD_LB --> PROD_API2
    PROD_API1 --> PROD_DB
    PROD_API2 --> PROD_DB
    PROD_API1 --> PROD_REDIS
    PROD_API2 --> PROD_REDIS
    PROD_DB --> BACKUP_DB
```

## Multi-Tenant Architecture

```mermaid
graph TB
    subgraph "Request Flow"
        REQ[Incoming Request]
        JWT[JWT Token]
        EXTRACT[Extract organizationId]
        CONTEXT[Set Tenant Context]
    end

    subgraph "Data Isolation"
        REPO[Repository Layer]
        FILTER[WHERE organizationId = ?]
        QUERY[Filtered Query]
    end

    subgraph "Database"
        ORG1[Org 1 Data]
        ORG2[Org 2 Data]
        ORG3[Org 3 Data]
    end

    REQ --> JWT
    JWT --> EXTRACT
    EXTRACT --> CONTEXT
    CONTEXT --> REPO
    REPO --> FILTER
    FILTER --> QUERY
    QUERY --> ORG1
    QUERY --> ORG2
    QUERY --> ORG3
```

### Tenant Isolation Strategy

1. **Authentication**: JWT contains `organizationId`
2. **Middleware**: Extracts tenant context from token
3. **Repository**: All queries filtered by `organizationId`
4. **Type Safety**: TypeScript enforces tenant parameter

```typescript
// Repository pattern with tenant isolation
async findById(id: string, tenantId: string) {
  return this.prisma.entity.findFirst({
    where: {
      id,
      organizationId: tenantId,
      deletedAt: null
    }
  });
}
```

## Key Design Patterns

| Pattern | Usage |
|---------|-------|
| **Repository** | Data access abstraction with tenant filtering |
| **Service Layer** | Business logic encapsulation |
| **Guard** | Authorization and authentication |
| **DTO** | Request/response validation |
| **Decorator** | Metadata injection (tenant, user context) |
| **Module** | Feature-based code organization |

## Scalability Considerations

- **Horizontal Scaling**: Stateless API allows multiple instances
- **Database**: Read replicas for reporting queries
- **Caching**: Redis for session and frequently accessed data
- **CDN**: Static assets served via CDN
- **Queue**: Background jobs for heavy processing (future)
