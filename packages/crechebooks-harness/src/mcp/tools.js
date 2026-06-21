// SPDX-License-Identifier: MIT
// The crechebooks-harness MCP toolset (coding vertical).
//
// Design principle (from the 2026 "trust your agents" theme): safe by default.
// Every tool is read-only inspection OR runs the project's *own* declared test
// script — there is NO generic "run any shell command" tool, so an agent
// driving this server cannot exfiltrate or mutate beyond what's declared here.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadKernel, kernelDiagnostics } from '@metaharness/kernel';

const pexec = promisify(execFile);
const HARNESS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIG = 10 * 1024 * 1024;

/** kernel_info — report the resolved kernel backend and version (diagnostics). */
async function kernelInfo() {
  const kernel = await loadKernel();
  const info = kernel.kernelInfo();
  const diag = await kernelDiagnostics();
  return {
    version: info.version,
    backend: kernel.backend,
    target: info.target,
    resolved: diag.resolved,
    reasons: diag.reasons,
  };
}

/** harness_doctor — the same end-to-end health check as the CLI `doctor`. */
async function harnessDoctor() {
  const kernel = await loadKernel();
  const info = kernel.kernelInfo();
  const checks = [
    ['kernel loads', !!kernel],
    ['kernel reports a version', typeof info.version === 'string' && info.version.length > 0],
    ['kernel backend is native|wasm|js', ['native', 'wasm', 'js'].includes(kernel.backend)],
  ];
  const lines = checks.map(([label, pass]) => `${pass ? 'PASS' : 'FAIL'} ${label}`);
  const ok = checks.every(([, pass]) => pass);
  lines.push('', ok ? `crechebooks-harness: healthy (kernel ${info.version}, ${kernel.backend})` : 'crechebooks-harness: doctor found problems');
  return lines.join('\n');
}

/** list_agents — the harness's agent roster, parsed from src/agents/*.ts. */
async function listAgents() {
  const dir = path.join(HARNESS_ROOT, 'src', 'agents');
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.ts'));
  } catch {
    return [];
  }
  const agents = [];
  for (const f of files.sort()) {
    const txt = await readFile(path.join(dir, f), 'utf8');
    const name = txt.match(/NAME\s*=\s*'([^']+)'/)?.[1] ?? f.replace(/\.ts$/, '');
    const tier = txt.match(/TIER\s*=\s*'([^']+)'/)?.[1] ?? 'unknown';
    const role = txt.match(/SYSTEM_PROMPT\s*=\s*`([^.]+)\./)?.[1]?.trim() ?? '';
    agents.push({ name, tier, role });
  }
  return agents;
}

/** plan_change — hand the planner the plan-change skill guide + the request. */
async function planChange(args) {
  const request = typeof args.request === 'string' && args.request.trim() ? args.request.trim() : '(no request provided)';
  const skillPath = path.join(HARNESS_ROOT, '.claude', 'skills', 'plan-change', 'SKILL.md');
  let guide = '';
  try {
    guide = await readFile(skillPath, 'utf8');
  } catch {
    guide = '1. Restate the goal. 2. List files to touch. 3. Name the smallest interface. 4. Flag >3-file ripples.';
  }
  return `# Plan request\n\n${request}\n\n---\n\n${guide}`;
}

/** review_diff — return the working diff (read-only) for the reviewer agent. */
async function reviewDiff(args) {
  const gitArgs = ['diff'];
  if (args.staged) gitArgs.push('--staged');
  if (typeof args.path === 'string' && args.path) gitArgs.push('--', args.path);
  try {
    const { stdout } = await pexec('git', gitArgs, { cwd: process.cwd(), maxBuffer: BIG });
    return stdout.trim() || '(no changes in working tree)';
  } catch (err) {
    return `git diff failed: ${err.message}`;
  }
}

/** run_tests — run the project's OWN test script (npm/pnpm), nothing arbitrary. */
async function runTests() {
  const cwd = process.cwd();
  const pm = existsSync(path.join(cwd, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm';
  try {
    const { stdout, stderr } = await pexec(pm, ['test'], { cwd, timeout: 10 * 60 * 1000, maxBuffer: BIG });
    return `PASS (${pm} test)\n\n${(stdout + stderr).trim().slice(-8000)}`;
  } catch (err) {
    const out = ((err.stdout || '') + (err.stderr || '')).trim().slice(-8000);
    return `FAIL (${pm} test)\n\n${out || err.message}`;
  }
}

export const harnessToolset = [
  {
    name: 'kernel_info',
    description: 'Report the resolved metaharness kernel backend (native/wasm/js), version, and why higher tiers were unavailable.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: kernelInfo,
  },
  {
    name: 'harness_doctor',
    description: 'Run the harness end-to-end health check (kernel load + version + backend).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: harnessDoctor,
  },
  {
    name: 'list_agents',
    description: 'List the harness agent roster (name, model tier, role) parsed from src/agents.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: listAgents,
  },
  {
    name: 'plan_change',
    description: 'Produce a minimal file-level implementation plan for a change request, using the plan-change skill.',
    inputSchema: {
      type: 'object',
      properties: { request: { type: 'string', description: 'The feature/change to plan.' } },
      required: ['request'],
    },
    handler: planChange,
  },
  {
    name: 'review_diff',
    description: 'Return the current git diff (read-only) for review. Optionally staged-only or a single path.',
    inputSchema: {
      type: 'object',
      properties: {
        staged: { type: 'boolean', description: 'Diff the staged index instead of the working tree.' },
        path: { type: 'string', description: 'Limit the diff to one path.' },
      },
      additionalProperties: false,
    },
    handler: reviewDiff,
  },
  {
    name: 'run_tests',
    description: "Run the project's own test script (pnpm/npm test) in the current directory and return the tail of output.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: runTests,
  },
];
