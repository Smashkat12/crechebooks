# ============================================
# CrecheBooks Web - Production Dockerfile
# ============================================
# Multi-stage build for optimized production image
# Using Debian-based images for Railway compatibility

# Stage 1: Dependencies
FROM node:20-slim AS deps

# Install required system dependencies (python3/make/g++ needed for native modules like hnswlib-node)
RUN apt-get update && apt-get install -y --no-install-recommends \
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
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# Stage 2: Builder
FROM node:20-slim AS builder

# Install required system dependencies (python3/make/g++ needed for native modules like hnswlib-node)
RUN apt-get update && apt-get install -y --no-install-recommends \
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
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
# Build timestamp to force fresh build: 2026-01-27T00:45:00Z
COPY . .

# Reinstall to set up workspace symlinks (uses cached node_modules)
RUN pnpm install --frozen-lockfile --offline || pnpm install --frozen-lockfile

# Build arguments for environment variables at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build shared types package first (required by web app)
RUN pnpm --filter @crechebooks/types build

# Build the web app
RUN pnpm --filter @crechebooks/web build

# Stage 3: Production Runner
FROM node:20-slim AS runner

# Install required system dependencies and dumb-init
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    dumb-init \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create non-root user for security
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Set environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy built application (standalone output)
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000

# Health check - use PORT env var (Railway injects PORT=8080)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "apps/web/server.js"]
