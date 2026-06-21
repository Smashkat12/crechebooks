// SPDX-License-Identifier: MIT
// Emit an SPDX-2.3 Software Bill of Materials for the harness, derived from
// package.json + the installed versions in node_modules. Zero external deps.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { manifestSha } from './manifest.js';

function installedVersion(root, name, declared) {
  try {
    return JSON.parse(readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
  } catch {
    return String(declared).replace(/^[\^~>=<\s]*/, '') || 'NOASSERTION';
  }
}

/** Build an SPDX-2.3 document object for the harness package. */
export function buildSbom(root, { now } = {}) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const runtime = pkg.dependencies ?? {};
  const dev = pkg.devDependencies ?? {};
  const all = [
    ...Object.keys(runtime).map((n) => [n, runtime[n], false]),
    ...Object.keys(dev).map((n) => [n, dev[n], true]),
  ].sort((a, b) => a[0].localeCompare(b[0]));

  const ROOT_ID = 'SPDXRef-Package-0';
  const packages = [
    {
      SPDXID: ROOT_ID,
      name: pkg.name,
      versionInfo: pkg.version,
      downloadLocation: 'NOASSERTION',
      filesAnalyzed: false,
      licenseConcluded: pkg.license ?? 'NOASSERTION',
      licenseDeclared: pkg.license ?? 'NOASSERTION',
      supplier: 'NOASSERTION',
    },
  ];
  const relationships = [
    { spdxElementId: 'SPDXRef-DOCUMENT', relatedSpdxElement: ROOT_ID, relationshipType: 'DESCRIBES' },
  ];

  all.forEach(([name, declared, isDev], i) => {
    const id = `SPDXRef-Package-${i + 1}`;
    const version = installedVersion(root, name, declared);
    packages.push({
      SPDXID: id,
      name,
      versionInfo: version,
      downloadLocation: `https://registry.npmjs.org/${name}`,
      filesAnalyzed: false,
      licenseConcluded: 'NOASSERTION',
      licenseDeclared: 'NOASSERTION',
      supplier: 'NOASSERTION',
      externalRefs: [
        { referenceCategory: 'PACKAGE-MANAGER', referenceType: 'purl', referenceLocator: `pkg:npm/${name}@${version}` },
      ],
    });
    // SPDX direction: DEPENDS_ON points root→dep; DEV_DEPENDENCY_OF points dep→root.
    relationships.push(
      isDev
        ? { spdxElementId: id, relatedSpdxElement: ROOT_ID, relationshipType: 'DEV_DEPENDENCY_OF' }
        : { spdxElementId: ROOT_ID, relatedSpdxElement: id, relationshipType: 'DEPENDS_ON' },
    );
  });

  // Content-addressed namespace: stable for a given manifest, unique across releases.
  const ns = existsSync(path.join(root, '.harness', 'manifest.json')) ? manifestSha(root).slice(0, 16) : '0';
  return {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `${pkg.name}@${pkg.version}`,
    documentNamespace: `https://spdx.org/spdxdocs/${pkg.name}-${pkg.version}-${ns}`,
    creationInfo: {
      created: now ?? null,
      creators: ['Tool: crechebooks-harness sbom', 'Organization: crechebooks'],
    },
    packages,
    relationships,
  };
}
