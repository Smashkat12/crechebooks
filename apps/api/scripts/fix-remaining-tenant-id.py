#!/usr/bin/env python3
"""
Automatically fix all remaining tenantId TypeScript errors
Replaces manual null checks with getTenantId() helper
"""

import os
import re
import subprocess
from pathlib import Path

def get_files_with_errors():
    """Get list of files with tenantId errors from TypeScript"""
    try:
        result = subprocess.run(
            ['npx', 'tsc', '--noEmit'],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent.parent
        )

        files = set()
        for line in result.stdout.splitlines() + result.stderr.splitlines():
            match = re.match(r'^(.+?)\(\d+,\d+\): error TS2304: Cannot find name \'tenantId\'', line)
            if match:
                files.add(match.group(1))

        return sorted(files)
    except Exception as e:
        print(f"Error getting TypeScript errors: {e}")
        return []

def fix_file(filepath):
    """Fix tenantId usage in a single file"""
    print(f"\nProcessing: {filepath}")

    if not os.path.exists(filepath):
        print(f"  ⚠️  File not found: {filepath}")
        return False

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    modified = False

    # 1. Add import if not present
    if 'getTenantId' not in content:
        # Find the user.entity import and add getTenantId after it
        user_import_patterns = [
            r"(import type { IUser } from ['\"].*user\.entity['\"];)",
            r"(import { IUser } from ['\"].*user\.entity['\"];)",
            r"(from ['\"].*user\.entity['\"];)"
        ]

        for pattern in user_import_patterns:
            if re.search(pattern, content):
                # Determine the correct path based on file location
                relative_path = '../auth/utils/tenant-assertions'
                if '/api/admin/' in filepath:
                    relative_path = '../../auth/utils/tenant-assertions'
                elif '/websocket/' in filepath:
                    relative_path = '../api/auth/utils/tenant-assertions'

                import_line = f"\nimport {{ getTenantId }} from '{relative_path}';"
                content = re.sub(pattern, r'\1' + import_line, content, count=1)
                print(f"  ✓ Added getTenantId import")
                modified = True
                break

    # 2. Replace manual tenantId checks
    # Pattern: if (!user.tenantId) { throw new Error(...); }
    pattern = r'if \(!user\.tenantId\) \{\s*throw new Error\([^)]+SUPER_ADMIN[^)]+\);\s*\}'
    replacement = '// Extract and validate tenantId - TenantGuard ensures it exists\n    const tenantId = getTenantId(user);'

    new_content, count = re.subn(pattern, replacement, content, flags=re.MULTILINE | re.DOTALL)
    if count > 0:
        content = new_content
        print(f"  ✓ Replaced {count} manual null check(s)")
        modified = True

    # 3. Save if modified
    if modified and content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  ✅ File updated")
        return True
    else:
        print(f"  ℹ️  No changes needed")
        return False

def main():
    print("🔍 Scanning for tenantId errors...")

    files = get_files_with_errors()

    if not files:
        print("\n✅ No tenantId errors found!")
        return

    print(f"\nFound {len(files)} file(s) with tenantId errors\n")

    fixed_count = 0
    for filepath in files:
        if fix_file(filepath):
            fixed_count += 1

    print("\n" + "="*60)
    print(f"\n📊 Summary:")
    print(f"   Files processed: {len(files)}")
    print(f"   Files modified: {fixed_count}")

    # Re-check errors
    print("\n🔍 Verifying fixes...\n")
    remaining_files = get_files_with_errors()

    if not remaining_files:
        print("✅ All tenantId errors fixed!")
    else:
        print(f"⚠️  {len(remaining_files)} file(s) still have errors:")
        for f in remaining_files:
            print(f"   - {f}")
        print("\nManual review may be needed for complex patterns.")

if __name__ == '__main__':
    main()
