// SPDX-License-Identifier: MIT
// Static security audit of the harness's MCP surface. Reads (never executes)
// .claude/settings.json and the src/mcp tool modules, flagging risky grants and
// dangerous code patterns. Pairs with the `validate` gate.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const RANK = { low: 1, medium: 2, high: 3 };

export function scanMcp(root) {
  const findings = [];
  const add = (severity, rule, detail) => findings.push({ severity, rule, detail });

  // 1. Permission grants in settings.json.
  const settingsPath = path.join(root, '.claude', 'settings.json');
  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    const allow = settings.permissions?.allow ?? [];
    const deny = settings.permissions?.deny ?? [];
    for (const a of allow) {
      if (a === 'mcp__*__*' || /^mcp__[A-Za-z0-9-]+__\*$/.test(a)) {
        add('low', 'wildcard-mcp-allow', `allow "${a}" grants every tool on the server; prefer explicit tool names`);
      }
    }
    if (!deny.some((d) => /\.env/i.test(d))) {
      add('medium', 'no-secret-deny', 'no Read(./.env*) deny rule in settings.json');
    }
    if (!deny.some((d) => /rm\s+-rf/i.test(d))) {
      add('low', 'no-rmrf-deny', 'no Bash(rm -rf*) deny rule');
    }
  } else {
    add('medium', 'no-settings', '.claude/settings.json not found');
  }

  // 2. Dangerous patterns in the tool modules.
  const mcpDir = path.join(root, 'src', 'mcp');
  if (existsSync(mcpDir)) {
    for (const file of readdirSync(mcpDir).filter((f) => f.endsWith('.js'))) {
      const txt = readFileSync(path.join(mcpDir, file), 'utf8');
      if (/shell\s*:\s*true/.test(txt)) add('high', 'shell-true', `${file}: spawns a child process with shell:true`);
      if (/\bchild_process\b/.test(txt) && /\bexec\s*\(/.test(txt) && !/execFile/.test(txt)) {
        add('high', 'exec-shell', `${file}: uses exec() (runs via a shell) — prefer execFile`);
      }
      if (/\beval\s*\(/.test(txt) || /new\s+Function\s*\(/.test(txt)) add('high', 'dynamic-eval', `${file}: uses eval()/new Function()`);
      // Network I/O — detect by the import (reliable) as well as direct fetch/
      // request calls (a module aliased as `mod.request()` evades a name match).
      if (
        /from\s+['"]node:(http|https|net|tls|dgram)['"]/.test(txt) ||
        /require\(['"]node:(http|https|net|tls|dgram)['"]\)/.test(txt) ||
        /\bfetch\s*\(/.test(txt) ||
        /\b(https?|net)\s*\.\s*(request|get|connect)\s*\(/.test(txt)
      ) {
        add('medium', 'network-io', `${file}: performs network I/O`);
      }
    }
  }

  const worstRank = findings.reduce((m, f) => Math.max(m, RANK[f.severity] ?? 0), 0);
  return {
    ok: worstRank < RANK.high, // pass unless a HIGH finding exists
    worst: ['none', 'low', 'medium', 'high'][worstRank],
    findings,
  };
}
