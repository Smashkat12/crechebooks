// SPDX-License-Identifier: MIT
// Zero-dependency MCP (Model Context Protocol) server over stdio for the
// crechebooks-harness. Speaks newline-delimited JSON-RPC 2.0 — the MCP stdio
// transport — with NO external SDK, so `npx crechebooks-harness mcp start`
// runs with no build step and no added supply-chain surface.
//
// Tool *dispatch* is delegated to the kernel's ToolDispatcher: the kernel owns
// the allow/deny decision (capability-claim check), this layer owns host-side
// execution and the JSON-RPC framing. That keeps the harness honest about
// which capability each tool call is exercising.

import readline from 'node:readline';
import { ToolDispatcher } from '@metaharness/kernel/dispatch';

const PROTOCOL_VERSION = '2025-06-18';
// 2100-01-01 in unix seconds. The claims are minted for the life of the
// process; Claude Code's own permission layer (allow/deny in settings.json) is
// the user-facing gate, the kernel claim is the in-process one.
const FAR_FUTURE = 4102444800;

/**
 * Build a dispatch registry from a toolset. Registers every handler with the
 * kernel ToolDispatcher under `serverName`, and mints a single wildcard claim
 * authorising `tool.invoke.<serverName>.*`.
 *
 * @param {string} serverName
 * @param {Array<{name:string,description?:string,inputSchema?:object,handler:Function}>} toolset
 */
export function createRegistry(serverName, toolset) {
  const dispatcher = new ToolDispatcher();
  for (const t of toolset) dispatcher.register(serverName, t.name, t.handler);
  const claims = [{ capability: `tool.invoke.${serverName}.*`, expires_at: FAR_FUTURE }];
  const tools = toolset.map(({ name, description, inputSchema }) => ({
    name,
    description: description ?? '',
    inputSchema: inputSchema ?? { type: 'object', properties: {} },
  }));
  return { serverName, dispatcher, claims, tools };
}

/**
 * Pure JSON-RPC handler. Returns a response object, or `null` for
 * notifications (which must not get a reply). Exported so tests can drive the
 * protocol without spawning a process or touching stdio.
 */
export async function handleRpc(msg, registry, serverInfo) {
  const { id, method, params } = msg ?? {};
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  switch (method) {
    case 'initialize':
      return reply({
        // Echo the client's protocol version when it offers one (forward-compat).
        protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo,
      });

    // Notifications — no response.
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    case 'ping':
      return reply({});

    case 'tools/list':
      return reply({ tools: registry.tools });

    case 'tools/call': {
      const name = params?.name;
      const args = params?.arguments ?? {};
      const outcome = await registry.dispatcher.dispatch({
        server: registry.serverName,
        tool: name,
        args,
        claims: registry.claims,
      });
      const asError = (text) => reply({ isError: true, content: [{ type: 'text', text }] });
      switch (outcome.kind) {
        case 'not-found':
          return asError(`Unknown tool: ${name}`);
        case 'bad-args':
          return asError(`Bad arguments: ${outcome.reason}`);
        case 'denied':
          return asError(`Tool error: ${outcome.reason}`);
        default: {
          const text =
            typeof outcome.output === 'string'
              ? outcome.output
              : JSON.stringify(outcome.output, null, 2);
          return reply({ content: [{ type: 'text', text }] });
        }
      }
    }

    default:
      // Unknown notification (no id) → swallow; unknown request → method-not-found.
      if (id === undefined || id === null) return null;
      return fail(-32601, `Method not found: ${method}`);
  }
}

/**
 * Serve the registry over stdio (or injected streams). Resolves when the input
 * stream closes. Each line of stdin is one JSON-RPC message; each response is
 * one line of stdout. Logging must go to stderr — stdout is the protocol channel.
 */
export function serve(registry, serverInfo, { input = process.stdin, output = process.stdout } = {}) {
  const rl = readline.createInterface({ input, terminal: false });
  // Line handlers are async (a tool may spawn a child process). Track them so
  // that on stdin close we drain in-flight calls before resolving — otherwise a
  // slow tool's response is cut off when the process exits.
  const pending = new Set();
  return new Promise((resolve) => {
    rl.on('line', (line) => {
      const work = (async () => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let msg;
        try {
          msg = JSON.parse(trimmed);
        } catch {
          output.write(
            JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n',
          );
          return;
        }
        try {
          const res = await handleRpc(msg, registry, serverInfo);
          if (res !== null) output.write(JSON.stringify(res) + '\n');
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          output.write(
            JSON.stringify({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32603, message } }) + '\n',
          );
        }
      })();
      pending.add(work);
      work.finally(() => pending.delete(work));
    });
    rl.on('close', async () => {
      await Promise.allSettled([...pending]);
      resolve();
    });
  });
}
