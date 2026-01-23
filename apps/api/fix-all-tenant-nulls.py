#!/usr/bin/env python3
"""
Fix ALL tenantId nullable errors across all files
"""

import re
import os

def fix_controller_file(file_path):
    """Fix a controller file by adding tenantId null checks"""
    print(f"Processing {file_path}...")

    with open(file_path, 'r') as f:
        content = f.read()

    # Pattern 1: Find async methods with @CurrentUser() user: IUser parameter
    # Add null check right after the opening brace
    method_pattern = r'(async \w+\([^{]*@CurrentUser\(\) user: IUser[^{]*\)\s*(?::\s*Promise<[^>]+>)?\s*\{)'

    methods_found = list(re.finditer(method_pattern, content))

    if not methods_found:
        print(f"  No methods found with @CurrentUser in {file_path}")
        return

    print(f"  Found {len(methods_found)} methods to fix")

    # Process from end to beginning to maintain positions
    for match in reversed(methods_found):
        method_start_pos = match.end()

        # Check if null check already exists
        next_100_chars = content[method_start_pos:method_start_pos + 200]
        if '!user.tenantId' in next_100_chars or 'const tenantId = user.tenantId' in next_100_chars:
            continue  # Already has null check

        # Insert the null check
        null_check = """
    if (!user.tenantId) {
      throw new Error('This operation requires a tenant. SUPER_ADMIN users cannot access tenant-specific data.');
    }
    const tenantId = user.tenantId;
"""

        content = content[:method_start_pos] + null_check + content[method_start_pos:]

    # Now replace all user.tenantId with tenantId (except in the checks we added)
    lines = content.split('\n')
    result_lines = []
    in_null_check = False

    for line in lines:
        # Detect if we're in our null check block
        if '!user.tenantId' in line:
            in_null_check = True
            result_lines.append(line)
            continue

        if in_null_check:
            result_lines.append(line)
            if 'const tenantId = user.tenantId' in line:
                in_null_check = False
            continue

        # Replace user.tenantId with tenantId (but not in logger calls that are just logging)
        if 'user.tenantId' in line and 'logger' not in line.lower():
            line = line.replace('user.tenantId', 'tenantId')

        result_lines.append(line)

    fixed_content = '\n'.join(result_lines)

    with open(file_path, 'w') as f:
        f.write(fixed_content)

    print(f"  ✓ Fixed {file_path}")


def fix_dto_file(file_path):
    """Fix DTO files by making tenantId optional"""
    print(f"Processing DTO {file_path}...")

    with open(file_path, 'r') as f:
        content = f.read()

    # Pattern: Find tenantId!: string and make it tenantId?: string | null
    original = content
    content = re.sub(r'tenantId!:\s*string;', 'tenantId?: string | null;', content)
    content = re.sub(r'tenantId:\s*string;', 'tenantId?: string | null;', content)

    if content != original:
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"  ✓ Fixed DTO {file_path}")
    else:
        print(f"  - No changes needed in {file_path}")


def fix_types_file(file_path):
    """Fix types files"""
    print(f"Processing types {file_path}...")

    with open(file_path, 'r') as f:
        content = f.read()

    # Pattern: Find tenantId: string and make it tenantId?: string | null
    original = content
    content = re.sub(r'tenantId:\s*string;', 'tenantId?: string | null;', content)
    content = re.sub(r'tenantId!:\s*string;', 'tenantId?: string | null;', content)

    if content != original:
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"  ✓ Fixed types {file_path}")
    else:
        print(f"  - No changes needed in {file_path}")


def main():
    base_path = '/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api'

    # List of controller files to fix
    controller_files = [
        'src/api/billing/enrollment.controller.ts',
        'src/api/billing/invoice.controller.ts',
        'src/api/communications/communication.controller.ts',
        'src/api/dashboard/dashboard.controller.ts',
        'src/api/integrations/simplepay.controller.ts',
        'src/api/parents/parent.controller.ts',
        'src/api/payment/payment.controller.ts',
        'src/api/reconciliation/reconciliation.controller.ts',
        'src/api/sars/sars.controller.ts',
        'src/api/settings/fee-structure.controller.ts',
        'src/api/settings/tenant.controller.ts',
        'src/api/staff/leave.controller.ts',
        'src/api/staff/offboarding.controller.ts',
        'src/api/staff/onboarding.controller.ts',
    ]

    # List of DTO/types files to fix
    dto_files = [
        'src/database/dto/emp201.dto.ts',
        'src/database/dto/fee-structure.dto.ts',
        'src/database/dto/invoice-delivery.dto.ts',
        'src/database/dto/leave.dto.ts',
        'src/database/dto/parent.dto.ts',
        'src/database/dto/payment-allocation.dto.ts',
        'src/database/dto/payment-matching.dto.ts',
        'src/database/dto/vat201.dto.ts',
        'src/communications/types/communication.types.ts',
    ]

    print("=" * 80)
    print("FIXING CONTROLLER FILES")
    print("=" * 80)
    for file_rel_path in controller_files:
        file_path = os.path.join(base_path, file_rel_path)
        if os.path.exists(file_path):
            try:
                fix_controller_file(file_path)
            except Exception as e:
                print(f"  ✗ Error fixing {file_path}: {e}")
        else:
            print(f"  ! File not found: {file_path}")

    print("\n" + "=" * 80)
    print("FIXING DTO/TYPES FILES")
    print("=" * 80)
    for file_rel_path in dto_files:
        file_path = os.path.join(base_path, file_rel_path)
        if os.path.exists(file_path):
            try:
                if '/dto/' in file_path:
                    fix_dto_file(file_path)
                else:
                    fix_types_file(file_path)
            except Exception as e:
                print(f"  ✗ Error fixing {file_path}: {e}")
        else:
            print(f"  ! File not found: {file_path}")

    print("\n" + "=" * 80)
    print("ALL FILES PROCESSED")
    print("=" * 80)


if __name__ == '__main__':
    main()
