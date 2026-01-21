# ============================================
# CrecheBooks API - Production Dockerfile
# ============================================
# Multi-stage build for optimized production image
# Using Debian-based images for Railway compatibility

# Stage 1: Dependencies
FROM node:20-slim AS deps

# Install required system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# Stage 2: Builder
FROM node:20-slim AS builder

# Install required system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace configuration for pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Reinstall to set up workspace symlinks (uses cached node_modules)
RUN pnpm install --frozen-lockfile --offline || pnpm install --frozen-lockfile

# Build shared types package first (required by API)
RUN pnpm --filter @crechebooks/types build

# Generate Prisma client from apps/api directory (finds prisma.config.ts)
RUN cd apps/api && npx prisma generate

# Debug: Show where .prisma was generated
RUN echo "=== Searching for .prisma ===" && \
    find /app -name ".prisma" -type d 2>/dev/null || echo "No .prisma directories found"

# Ensure .prisma is at root node_modules
# Check multiple possible locations due to pnpm hoisting behavior
RUN mkdir -p /app/node_modules/.prisma && \
    if [ -d "/app/apps/api/node_modules/.prisma/client" ]; then \
      echo "Found .prisma in apps/api/node_modules" && \
      cp -r /app/apps/api/node_modules/.prisma/* /app/node_modules/.prisma/; \
    elif [ -d "/app/node_modules/.pnpm/@prisma+client@"*"/node_modules/.prisma" ]; then \
      echo "Found .prisma in pnpm store" && \
      cp -r /app/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/* /app/node_modules/.prisma/; \
    elif [ -d "/app/node_modules/@prisma/client/runtime" ]; then \
      echo "Prisma client runtime found, creating .prisma structure" && \
      mkdir -p /app/node_modules/.prisma/client && \
      find /app -path "*/node_modules/.prisma/client/*" -exec cp -r {} /app/node_modules/.prisma/client/ \; 2>/dev/null || true; \
    fi && \
    echo "=== Final .prisma contents ===" && \
    ls -la /app/node_modules/.prisma/ && \
    ls -la /app/node_modules/.prisma/client/ 2>/dev/null || echo "No client subfolder"

# Build the API
RUN pnpm --filter @crechebooks/api build

# Stage 3: Production Runner
FROM node:20-slim AS runner

# Install required system dependencies and dumb-init
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    dumb-init \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create non-root user for security
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nestjs

# Install pnpm for production
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy built application
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/apps/api/prisma ./prisma

# Copy node_modules (production deps)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps_node_modules
RUN cp -r ./apps_node_modules/* ./node_modules/ 2>/dev/null || true && rm -rf ./apps_node_modules

# Copy Prisma generated client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Set ownership
RUN chown -R nestjs:nodejs /app

USER nestjs

# Environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Run database migrations and start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
