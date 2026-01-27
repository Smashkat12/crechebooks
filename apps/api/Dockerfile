# ============================================
# CrecheBooks API - Production Dockerfile
# ============================================
# Multi-stage build for optimized production image
# Using pnpm for workspace-aware dependency management

# Stage 1: Dependencies
FROM node:20-slim AS deps

# Install required system dependencies (python3/make/g++ needed for native modules like hnswlib-node)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    python3 \
    make \
    g++ \
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

# Install required system dependencies (python3/make/g++ needed for native modules like hnswlib-node)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    python3 \
    make \
    g++ \
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
# Build timestamp to force fresh build: 2026-01-27T00:45:00Z
COPY . .

# Reinstall to set up workspace symlinks (uses cached node_modules)
RUN pnpm install --frozen-lockfile --offline || pnpm install --frozen-lockfile

# Build shared types package first (required by API)
RUN pnpm --filter @crechebooks/types build

# Generate Prisma client
ARG CACHEBUST=2026-01-27T00:00:00Z
RUN cd apps/api && pnpm exec prisma generate

# Build the API application
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

# Create non-root user for security with home directory
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs --create-home --home-dir /home/nestjs nestjs

# Copy built application and node_modules from builder
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/tsconfig.json ./tsconfig.json
COPY --from=builder /app/node_modules ./node_modules

# Copy optional files (may not exist in all configurations)
COPY --from=builder /app/apps/api/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/apps/api/scripts ./scripts

# Copy startup script
COPY apps/api/start.sh ./start.sh
RUN chmod +x ./start.sh

# Copy types package (needed at runtime for some type exports)
COPY --from=builder /app/packages/types /app/packages/types

# Copy agent context files (required for transaction categorizer)
COPY .claude/context/ ./.claude/context/

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

# Start the server (run migrations first via startup script)
CMD ["./start.sh"]
