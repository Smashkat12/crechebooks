#!/usr/bin/env python3
"""
Fix all tenantId nullable errors in reconciliation.controller.ts
"""

import re

def fix_reconciliation_controller():
    file_path = '/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/api/reconciliation/reconciliation.controller.ts'

    with open(file_path, 'r') as f:
        content = f.read()

    # Pattern to find methods that use user: IUser parameter
    # We'll add the null check after the method signature and before the first this.logger call

    # Find all async method definitions with @CurrentUser() user: IUser
    method_pattern = r'(async \w+\([^)]*@CurrentUser\(\) user: IUser[^)]*\)[^{]*\{)\s*(this\.logger\.(log|debug|warn)\()'

    def add_null_check(match):
        method_start = match.group(1)
        logger_call = match.group(2)

        # Add the null check between method start and logger call
        return f'''{method_start}
    if (!user.tenantId) {{
      throw new Error('This operation requires a tenant. SUPER_ADMIN users cannot access tenant-specific data.');
    }}
    const tenantId = user.tenantId;

    {logger_call}'''

    # Apply the transformation
    fixed_content = re.sub(method_pattern, add_null_check, content)

    # Now replace all instances of user.tenantId (except in the check we just added) with tenantId
    # We need to be careful not to replace it in the check itself
    lines = fixed_content.split('\n')
    result_lines = []
    in_null_check = False

    for line in lines:
        # Detect if we're in a null check block
        if '!user.tenantId' in line or 'const tenantId = user.tenantId' in line:
            in_null_check = True
            result_lines.append(line)
            continue

        if in_null_check and line.strip() == '}':
            in_null_check = False
            result_lines.append(line)
            continue

        # Replace user.tenantId with tenantId (but not in checks we just added)
        if not in_null_check and 'user.tenantId' in line:
            line = line.replace('user.tenantId', 'tenantId')

        result_lines.append(line)

    fixed_content = '\n'.join(result_lines)

    with open(file_path, 'w') as f:
        f.write(fixed_content)

    print("Fixed reconciliation.controller.ts")

if __name__ == '__main__':
    fix_reconciliation_controller()
