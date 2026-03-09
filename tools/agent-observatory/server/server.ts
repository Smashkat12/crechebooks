import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { insertEvent, queryEvents, getSessions, getAgents } from './db.js';
import type { AgentEvent, EventQuery } from './types.js';

const PORT = parseInt(process.env.OBSERVATORY_PORT ?? '4200', 10);

// Note: ws is a peer dependency - install with: npm i ws @types/ws
// For environments without ws, we use a simple polling fallback
let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

function broadcast(event: AgentEvent) {
  const msg = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function parseQuery(url: URL): EventQuery {
  const q: EventQuery = {};
  if (url.searchParams.has('session')) q.session = url.searchParams.get('session')!;
  if (url.searchParams.has('agent')) q.agent = url.searchParams.get('agent')!;
  if (url.searchParams.has('type')) q.type = url.searchParams.get('type')!;
  if (url.searchParams.has('from')) q.from = parseFloat(url.searchParams.get('from')!);
  if (url.searchParams.has('to')) q.to = parseFloat(url.searchParams.get('to')!);
  if (url.searchParams.has('limit')) q.limit = parseInt(url.searchParams.get('limit')!, 10);
  return q;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    // POST /api/events — ingest event
    if (req.method === 'POST' && url.pathname === '/api/events') {
      const body = await parseBody(req);
      const event: AgentEvent = JSON.parse(body);
      const id = insertEvent(event);
      broadcast({ ...event, id });
      json(res, { ok: true, id });
      return;
    }

    // GET /api/events — query events
    if (req.method === 'GET' && url.pathname === '/api/events') {
      const query = parseQuery(url);
      const events = queryEvents(query);
      json(res, events);
      return;
    }

    // GET /api/sessions
    if (req.method === 'GET' && url.pathname === '/api/sessions') {
      json(res, getSessions());
      return;
    }

    // GET /api/agents
    if (req.method === 'GET' && url.pathname === '/api/agents') {
      json(res, getAgents());
      return;
    }

    // GET /health
    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, { status: 'ok', uptime: process.uptime() });
      return;
    }

    json(res, { error: 'Not found' }, 404);
  } catch (err) {
    json(res, { error: String(err) }, 500);
  }
});

// Try to set up WebSocket, gracefully degrade if ws not available
try {
  wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
  });
} catch {
  console.log('WebSocket not available (install ws package for real-time streaming)');
}

server.listen(PORT, () => {
  console.log(`Agent Observatory listening on http://localhost:${PORT}`);
  console.log(`  POST /api/events  — ingest`);
  console.log(`  GET  /api/events  — query`);
  console.log(`  GET  /api/sessions — list sessions`);
  console.log(`  GET  /api/agents  — list agents`);
  console.log(`  WS   /ws          — real-time stream`);
});
