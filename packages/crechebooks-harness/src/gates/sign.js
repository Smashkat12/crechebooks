// SPDX-License-Identifier: MIT
// Ed25519 witness signing over the integrity manifest. Uses Node's built-in
// crypto (no external dependency). `sign` generates a keypair on first use
// (private key stays local + gitignored), signs the manifest's sha256, and
// writes `.harness/witness.json`. `verify` re-checks the signature AND that the
// manifest hasn't changed since signing.

import { generateKeyPairSync, sign as edSign, verify as edVerify, createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { manifestSha } from './manifest.js';

const keyDir = (root) => path.join(root, '.harness', 'keys');
const privPath = (root) => path.join(keyDir(root), 'signing.key');
const pubPath = (root) => path.join(keyDir(root), 'signing.pub');
const witnessPath = (root) => path.join(root, '.harness', 'witness.json');

export const hasWitness = (root) => existsSync(witnessPath(root));

/** Generate the signing keypair if absent. Private key is mode 0600. */
export function ensureKeys(root) {
  mkdirSync(keyDir(root), { recursive: true });
  if (existsSync(privPath(root)) && existsSync(pubPath(root))) return { created: false };
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  writeFileSync(privPath(root), privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  writeFileSync(pubPath(root), publicKey.export({ type: 'spki', format: 'pem' }));
  return { created: true };
}

/** Sign the current manifest. Returns the witness object written to disk. */
export function signManifest(root, { now, signer } = {}) {
  const { created } = ensureKeys(root);
  const digestHex = manifestSha(root);
  const priv = createPrivateKey(readFileSync(privPath(root)));
  const signature = edSign(null, Buffer.from(digestHex, 'hex'), priv);
  const witness = {
    schema: 1,
    algorithm: 'ed25519',
    manifest_sha256: digestHex,
    signature: signature.toString('base64'),
    public_key_pem: readFileSync(pubPath(root), 'utf8'),
    signed_at: now ?? null,
    signer: signer ?? null,
  };
  writeFileSync(witnessPath(root), JSON.stringify(witness, null, 2) + '\n');
  return { witness, keypairCreated: created };
}

/** Verify the witness: signature valid AND manifest unchanged since signing. */
export function verifyWitness(root) {
  if (!hasWitness(root)) return { ok: false, reason: 'no witness.json — run `sign` first' };
  const witness = JSON.parse(readFileSync(witnessPath(root), 'utf8'));
  const currentDigest = manifestSha(root);
  if (witness.manifest_sha256 !== currentDigest) {
    return {
      ok: false,
      reason: `manifest changed since signing (signed ${witness.manifest_sha256.slice(0, 12)}…, now ${currentDigest.slice(0, 12)}…) — re-run \`manifest\` + \`sign\``,
      witness,
    };
  }
  let valid = false;
  try {
    valid = edVerify(
      null,
      Buffer.from(witness.manifest_sha256, 'hex'),
      createPublicKey(witness.public_key_pem),
      Buffer.from(witness.signature, 'base64'),
    );
  } catch (err) {
    return { ok: false, reason: `signature check errored: ${err.message}`, witness };
  }
  return { ok: valid, reason: valid ? 'signature valid; manifest unchanged' : 'signature INVALID', witness };
}
