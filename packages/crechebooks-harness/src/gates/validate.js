// SPDX-License-Identifier: MIT
// `validate` — run every release gate and aggregate a PASS/FAIL report. A fresh
// harness passes (signature/sbom are "skipped" until you produce them); once
// signed + SBOM'd, those gates become enforcing.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadKernel } from '@metaharness/kernel';
import { checkIntegrity } from './manifest.js';
import { hasWitness, verifyWitness } from './sign.js';
import { scanMcp } from './mcp-scan.js';

export async function validate(root) {
  const gates = [];

  // 1. doctor — the kernel resolves and reports a version.
  try {
    const kernel = await loadKernel();
    const info = kernel.kernelInfo();
    const ok = ['native', 'wasm', 'js'].includes(kernel.backend) && typeof info.version === 'string' && info.version.length > 0;
    gates.push({ name: 'doctor', ok, detail: `kernel ${info.version} (${kernel.backend})` });
  } catch (err) {
    gates.push({ name: 'doctor', ok: false, detail: `kernel failed to load: ${err.message}` });
  }

  // 2. manifest-integrity — source matches the manifest, sidecar matches.
  const integ = checkIntegrity(root);
  gates.push({
    name: 'manifest-integrity',
    ok: integ.ok,
    detail: integ.ok
      ? `${integ.count} files verified`
      : `drift — missing ${integ.missing.length}, changed ${integ.changed.length}, extra ${integ.extra.length}${integ.sidecarOk ? '' : ', sidecar mismatch'}`,
  });

  // 3. signature — verify the witness if present; skip (pass) if unsigned.
  if (hasWitness(root)) {
    const v = verifyWitness(root);
    gates.push({ name: 'signature', ok: v.ok, detail: v.reason });
  } else {
    gates.push({ name: 'signature', ok: true, skipped: true, detail: 'unsigned — run `sign` to add provenance' });
  }

  // 4. sbom — present if produced; skip (pass) if absent.
  const sbomPath = path.join(root, '.harness', 'sbom.spdx.json');
  if (existsSync(sbomPath)) {
    gates.push({ name: 'sbom', ok: true, detail: 'SPDX-2.3 present (.harness/sbom.spdx.json)' });
  } else {
    gates.push({ name: 'sbom', ok: true, skipped: true, detail: 'no SBOM — run `sbom` to emit one' });
  }

  // 5. mcp-scan — static audit of the MCP surface (fails only on HIGH).
  const scan = scanMcp(root);
  gates.push({
    name: 'mcp-scan',
    ok: scan.ok,
    detail: `${scan.findings.length} finding(s), worst: ${scan.worst}`,
  });

  return { ok: gates.every((g) => g.ok), gates };
}
