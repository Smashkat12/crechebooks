#!/usr/bin/env ts-node
/**
 * Script to automatically fix tenantId TypeScript errors
 * Adds getTenantId import and replaces manual null checks
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface FileError {
  file: string;
  line: number;
  error: string;
}

function getTypeScriptErrors(): FileError[] {
  try {
    execSync('npx tsc --noEmit', { encoding: 'utf-8', stdio: 'pipe' });
    return [];
  } catch (error: any) {
    const output = error.stdout as string;
    const errors: FileError[] = [];

    const lines = output.split('\n');
    for (const line of lines) {
      const match = line.match(/^(.+?)\((\d+),\d+\): error TS2304: Cannot find name 'tenantId'/);
      if (match) {
        errors.push({
          file: match[1],
          line: parseInt(match[2]),
          error: line,
        });
      }
    }

    return errors;
  }
}

function fixFile(filePath: string): boolean {
  console.log(`\n📝 Fixing: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // 1. Add getTenantId import if not present
  if (!content.includes('getTenantId')) {
    const importRegex = /import type { IUser } from ['"].*user\.entity['"];/;
    const match = content.match(importRegex);

    if (match) {
      const importStatement = "\nimport { getTenantId } from '../auth/utils/tenant-assertions';";
      content = content.replace(importRegex, match[0] + importStatement);
      console.log('  ✓ Added getTenantId import');
      modified = true;
    }
  }

  // 2. Replace manual tenantId checks with getTenantId
  // Pattern 1: if (!user.tenantId) { throw new Error(...); }
  const pattern1 = /if \(!user\.tenantId\) \{[\s\S]*?throw new Error\(['"].*SUPER_ADMIN.*['"][\s\S]*?\);[\s\S]*?\}/g;
  if (pattern1.test(content)) {
    content = content.replace(
      pattern1,
      '// Extract and validate tenantId - TenantGuard ensures it exists\n    const tenantId = getTenantId(user);'
    );
    console.log('  ✓ Replaced manual null check with getTenantId');
    modified = true;
  }

  // Pattern 2: Check for lines that use tenantId without declaring it
  // This is trickier - we need to ensure const tenantId is declared in the method
  const lines = content.split('\n');
  const methodStarts: number[] = [];

  // Find all async method declarations
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/async \w+\(/)) {
      methodStarts.push(i);
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('  ✅ File updated');
    return true;
  }

  console.log('  ℹ️  No changes needed');
  return false;
}

function main() {
  console.log('🔍 Scanning for tenantId errors...\n');

  const errors = getTypeScriptErrors();

  if (errors.length === 0) {
    console.log('✅ No tenantId errors found!');
    return;
  }

  console.log(`Found ${errors.length} tenantId errors in ${new Set(errors.map(e => e.file)).size} files\n`);

  // Group errors by file
  const fileErrors = new Map<string, FileError[]>();
  for (const error of errors) {
    if (!fileErrors.has(error.file)) {
      fileErrors.set(error.file, []);
    }
    fileErrors.get(error.file)!.push(error);
  }

  let fixedCount = 0;
  for (const [file, errs] of fileErrors) {
    console.log(`\n${file} (${errs.length} errors)`);
    if (fixFile(file)) {
      fixedCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Summary:`);
  console.log(`   Files processed: ${fileErrors.size}`);
  console.log(`   Files modified: ${fixedCount}`);

  // Re-check errors
  console.log('\n🔍 Verifying fixes...\n');
  const remainingErrors = getTypeScriptErrors();
  console.log(`   Remaining errors: ${remainingErrors.length}`);

  if (remainingErrors.length === 0) {
    console.log('\n✅ All tenantId errors fixed!');
  } else {
    console.log('\n⚠️  Some errors remain. Manual review needed for:');
    const remainingFiles = new Set(remainingErrors.map(e => e.file));
    remainingFiles.forEach(file => console.log(`   - ${file}`));
  }
}

main();
