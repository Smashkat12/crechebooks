import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import type { AgentEvent, EventQuery } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'observatory.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp REAL NOT NULL,
    session TEXT NOT NULL,
    type TEXT NOT NULL,
    agent TEXT,
    tool TEXT,
    action TEXT,
    data TEXT,
    file TEXT,
    command TEXT,
    success INTEGER,
    reason TEXT,
    message TEXT,
    level TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events_session ON events(session);
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
`);

const insertStmt = db.prepare(`
  INSERT INTO events (timestamp, session, type, agent, tool, action, data, file, command, success, reason, message, level)
  VALUES (@timestamp, @session, @type, @agent, @tool, @action, @data, @file, @command, @success, @reason, @message, @level)
`);

export function insertEvent(event: AgentEvent): number {
  const result = insertStmt.run({
    timestamp: event.timestamp ?? Date.now() / 1000,
    session: event.session ?? 'unknown',
    type: event.type ?? 'unknown',
    agent: event.agent ?? null,
    tool: event.tool ?? null,
    action: event.action ?? null,
    data: event.data ? JSON.stringify(event.data) : null,
    file: event.file ?? null,
    command: event.command ?? null,
    success: event.success != null ? (event.success ? 1 : 0) : null,
    reason: event.reason ?? null,
    message: event.message ?? null,
    level: event.level ?? null,
  });
  return result.lastInsertRowid as number;
}

export function queryEvents(query: EventQuery): AgentEvent[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (query.session) { conditions.push('session = @session'); params.session = query.session; }
  if (query.agent) { conditions.push('agent = @agent'); params.agent = query.agent; }
  if (query.type) { conditions.push('type = @type'); params.type = query.type; }
  if (query.from) { conditions.push('timestamp >= @from'); params.from = query.from; }
  if (query.to) { conditions.push('timestamp <= @to'); params.to = query.to; }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = query.limit ?? 500;
  const sql = `SELECT * FROM events ${where} ORDER BY timestamp DESC LIMIT ${limit}`;

  const rows = db.prepare(sql).all(params) as AgentEvent[];
  return rows.map(row => ({
    ...row,
    data: row.data ? JSON.parse(row.data as unknown as string) : undefined,
    success: row.success != null ? Boolean(row.success) : undefined,
  }));
}

export function getSessions(): { session: string; count: number; firstEvent: number; lastEvent: number }[] {
  return db.prepare(`
    SELECT session, COUNT(*) as count, MIN(timestamp) as firstEvent, MAX(timestamp) as lastEvent
    FROM events GROUP BY session ORDER BY lastEvent DESC
  `).all() as { session: string; count: number; firstEvent: number; lastEvent: number }[];
}

export function getAgents(): { agent: string; count: number }[] {
  return db.prepare(`
    SELECT agent, COUNT(*) as count FROM events WHERE agent IS NOT NULL
    GROUP BY agent ORDER BY count DESC
  `).all() as { agent: string; count: number }[];
}
