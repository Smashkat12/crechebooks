// SPDX-License-Identifier: MIT
// Release-gate tests: SBOM shape, MCP scan, and the Ed25519 sign→verify→tamper
// round-trip (run in an isolated temp dir so it never touches the real package).

import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSbom } from '../src/gates/sbom.js';
import { scanMcp } from '../src/gates/mcp-scan.js';
import { signManifest, verifyWitness } from '../src/gates/sign.js';
import { refreshManifest, checkIntegrity } from '../src/gates/manifest.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('sbom', () => {
  it('emits a valid SPDX-2.3 document describing the package + deps', () => {
    const doc = buildSbom(ROOT, { now: '2026-01-01T00:00:00.000Z' });
    expect(doc.spdxVersion).toBe('SPDX-2.3');
    expect(doc.SPDXID).toBe('SPDXRef-DOCUMENT');
    const names = doc.packages.map((p: { name: string }) => p.name);
    expect(names).toContain('crechebooks-harness');
    expect(names).toContain('@metaharness/kernel');
    // every dependency package carries a purl external ref
    const deps = doc.packages.filter((p: { SPDXID: string }) => p.SPDXID !== 'SPDXRef-Package-0');
    for (const d of deps) expect(d.externalRefs[0].referenceType).toBe('purl');
    expect(doc.relationships.some((r: { relationshipType: string }) => r.relationshipType === 'DESCRIBES')).toBe(true);
  });
});

describe('mcp-scan', () => {
  it('audits the MCP surface and passes (no HIGH findings)', () => {
    const res = scanMcp(ROOT);
    expect(Array.isArray(res.findings)).toBe(true);
    expect(res.ok).toBe(true);
    // our deny-list + execFile-only handlers mean no high-severity findings
    expect(res.findings.some((f: { severity: string }) => f.severity === 'high')).toBe(false);
  });
});

describe('sign → verify (Ed25519, isolated temp harness)', () => {
  async function tempHarness() {
    const dir = await mkdtemp(path.join(tmpdir(), 'cb-gates-'));
    await mkdir(path.join(dir, '.harness'), { recursive: true });
    await mkdir(path.join(dir, 'src'), { recursive: true });
    await writeFile(path.join(dir, 'src', 'a.js'), 'export const a = 1;\n');
    // seed a manifest the gates can refresh/sign
    const manifest = { schema: 1, files: {}, generated_at: '2026-01-01T00:00:00.000Z' };
    await writeFile(path.join(dir, '.harness', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    refreshManifest(dir, { now: '2026-01-01T00:00:00.000Z' });
    return dir;
  }

  it('a fresh signature verifies, and integrity holds', async () => {
    const dir = await tempHarness();
    try {
      signManifest(dir, { now: '2026-01-01T00:00:00.000Z', signer: 'test' });
      const v = verifyWitness(dir);
      expect(v.ok).toBe(true);
      expect(checkIntegrity(dir).ok).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('tampering the manifest after signing fails verification', async () => {
    const dir = await tempHarness();
    try {
      signManifest(dir, { now: '2026-01-01T00:00:00.000Z' });
      // mutate a tracked source file, then refresh the manifest → witness is stale
      await writeFile(path.join(dir, 'src', 'a.js'), 'export const a = 999; // tampered\n');
      refreshManifest(dir, { now: '2026-02-01T00:00:00.000Z' });
      const v = verifyWitness(dir);
      expect(v.ok).toBe(false);
      expect(v.reason).toMatch(/changed since signing/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('detects source drift against the manifest', async () => {
    const dir = await tempHarness();
    try {
      // add a file the manifest doesn't know about → "extra" drift
      await writeFile(path.join(dir, 'src', 'b.js'), 'export const b = 2;\n');
      const integ = checkIntegrity(dir);
      expect(integ.ok).toBe(false);
      expect(integ.extra).toContain(path.join('src', 'b.js'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
