# ============================================
# CrecheBooks API - Production Dockerfile
# ============================================
# Multi-stage build for optimized production image
# Using npm for flat node_modules structure (simpler than pnpm in Docker)

# Stage 1: Builder
FROM node:20-slim AS builder

# Install required system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# First build the shared types package
WORKDIR /app/packages/types
COPY packages/types/package.json ./
COPY packages/types/tsconfig.json ./
COPY packages/types/src ./src
RUN npm install && npm run build

# Now build the API
WORKDIR /app/api

# Copy API package.json and modify to use local types path
COPY apps/api/package.json ./package.json.orig

# Replace workspace:* dependency with file path to built types
RUN sed 's|"@crechebooks/types": "workspace:\*"|"@crechebooks/types": "file:../packages/types"|' package.json.orig > package.json

# Install dependencies with npm (creates flat node_modules)
RUN npm install --legacy-peer-deps

# Copy prisma schema and generate client
COPY apps/api/prisma ./prisma
RUN npx prisma generate

# Copy source code
COPY apps/api/src ./src
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json ./
COPY apps/api/nest-cli.json ./
COPY apps/api/prisma.config.ts ./

# Build the application
RUN npm run build

# Stage 2: Production Runner
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

# Copy built application and dependencies from builder
COPY --from=builder /app/api/dist ./dist
COPY --from=builder /app/api/node_modules ./node_modules
COPY --from=builder /app/api/package.json ./
COPY --from=builder /app/api/prisma ./prisma

# Copy types package (needed at runtime for some type exports)
COPY --from=builder /app/packages/types /app/packages/types

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
