// SPDX-License-Identifier: MIT
// Protocol-level smoke test for the harness MCP server. Drives the pure
// `handleRpc` so it never spawns a process or touches real stdio, and a
// round-trip test through `serve()` with injected streams to prove the
// newline-delimited JSON-RPC framing works end to end.

import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { createRegistry, handleRpc, serve } from '../src/mcp/server.js';
import { harnessToolset } from '../src/mcp/tools.js';
import { indexToolset } from '../src/mcp/index-tools.js';

const SERVER = 'crechebooks-harness';
const info = { name: SERVER, version: '0.1.0' };
const reg = createRegistry(SERVER, harnessToolset);

describe('mcp server — handleRpc', () => {
  it('initialize echoes the protocol version and advertises tools', async () => {
    const r = await handleRpc(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
      reg,
      info,
    );
    expect(r?.result.protocolVersion).toBe('2025-06-18');
    expect(r?.result.serverInfo.name).toBe(SERVER);
    expect(r?.result.capabilities.tools).toBeTruthy();
  });

  it('tools/list returns the toolset with valid object schemas', async () => {
    const r = await handleRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, reg, info);
    const names = r?.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(['kernel_info', 'harness_doctor', 'plan_change', 'review_diff', 'run_tests']));
    for (const t of r?.result.tools) expect(t.inputSchema.type).toBe('object');
  });

  it('tools/call kernel_info dispatches through the kernel and returns text', async () => {
    const r = await handleRpc(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'kernel_info', arguments: {} } },
      reg,
      info,
    );
    expect(r?.result.isError).toBeFalsy();
    expect(r?.result.content[0].text).toMatch(/backend/);
  });

  it('tools/call plan_change returns the plan scaffold', async () => {
    const r = await handleRpc(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'plan_change', arguments: { request: 'add a foo endpoint' } } },
      reg,
      info,
    );
    expect(r?.result.content[0].text).toContain('add a foo endpoint');
  });

  it('an unknown tool is a tool error, not a thrown crash', async () => {
    const r = await handleRpc(
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope', arguments: {} } },
      reg,
      info,
    );
    expect(r?.result.isError).toBe(true);
  });

  it('notifications get no response', async () => {
    const r = await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, reg, info);
    expect(r).toBeNull();
  });

  it('unknown request method → JSON-RPC method-not-found', async () => {
    const r = await handleRpc({ jsonrpc: '2.0', id: 6, method: 'does/not/exist' }, reg, info);
    expect(r?.error.code).toBe(-32601);
  });
});

describe('mcp server — stdio framing via serve()', () => {
  it('reads a JSON line and writes a JSON-RPC response line', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const lines: string[] = [];
    output.on('data', (b) => lines.push(...b.toString().split('\n').filter(Boolean)));

    const done = serve(reg, info, { input, output });
    input.write(JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'tools/list' }) + '\n');
    input.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    input.end();
    await done;

    expect(lines).toHaveLength(1); // the notification produced no line
    const msg = JSON.parse(lines[0]);
    expect(msg.id).toBe(10);
    expect(msg.result.tools.length).toBeGreaterThan(0);
  });
});

describe('mcp code_index server', () => {
  it('exposes read-only search/list/read tools', async () => {
    const ireg = createRegistry('code_index', indexToolset);
    const r = await handleRpc({ jsonrpc: '2.0', id: 20, method: 'tools/list' }, ireg, { name: 'code_index', version: '0.1.0' });
    const names = r?.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(['search_code', 'list_files', 'read_file']));
  });

  it('read_file refuses to escape the working directory', async () => {
    const ireg = createRegistry('code_index', indexToolset);
    const r = await handleRpc(
      { jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: 'read_file', arguments: { path: '../../../etc/passwd' } } },
      ireg,
      { name: 'code_index', version: '0.1.0' },
    );
    expect(r?.result.content[0].text).toContain('denied');
  });

  it('read_file refuses secret/credential files (.env, .env.*, keys)', async () => {
    const ireg = createRegistry('code_index', indexToolset);
    const info = { name: 'code_index', version: '0.1.0' };
    for (const p of ['.env', '.env.production', 'apps/api/.env.local', 'deploy/id_rsa', 'certs/server.pem', '.ssh/config']) {
      const r = await handleRpc(
        { jsonrpc: '2.0', id: 22, method: 'tools/call', params: { name: 'read_file', arguments: { path: p } } },
        ireg,
        info,
      );
      expect(r?.result.content[0].text, p).toContain('denied: refusing to read a secret');
    }
  });

  it('read_file follows symlinks but cannot escape via one (realpath guard)', async () => {
    // A symlink inside cwd pointing outside it must still be denied. Build it in
    // an isolated temp tree and run the tool with that tree as cwd.
    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'cb-harness-sym-'));
    const link = path.join(base, 'escape');
    await fs.symlink('/etc', link); // symlink → outside the temp cwd
    const cwd = process.cwd();
    process.chdir(base);
    try {
      const ireg = createRegistry('code_index', indexToolset);
      const r = await handleRpc(
        { jsonrpc: '2.0', id: 23, method: 'tools/call', params: { name: 'read_file', arguments: { path: 'escape/passwd' } } },
        ireg,
        { name: 'code_index', version: '0.1.0' },
      );
      expect(r?.result.content[0].text).toContain('denied: path escapes');
    } finally {
      process.chdir(cwd);
      await fs.rm(base, { recursive: true, force: true });
    }
  });
});
