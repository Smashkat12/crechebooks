// SPDX-License-Identifier: MIT
// Shared CrecheBooks API client primitives for the domain (read) and mutation
// (write) toolsets. Zero dependency. Mirrors cb-api.sh: staging/production
// selection, x-api-key for `cb_` keys else Bearer, x-tenant-id, /api/v1 prefix.
// The key is only ever placed in a request header — never logged or returned.

import http from 'node:http';
import https from 'node:https';

export const DEFAULT_STAGING_URL = 'https://api-staging-5287.up.railway.app';
export const DEFAULT_PROD_URL = 'https://api.elleelephant.co.za';
export const DEFAULT_TENANT = 'bdff4374-64d5-420c-b454-8e85e9df552a';

/** Resolve base URL + key + tenant + env from the process environment. Pure. */
export function resolveTarget(env) {
  const staging = (env.CB_ENVIRONMENT || 'staging') !== 'production';
  const base = staging ? env.CB_STAGING_API_URL || DEFAULT_STAGING_URL : env.CB_API_URL || DEFAULT_PROD_URL;
  const key = staging ? env.CB_STAGING_API_KEY || env.CRECHEBOOKS_API_KEY || '' : env.CRECHEBOOKS_API_KEY || '';
  const tenant = env.CB_TENANT_ID || DEFAULT_TENANT;
  return { staging, base, key, tenant };
}

/** Build the auth + tenant headers for a resolved key. */
export function authHeaders(key, tenant) {
  const auth = key.startsWith('cb_') ? { 'x-api-key': key } : { Authorization: `Bearer ${key}` };
  return { 'Content-Type': 'application/json', 'x-tenant-id': tenant, ...auth };
}

/** Generic JSON HTTP request. Returns parsed JSON, an {http_status,body} object
 * for non-2xx, or a short message string on transport failure. Never throws. */
export function httpRequest(method, url, headers, body) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https:') ? https : http;
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const h = { ...headers };
    if (payload) h['Content-Length'] = String(payload.length);
    const req = mod.request(url, { method, headers: h, timeout: 20000 }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => {
        if (data.length < 1_000_000) data += c;
      });
      res.on('end', () => {
        const status = res.statusCode || 0;
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve(status >= 200 && status < 300 ? parsed : { http_status: status, body: parsed });
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve('request timed out after 20s');
    });
    req.on('error', (err) => resolve(`request failed: ${err.message}`));
    if (payload) req.write(payload);
    req.end();
  });
}
