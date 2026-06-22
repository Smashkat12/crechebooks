# CrecheBooks Justfile — Entry Points for Builder & Operator Systems
# Usage: just <recipe>
#
# Multi-team PI agent recipes are namespaced under `pi`.
# `just pi --list` shows them. Examples:
#   just pi chat                            # interactive orchestrator
#   just pi ask-all "<question>"            # multi-perspective answer from all teams
#   just pi plan-engineer-validate "<task>" # serial workflow
#   just pi last-session                    # pretty-print recent conversation log

mod pi '.pi/justfile'

# ── Builder Commands ──

# Build a new feature from description
build-feature description:
    claude /build-feature "{{description}}"

# Fix a GitHub issue by number
fix-issue issue:
    claude /fix-issue "{{issue}}"

# Deploy current code to staging
deploy-staging:
    claude /deploy-staging

# Review a pull request
code-review pr:
    claude /code-review "{{pr}}"

# Scaffold a new domain module
onboard-domain name:
    claude /onboard-feature-domain "{{name}}"

# ── Operator Commands ──

# Run daily bookkeeping operations
daily-ops:
    claude /daily-operations

# Run monthly billing cycle
billing month:
    claude /billing-cycle "{{month}}"

# Generate SARS tax compliance drafts
tax-compliance period:
    claude /tax-compliance "{{period}}"

# Send parent communications
parent-comms template group:
    claude /parent-comms "{{template}} {{group}}"

# ── Development ──

# Start full dev environment
dev:
    pnpm dev:infra && pnpm dev

# Run all tests
test:
    pnpm test

# Run API tests only
test-api:
    pnpm test:api

# Lint all code
lint:
    pnpm lint

# TypeScript type check
typecheck:
    pnpm exec tsc --noEmit --project apps/api/tsconfig.json

# Full validation (lint + typecheck + test)
validate: lint typecheck test

# ── Infrastructure ──

# Start observatory server
observatory:
    cd tools/agent-observatory/server && npm run dev

# Reset dev infrastructure
reset-infra:
    pnpm dev:infra:reset

# Prisma studio
studio:
    pnpm prisma:studio

# Fast, non-destructive pre-push gate (predicts CI lint + typecheck)
preflight:
    scripts/preflight.sh

# Install git hooks (pre-push runs preflight before each push)
install-hooks:
    scripts/install-hooks.sh

# Push a branch and poll a URL until it's live. e.g.:
#   just deploy-verify --push staging --url https://api-staging-5287.up.railway.app/health --expect-status 200
deploy-verify *ARGS:
    scripts/deploy-verify.sh {{ARGS}}
