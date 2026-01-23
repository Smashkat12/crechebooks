#!/bin/bash

# Fix all tenantId issues in TypeScript files

files=(
  "src/api/billing/child.controller.ts"
  "src/api/billing/invoice.controller.ts"
  "src/api/billing/statement.controller.ts"
  "src/api/communications/communication.controller.ts"
  "src/api/dashboard/dashboard.controller.ts"
  "src/api/sars/sars.controller.ts"
  "src/api/settings/tenant.controller.ts"
  "src/api/transaction/transaction.controller.ts"
  "src/api/xero/payroll-journal.controller.ts"
  "src/integrations/xero/xero.controller.ts"
  "src/api/billing/enrollment.controller.ts"
  "src/api/arrears/arrears.controller.ts"
)

for file in "${files[@]}"; do
  echo "Processing $file..."

  # Replace the problematic pattern
  sed -i "s/const tenantId: string = user\.tenantId;/const tenantId = getTenantId(user);/g" "$file"

  # Check if getTenantId import already exists
  if ! grep -q "import.*getTenantId.*from.*tenant-assertions" "$file"; then
    # Add import after other imports (after first import block)
    # Find the line number of the last import statement
    last_import_line=$(grep -n "^import" "$file" | tail -1 | cut -d: -f1)

    if [ -n "$last_import_line" ]; then
      # Insert after the last import
      sed -i "${last_import_line}a import { getTenantId } from '../auth/utils/tenant-assertions';" "$file"
    fi
  fi
done

echo "Done! Now run: npm run build"
