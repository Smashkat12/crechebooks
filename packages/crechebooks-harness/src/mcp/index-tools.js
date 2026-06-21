// SPDX-License-Identifier: MIT
// The `code_index` MCP toolset — read-only code search/navigation for the repo
// the harness is launched in. Backs the second MCP server wired in
// .claude/settings.json (`crechebooks-harness mcp index`).
//
// Security model (defense in depth, enforced HERE not just in settings.json —
// the MCP server may run outside that permission context):
//   - every tool is read-only and confined to the working directory;
//   - the path check uses realpath on both sides, so a symlink inside the repo
//     that points outside it cannot escape;
//   - a secret/credential denylist (.env*, keys, npmrc, …) is refused by
//     read_file and filtered out of search_code / list_files results, matching
//     (and exceeding) the Read(./.env*) deny rule in settings.json.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

const pexec = promisify(execFile);
const BIG = 8 * 1024 * 1024;

const clampLines = (s, max) => s.split('\n').slice(0, max).join('\n');

// Files we refuse to read or surface, regardless of where they sit. Matched
// against a forward-slash-normalised path (relative or absolute both work).
const SECRET_PATTERNS = [
  /(^|\/)\.env(\.[^/]*)?$/i, // .env, .env.local, .env.production, .env.staging
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)\.pgpass$/i,
  /(^|\/)\.git-credentials$/i,
  /(^|\/)\.ssh\//i,
  /(^|\/)\.aws\/credentials$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/i,
  /\.pem$/i,
  /\.key$/i,
  /(^|\/)secrets?\.(ya?ml|json|env|txt)$/i,
];

const isSecretPath = (p) => {
  const norm = String(p).replace(/\\/g, '/');
  return SECRET_PATTERNS.some((re) => re.test(norm));
};

// ripgrep globs that stop secret files being scanned in the first place
// (perf + belt-and-braces with the post-filter below).
const SECRET_GLOBS = ['!.env', '!.env.*', '!*.pem', '!*.key', '!**/.ssh/**', '!.npmrc', '!.netrc', '!.git-credentials', '!.pgpass'];

/**
 * Resolve `rel` under `cwd`, following symlinks, and confirm the REAL path
 * stays inside the REAL cwd. Returns the real absolute path, or null if it
 * escapes / can't be resolved. Handles not-yet-existing paths by realpath'ing
 * the parent directory (a symlinked parent still can't escape).
 */
async function safeResolve(cwd, rel) {
  const abs = path.resolve(cwd, rel);
  let realCwd;
  try {
    realCwd = await realpath(cwd);
  } catch {
    return null;
  }
  let realAbs;
  try {
    realAbs = await realpath(abs);
  } catch (err) {
    if (err.code !== 'ENOENT') return null;
    try {
      const realParent = await realpath(path.dirname(abs));
      realAbs = path.join(realParent, path.basename(abs));
    } catch {
      return null;
    }
  }
  if (realAbs !== realCwd && !realAbs.startsWith(realCwd + path.sep)) return null;
  return realAbs;
}

/** Drop result lines (`path:line:...`) whose file matches the secret denylist. */
const filterSecretLines = (out) =>
  out
    .split('\n')
    .filter((ln) => {
      if (!ln) return false;
      const file = ln.split(':', 1)[0];
      return !isSecretPath(file);
    })
    .join('\n');

/** search_code — ripgrep if present, else grep. Confined to cwd; secrets filtered. */
async function searchCode(args) {
  const query = String(args.query ?? '').trim();
  if (!query) return '(empty query)';
  const max = Math.min(Number(args.max) || 80, 400);
  const cwd = process.cwd();
  try {
    const rgArgs = ['--line-number', '--no-heading', '--color', 'never', '--max-count', '8'];
    for (const g of SECRET_GLOBS) rgArgs.push('--glob', g);
    if (args.glob) rgArgs.push('--glob', String(args.glob));
    rgArgs.push('-e', query);
    const { stdout } = await pexec('rg', rgArgs, { cwd, maxBuffer: BIG });
    return clampLines(filterSecretLines(stdout), max) || '(no matches)';
  } catch (err) {
    if (err.code === 'ENOENT') {
      try {
        const { stdout } = await pexec('grep', ['-rIn', '--exclude=.env*', '--exclude=*.pem', '--exclude=*.key', '--', query, '.'], {
          cwd,
          maxBuffer: BIG,
        });
        return clampLines(filterSecretLines(stdout), max) || '(no matches)';
      } catch (e2) {
        return e2.stdout ? clampLines(filterSecretLines(e2.stdout), max) : '(no matches)';
      }
    }
    // ripgrep exits 1 on "no matches" — surface stdout if any, else empty result.
    return err.stdout ? clampLines(filterSecretLines(err.stdout), max) : '(no matches)';
  }
}

/** list_files — git-tracked files (optionally glob-filtered); secrets filtered out. */
async function listFiles(args) {
  const cwd = process.cwd();
  const a = ['ls-files'];
  if (args.glob) a.push(String(args.glob));
  try {
    const { stdout } = await pexec('git', a, { cwd, maxBuffer: BIG });
    const files = stdout
      .trim()
      .split('\n')
      .filter((f) => f && !isSecretPath(f));
    return clampLines(files.join('\n'), 800) || '(none)';
  } catch (err) {
    return `git ls-files failed: ${err.message}`;
  }
}

/** read_file — read a file under cwd, with symlink-safe traversal guard, secret
 * denylist, and a size cap. */
async function readFileTool(args) {
  const cwd = process.cwd();
  const rel = String(args.path ?? '');
  if (!rel) return 'denied: no path given';
  // Refuse by the requested name first (cheap, before any FS access).
  if (isSecretPath(rel)) return 'denied: refusing to read a secret/credential file';
  const real = await safeResolve(cwd, rel);
  if (!real) return 'denied: path escapes the working directory';
  // …and by the resolved real path, in case a symlink points at a secret.
  if (isSecretPath(path.relative(cwd, real)) || isSecretPath(real)) {
    return 'denied: refusing to read a secret/credential file';
  }
  const maxBytes = Math.min(Number(args.maxBytes) || 64 * 1024, 512 * 1024);
  try {
    const buf = await readFile(real);
    const text = buf.subarray(0, maxBytes).toString('utf8');
    return buf.length > maxBytes ? `${text}\n... [truncated at ${maxBytes} bytes of ${buf.length}]` : text;
  } catch (err) {
    return `read failed: ${err.message}`;
  }
}

export const indexToolset = [
  {
    name: 'search_code',
    description: 'Search the current repo for a pattern (ripgrep/grep). Read-only, confined to the working directory; secret files excluded.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Pattern to search for.' },
        glob: { type: 'string', description: 'Optional path glob filter, e.g. "*.ts".' },
        max: { type: 'number', description: 'Max result lines (default 80).' },
      },
      required: ['query'],
    },
    handler: searchCode,
  },
  {
    name: 'list_files',
    description: 'List git-tracked files in the current repo, optionally filtered by a glob; secret files excluded.',
    inputSchema: {
      type: 'object',
      properties: { glob: { type: 'string', description: 'Optional pathspec, e.g. "src/**/*.ts".' } },
      additionalProperties: false,
    },
    handler: listFiles,
  },
  {
    name: 'read_file',
    description: 'Read a file under the working directory (symlink-safe traversal guard, secret-file denylist, size-capped).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the working directory.' },
        maxBytes: { type: 'number', description: 'Max bytes to return (default 65536, cap 524288).' },
      },
      required: ['path'],
    },
    handler: readFileTool,
  },
];
