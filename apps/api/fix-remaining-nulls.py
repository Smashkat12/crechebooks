#!/usr/bin/env python3
"""
Fix ALL remaining tenantId nullable errors
"""

import re
import os

def fix_any_file(file_path):
    """Universal fix for any TypeScript file with tenantId issues"""
    print(f"Processing {file_path}...")

    with open(file_path, 'r') as f:
        content = f.read()

    original_content = content

    # Strategy 1: Fix controller methods with @CurrentUser() user: IUser
    method_pattern = r'(async \w+\([^{]*@CurrentUser\(\) user: IUser[^{]*\)\s*(?::\s*Promise<[^>]+>)?\s*\{)'
    methods_found = list(re.finditer(method_pattern, content))

    if methods_found:
        print(f"  Found {len(methods_found)} methods with @CurrentUser")
        # Process from end to beginning to maintain positions
        for match in reversed(methods_found):
            method_start_pos = match.end()

            # Check if null check already exists
            next_200_chars = content[method_start_pos:method_start_pos + 300]
            if '!user.tenantId' in next_200_chars:
                continue  # Already has null check

            # Insert the null check
            null_check = """
    if (!user.tenantId) {
      throw new Error('This operation requires a tenant. SUPER_ADMIN users cannot access tenant-specific data.');
    }
    const tenantId = user.tenantId;
"""
            content = content[:method_start_pos] + null_check + content[method_start_pos:]

    # Strategy 2: Replace user.tenantId with tenantId variable
    if methods_found:
        lines = content.split('\n')
        result_lines = []
        in_null_check = False

        for line in lines:
            if '!user.tenantId' in line:
                in_null_check = True
                result_lines.append(line)
                continue

            if in_null_check:
                result_lines.append(line)
                if 'const tenantId = user.tenantId' in line:
                    in_null_check = False
                continue

            # Replace user.tenantId with tenantId
            if 'user.tenantId' in line and 'logger' not in line.lower():
                line = line.replace('user.tenantId', 'tenantId')

            result_lines.append(line)

        content = '\n'.join(result_lines)

    # Strategy 3: Fix DTO files - make tenantId optional
    if '/dto/' in file_path or file_path.endswith('.dto.ts'):
        content = re.sub(r'tenantId!:\s*string;', 'tenantId?: string | null;', content)
        content = re.sub(r'(?<!tenantId\?:)(\s+)tenantId:\s*string;', r'\1tenantId?: string | null;', content)

    # Strategy 4: Fix entity files - make tenantId optional
    if '/entities/' in file_path:
        content = re.sub(r'tenantId!:\s*string;', 'tenantId?: string | null;', content)
        content = re.sub(r'(?<!tenantId\?:)(\s+)tenantId:\s*string;', r'\1tenantId?: string | null;', content)

    # Strategy 5: Fix service/repository files - add null checks before using tenantId
    if '/services/' in file_path or '/repositories/' in file_path or '/handlers/' in file_path:
        # Add checks for methods with tenantId parameter
        # Pattern: function(tenantId: string) or method(tenantId: string)
        func_pattern = r'((?:async\s+)?(?:public\s+|private\s+|protected\s+)?(?:\w+)\s*\([^)]*\btenantId:\s*string[^)]*\)(?:\s*:\s*[^{]+)?\s*\{)'

        funcs_found = list(re.finditer(func_pattern, content))
        if funcs_found:
            print(f"  Found {len(funcs_found)} functions with tenantId parameter")
            for match in reversed(funcs_found):
                func_start_pos = match.end()
                next_100_chars = content[func_start_pos:func_start_pos + 200]

                if '!tenantId' in next_100_chars:
                    continue

                # Add null check for tenantId parameter
                param_check = """
    if (!tenantId) {
      throw new Error('tenantId is required');
    }
"""
                content = content[:func_start_pos] + param_check + content[func_start_pos:]

    # Save if changes were made
    if content != original_content:
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"  ✓ Fixed {file_path}")
        return True
    else:
        print(f"  - No changes needed for {file_path}")
        return False


def main():
    base_path = '/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api'

    # All files with errors
    files_to_fix = [
        'src/api/billing/enrollment.controller.ts',
        'src/api/integrations/simplepay.controller.ts',
        'src/api/parents/parent.controller.ts',
        'src/api/payment/payment.controller.ts',
        'src/api/reconciliation/reconciliation.controller.ts',
        'src/api/settings/fee-structure.controller.ts',
        'src/api/settings/tenant.controller.ts',
        'src/api/staff/leave.controller.ts',
        'src/api/staff/offboarding.controller.ts',
        'src/api/staff/onboarding.controller.ts',
        'src/api/staff/staff.controller.ts',
        'src/api/transaction/transaction.controller.ts',
        'src/api/xero/payroll-journal.controller.ts',
        'src/communications/entities/broadcast-message.entity.ts',
        'src/communications/entities/recipient-group.entity.ts',
        'src/database/dto/payment.dto.ts',
        'src/database/dto/staff.dto.ts',
        'src/database/dto/vat-adjustment.dto.ts',
        'src/database/repositories/fee-structure.repository.ts',
        'src/database/repositories/leave-request.repository.ts',
        'src/database/repositories/parent.repository.ts',
        'src/database/services/audit-log.service.ts',
        'src/database/services/emp201.service.ts',
        'src/database/services/invoice-delivery.service.ts',
        'src/database/services/payment-allocation.service.ts',
        'src/database/services/payment-matching.service.ts',
        'src/database/services/vat201.service.ts',
        'src/integrations/simplepay/handlers/staff-created.handler.ts',
        'src/integrations/xero/dto/xero.dto.ts',
        'src/integrations/xero/xero.controller.ts',
    ]

    print("=" * 80)
    print(f"FIXING {len(files_to_fix)} FILES")
    print("=" * 80)

    fixed_count = 0
    for file_rel_path in files_to_fix:
        file_path = os.path.join(base_path, file_rel_path)
        if os.path.exists(file_path):
            try:
                if fix_any_file(file_path):
                    fixed_count += 1
            except Exception as e:
                print(f"  ✗ Error fixing {file_path}: {e}")
        else:
            print(f"  ! File not found: {file_path}")

    print("\n" + "=" * 80)
    print(f"COMPLETE: Fixed {fixed_count} files")
    print("=" * 80)


if __name__ == '__main__':
    main()
