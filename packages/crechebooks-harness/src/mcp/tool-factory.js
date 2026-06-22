// SPDX-License-Identifier: MIT
// Turns domain-spec.js entries into MCP tools. A read entry becomes a handler
// that calls the injected `cbApi`; a write entry becomes a handler that calls
// the injected `cbWrite` (which carries the preview/confirm/staging-block
// safety). inputSchema is derived from the entry's params. No hand-coding.

/** Fill :path params from args. */
function fillPath(path, args) {
  return path.replace(/:([A-Za-z_]+)/g, (_, k) => encodeURIComponent(String(args[k] ?? '')));
}

/** Build a query object (strings) from the entry's `in:'query'` params, applying default/max. */
function buildQuery(entry, args) {
  const q = {};
  for (const [name, p] of Object.entries(entry.params || {})) {
    if (p.in !== 'query') continue;
    if (p.type === 'number') {
      if (args[name] == null && p.default == null) continue;
      let n = Number(args[name] ?? p.default);
      if (p.max != null) n = Math.min(n, p.max);
      q[name] = String(n);
    } else {
      if (args[name] == null) continue;
      q[name] = String(args[name]);
    }
  }
  return q;
}

/** Build a request body from the entry's `in:'body'` params, coercing by type. */
function buildBody(entry, args) {
  const body = {};
  for (const [name, p] of Object.entries(entry.params || {})) {
    if (p.in !== 'body') continue;
    let v = args[name];
    if (v == null) continue;
    if (p.type === 'number') v = Number(v);
    else if (p.type === 'string') v = String(v);
    else if (p.type === 'array') v = Array.isArray(v) ? v : [v];
    body[name] = v;
  }
  return body;
}

/** Derive a JSON Schema for the tool from the entry's params (+ confirm for writes). */
function buildInputSchema(entry) {
  const properties = {};
  const required = [];
  for (const [name, p] of Object.entries(entry.params || {})) {
    const s = { type: p.type };
    if (p.description) s.description = p.description;
    if (p.items) s.items = p.items;
    properties[name] = s;
    if (p.required) required.push(name);
  }
  if (entry.write) {
    properties.confirm = { type: 'boolean', description: 'Must be true to execute; otherwise returns a preview.' };
  }
  const schema = { type: 'object', properties };
  if (required.length) schema.required = required;
  if (!entry.write && Object.keys(properties).length === 0) schema.additionalProperties = false;
  return schema;
}

/**
 * Generate a toolset from spec entries.
 * @param {Array} entries  domain-spec entries (already filtered to read or write)
 * @param {{cbApi?:Function, cbWrite?:Function}} exec  injected executors
 */
export function buildToolset(entries, { cbApi, cbWrite } = {}) {
  return entries.map((entry) => {
    const handler = entry.write
      ? (args = {}) => cbWrite(entry.method, fillPath(entry.path, args) + '', buildBody(entry, args), args.confirm === true)
      : (args = {}) => cbApi(fillPath(entry.path, args), { query: buildQuery(entry, args) });
    return {
      name: entry.name,
      description: entry.description,
      inputSchema: buildInputSchema(entry),
      handler,
    };
  });
}
