#!/usr/bin/env python3
"""
Add missing 'const tenantId = getTenantId(user);' declarations
to methods that use tenantId but don't declare it
"""

import os
import re
import subprocess

def get_errors():
    """Get TypeScript errors"""
    try:
        result = subprocess.run(
            ['npx', 'tsc', '--noEmit'],
            capture_output=True,
            text=True
        )

        errors = {}
        for line in result.stdout.splitlines() + result.stderr.splitlines():
            match = re.match(r'^(.+?)\((\d+),\d+\): error TS2304: Cannot find name \'tenantId\'', line)
            if match:
                file, line_num = match.group(1), int(match.group(2))
                if file not in errors:
                    errors[file] = []
                errors[file].append(line_num)

        return errors
    except Exception as e:
        print(f"Error: {e}")
        return {}

def find_method_start(lines, error_line):
    """Find the start of the method containing the error"""
    # Work backwards from error line to find method declaration
    for i in range(error_line - 1, max(0, error_line - 100), -1):
        line = lines[i]
        # Look for method declarations
        if re.match(r'\s*(async\s+)?\w+\s*\(', line):
            # Find the opening brace
            for j in range(i, min(len(lines), i + 20)):
                if '{' in lines[j]:
                    return j + 1  # Return line after opening brace
    return None

def fix_file(filepath, error_lines):
    """Add missing tenantId declarations"""
    print(f"\n📝 {filepath}")

    with open(filepath, 'r') as f:
        lines = f.readlines()

    original_lines = lines[:]
    methods_fixed = set()

    for error_line in sorted(error_lines):
        method_start = find_method_start(lines, error_line)

        if method_start and method_start not in methods_fixed:
            # Check if this method already has tenantId declared
            method_block = ''.join(lines[method_start:min(method_start + 50, len(lines))])

            if 'const tenantId' not in method_block:
                # Add the declaration
                indent = len(lines[method_start]) - len(lines[method_start].lstrip())
                declaration = ' ' * indent + 'const tenantId = getTenantId(user);\n\n'

                lines.insert(method_start, declaration)
                methods_fixed.add(method_start)
                print(f"  ✓ Added tenantId declaration at line {method_start + 1}")

    if lines != original_lines:
        with open(filepath, 'w') as f:
            f.writelines(lines)
        print(f"  ✅ Fixed {len(methods_fixed)} method(s)")
        return True
    else:
        print(f"  ℹ️  No changes needed")
        return False

def main():
    print("🔍 Finding methods missing tenantId declarations...\n")

    errors = get_errors()

    if not errors:
        print("✅ No errors found!")
        return

    print(f"Found errors in {len(errors)} file(s)\n")

    fixed_count = 0
    for filepath, error_lines in errors.items():
        if fix_file(filepath, error_lines):
            fixed_count += 1

    print("\n" + "="*60)
    print(f"\n📊 Summary:")
    print(f"   Files processed: {len(errors)}")
    print(f"   Files modified: {fixed_count}")

    # Recheck
    print("\n🔍 Verifying...\n")
    remaining = get_errors()
    total_remaining = sum(len(v) for v in remaining.values())

    print(f"   Remaining errors: {total_remaining}")

    if total_remaining == 0:
        print("\n✅ All errors fixed!")
    elif total_remaining < len(sum(errors.values(), [])):
        print(f"\n✓ Reduced errors by {len(sum(errors.values(), [])) - total_remaining}")

if __name__ == '__main__':
    main()
