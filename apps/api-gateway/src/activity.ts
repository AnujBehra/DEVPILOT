import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

export type ActivityLog = {
  id: string;
  actor: string;
  role: string;
  action: string;
  projectId?: string;
  eventType?: string;
  timestamp: string;
};

const dataDir = process.env.DEVPILOT_DATA_DIR
  ? path.resolve(process.env.DEVPILOT_DATA_DIR)
  : process.env.VERCEL
    ? path.join('/tmp', 'devpilot-ai')
    : path.resolve(__dirname, '..', '.data');
const activityPath = path.join(dataDir, 'activity.json');
const databaseUrl = process.env.DATABASE_URL;

const shouldUseSsl = (connectionString: string) => {
  if (/sslmode=(require|verify-ca|verify-full)/i.test(connectionString)) return true;
  if (/sslmode=disable/i.test(connectionString)) return false;
  return !/localhost|127\.0\.0\.1|postgres:5432/i.test(connectionString);
};

const pool = databaseUrl
  ? new Pool({
    connectionString: databaseUrl,
    ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : false,
  })
  : null;
let initialized: Promise<void> | null = null;

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const readLogs = (): ActivityLog[] => {
  try {
    const parsed = JSON.parse(fs.readFileSync(activityPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLogs = (logs: ActivityLog[]) => {
  fs.writeFileSync(activityPath, JSON.stringify(logs.slice(0, 200), null, 2));
};

const initActivity = async () => {
  if (!pool) return;
  if (initialized) return initialized;
  initialized = pool.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      actor TEXT NOT NULL,
      role TEXT NOT NULL,
      action TEXT NOT NULL,
      project_id TEXT NOT NULL DEFAULT '',
      event_type TEXT NOT NULL DEFAULT '',
      timestamp TEXT NOT NULL
    )
  `).then(() => undefined);
  return initialized;
};

const rowToActivity = (row: any): ActivityLog => ({
  id: row.id,
  actor: row.actor,
  role: row.role,
  action: row.action,
  projectId: row.project_id || undefined,
  eventType: row.event_type || undefined,
  timestamp: row.timestamp,
});

export const recordActivity = (entry: Omit<ActivityLog, 'id' | 'timestamp'>) => {
  const log = {
    id: uuid(),
    timestamp: new Date().toISOString(),
    eventType: entry.eventType || entry.action.split(':')[0],
    ...entry,
  };
  if (pool) {
    void (async () => {
      await initActivity();
      await pool.query(
        `INSERT INTO activity_logs (id, actor, role, action, project_id, event_type, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [log.id, log.actor, log.role, log.action, log.projectId || '', log.eventType || '', log.timestamp],
      );
      await pool.query(`DELETE FROM activity_logs WHERE id NOT IN (SELECT id FROM activity_logs ORDER BY timestamp DESC LIMIT 1000)`);
    })().catch((error) => console.error('Unable to persist activity log', error));
    return log;
  }
  const logs = readLogs();
  logs.unshift(log);
  writeLogs(logs);
  return log;
};

export const listActivity = async () => {
  if (pool) {
    await initActivity();
    return (await pool.query('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 50')).rows.map(rowToActivity);
  }
  return readLogs().slice(0, 50);
};

export const queryActivity = async (filters: { projectId?: string; eventType?: string; from?: string; to?: string }) => {
  if (pool) {
    await initActivity();
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.projectId) {
      params.push(filters.projectId);
      where.push(`project_id = $${params.length}`);
    }
    if (filters.eventType) {
      params.push(filters.eventType);
      where.push(`event_type = $${params.length}`);
    }
    if (filters.from) {
      params.push(filters.from);
      where.push(`timestamp >= $${params.length}`);
    }
    if (filters.to) {
      const to = new Date(filters.to);
      to.setDate(to.getDate() + 1);
      params.push(to.toISOString());
      where.push(`timestamp <= $${params.length}`);
    }
    const result = await pool.query(
      `SELECT * FROM activity_logs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY timestamp DESC LIMIT 100`,
      params,
    );
    return result.rows.map(rowToActivity);
  }
  const fromMs = filters.from ? new Date(filters.from).getTime() : null;
  const toMs = filters.to ? new Date(filters.to).getTime() + 86400000 : null;
  return readLogs()
    .filter((log) => !filters.projectId || log.projectId === filters.projectId)
    .filter((log) => !filters.eventType || (log.eventType || log.action.split(':')[0]) === filters.eventType)
    .filter((log) => {
      const timestamp = new Date(log.timestamp).getTime();
      if (fromMs !== null && timestamp < fromMs) return false;
      if (toMs !== null && timestamp > toMs) return false;
      return true;
    })
    .slice(0, 100);
};

export const clearActivity = async () => {
  if (pool) {
    await initActivity();
    await pool.query('DELETE FROM activity_logs');
    return;
  }
  writeLogs([]);
};
