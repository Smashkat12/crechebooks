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

# Prepare prisma CLI and engines for runner stage (resolve pnpm symlinks)
RUN mkdir -p /app/prisma-cli /app/prisma-engines && \
    (cp -rL /app/node_modules/prisma/* /app/prisma-cli/ 2>/dev/null || \
     cp -rL /app/node_modules/.pnpm/prisma@*/node_modules/prisma/* /app/prisma-cli/ 2>/dev/null || \
     find /app/node_modules -path "*/prisma/build/index.js" -exec dirname {} \; | head -1 | xargs -I{} cp -rL {}/../ /app/prisma-cli/) && \
    (cp -rL /app/node_modules/@prisma/engines/* /app/prisma-engines/ 2>/dev/null || \
     cp -rL /app/node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines/* /app/prisma-engines/ 2>/dev/null || \
     find /app/node_modules -path "*/@prisma/engines/package.json" -exec dirname {} \; | head -1 | xargs -I{} cp -rL {}/* /app/prisma-engines/) && \
    echo "=== Prisma CLI prepared ===" && ls -la /app/prisma-cli/ && \
    echo "=== Prisma Engines prepared ===" && ls -la /app/prisma-engines/

# Prepare resolved node_modules for runner (resolve all pnpm symlinks)
RUN mkdir -p /app/resolved_modules && \
    cp -rL /app/node_modules/* /app/resolved_modules/ 2>/dev/null || true && \
    echo "=== Resolved node_modules prepared ===" && \
    ls /app/resolved_modules/ | head -20

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

# Install pnpm for production
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy built application
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/apps/api/prisma ./prisma

# Copy resolved node_modules from builder (all pnpm symlinks resolved)
COPY --from=builder /app/resolved_modules ./node_modules

# Copy Prisma generated client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy Prisma CLI and engines from builder (resolved from pnpm symlinks)
COPY --from=builder /app/prisma-cli ./node_modules/prisma
COPY --from=builder /app/prisma-engines ./node_modules/@prisma/engines

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

# Start the server
# Note: Migrations should be run separately via Railway release command or manually
# To run migrations: railway run npx prisma migrate deploy
CMD ["node", "dist/src/main"]
