// SPDX-License-Identifier: MIT
// Integrity manifest: a content-addressed map of every source file in the
// harness (sha256), plus a sidecar hash of the manifest itself. This is the
// substrate the `sign`/`verify` gates attest and `validate` re-checks.
//
// The `.harness/` directory (this manifest, the witness signature, the SBOM,
// the keypair) is generated provenance and is excluded from the hashed set —
// the manifest attests the *source*, the witness signs the *manifest*.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const SKIP = new Set(['node_modules', '.git', '.harness', '.metaharness']);

const sha256Hex = (buf) => createHash('sha256').update(buf).digest('hex');

/** Recursively hash every source file under `root` (deterministic, sorted). */
export function computeFiles(root) {
  const files = {};
  const walk = (dir) => {
    // withFileTypes: the entry's type comes from the directory read itself, so
    // there is no separate stat→read on the same path (avoids a TOCTOU race).
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files[path.relative(root, full)] = sha256Hex(readFileSync(full));
    }
  };
  walk(root);
  return files;
}

const manifestPath = (root) => path.join(root, '.harness', 'manifest.json');
const sidecarPath = (root) => path.join(root, '.harness', 'manifest.sha256');

export function readManifest(root) {
  return JSON.parse(readFileSync(manifestPath(root), 'utf8'));
}

/** sha256 of the manifest.json file as it sits on disk — what the witness signs. */
export function manifestSha(root) {
  return sha256Hex(readFileSync(manifestPath(root)));
}

/**
 * Rewrite the manifest's file map to current state. To avoid churn, only writes
 * (and bumps `generated_at`) when the file set actually changed. Returns whether
 * it changed.
 */
export function refreshManifest(root, { now } = {}) {
  const manifest = readManifest(root);
  const files = computeFiles(root);
  const changed = JSON.stringify(manifest.files) !== JSON.stringify(files);
  if (changed) {
    manifest.files = files;
    if (now) manifest.generated_at = now;
    const json = JSON.stringify(manifest, null, 2) + '\n';
    writeFileSync(manifestPath(root), json);
    writeFileSync(sidecarPath(root), sha256Hex(Buffer.from(json)) + '\n');
  }
  return { changed, count: Object.keys(files).length };
}

/**
 * Compare current source against the manifest. Reports drift (missing/changed/
 * extra files) and whether the manifest.sha256 sidecar still matches.
 */
export function checkIntegrity(root) {
  const manifest = readManifest(root);
  const current = computeFiles(root);
  const missing = [];
  const changed = [];
  const extra = [];
  for (const [file, hash] of Object.entries(manifest.files)) {
    if (!(file in current)) missing.push(file);
    else if (current[file] !== hash) changed.push(file);
  }
  for (const file of Object.keys(current)) if (!(file in manifest.files)) extra.push(file);
  let sidecarOk = false;
  try {
    sidecarOk = readFileSync(sidecarPath(root), 'utf8').trim() === manifestSha(root);
  } catch {
    sidecarOk = false;
  }
  return {
    ok: missing.length === 0 && changed.length === 0 && extra.length === 0 && sidecarOk,
    count: Object.keys(manifest.files).length,
    missing,
    changed,
    extra,
    sidecarOk,
  };
}
