#!/bin/bash
# Fix all Prisma tenantId assignments to convert null to undefined

cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api

echo "Fixing Prisma tenantId assignments..."

# Pattern 1: tenantId: dto.tenantId -> tenantId: dto.tenantId ?? undefined
find src -name "*.repository.ts" -o -name "*.service.ts" | while read file; do
  # Fix assignments like: tenantId: dto.tenantId,
  sed -i 's/tenantId: dto\.tenantId,/tenantId: dto.tenantId ?? undefined,/g' "$file"

  # Fix assignments like: tenantId: data.tenantId,
  sed -i 's/tenantId: data\.tenantId,/tenantId: data.tenantId ?? undefined,/g' "$file"

  # Fix where clauses: where: { tenantId },
  sed -i 's/where: { tenantId }/where: { tenantId: tenantId ?? undefined }/g' "$file"

  # Fix where clauses: where: { tenantId, ...
  sed -i 's/where: { tenantId,/where: { tenantId: tenantId ?? undefined,/g' "$file"
done

echo "Fixing entity assignments..."

# Pattern 2: Fix entity files
find src -name "*.entity.ts" | while read file; do
  # Fix assignments: tenantId: dto.tenantId
  sed -i 's/tenantId: dto\.tenantId,/tenantId: dto.tenantId ?? undefined,/g' "$file"
  sed -i 's/tenantId: data\.tenantId,/tenantId: data.tenantId ?? undefined,/g' "$file"
done

echo "Done!"
