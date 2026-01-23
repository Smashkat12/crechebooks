#!/bin/bash
# Final aggressive fix: Replace all user.tenantId with tenantId in methods that have the null check

cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api

# For each TypeScript file, if it has the null check pattern, replace user.tenantId with tenantId
# But NOT in the null check lines themselves

find src -name "*.ts" -type f | while read file; do
  if grep -q "const tenantId = user.tenantId" "$file"; then
    echo "Processing $file"

    # Use sed to replace user.tenantId with tenantId, but not in:
    # 1. Lines with !user.tenantId
    # 2. Lines with const tenantId = user.tenantId
    # 3. Lines with logger

    sed -i '/!user\.tenantId/! s/user\.tenantId/tenantId/g' "$file"

    # Restore the const tenantId line (it got changed)
    sed -i 's/const tenantId = tenantId;/const tenantId = user.tenantId;/g' "$file"
  fi
done

echo "Done!"
