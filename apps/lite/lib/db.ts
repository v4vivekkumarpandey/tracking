import mysql, { type Pool, type PoolConnection, type ResultSetHeader } from 'mysql2/promise';
import { migrations } from './migrations';

// One pool per process. Shared hosting caps connections, so keep it small.
const g = globalThis as unknown as { __pool?: Pool; __ready?: Promise<void> };

function pool(): Pool {
  if (!g.__pool) {
    g.__pool = mysql.createPool({
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectionLimit: 8,
      // Everything is stored and compared in UTC.
      timezone: 'Z',
      charset: 'utf8mb4',
    });
    g.__pool.on('connection', (conn) => {
      conn.query("SET time_zone = '+00:00'");
    });
  }
  return g.__pool;
}

/** Applies pending migrations once per process. */
function ready(): Promise<void> {
  return (g.__ready ??= migrate().catch((err) => {
    g.__ready = undefined; // retry on the next request
    throw err;
  }));
}

async function migrate() {
  const conn = await pool().getConnection();
  try {
    // Several app processes may start at once; let one migrate.
    await conn.query(`SELECT GET_LOCK('tracking_migrate', 60)`);
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT PRIMARY KEY, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))`);
    const [rows] = await conn.query<mysql.RowDataPacket[]>(`SELECT version FROM schema_migrations`);
    const done = new Set(rows.map((r) => Number(r.version)));
    for (const m of migrations) {
      if (done.has(m.version)) continue;
      for (const sql of m.statements) await conn.query(sql);
      await conn.query(`INSERT INTO schema_migrations (version) VALUES (?)`, [m.version]);
      console.log(`migration ${m.version} applied`);
    }
  } finally {
    await conn.query(`SELECT RELEASE_LOCK('tracking_migrate')`).catch(() => {});
    conn.release();
  }
}

type Param = string | number | boolean | Date | null;

/** SELECT: returns rows. DECIMAL comes back as a string, keeping money exact. */
export async function q<T = Record<string, unknown>>(sql: string, params: Param[] = []): Promise<T[]> {
  await ready();
  const [rows] = await pool().query(sql, params);
  return rows as T[];
}

/** INSERT/UPDATE/DELETE: returns insertId and affectedRows. */
export async function exec(sql: string, params: Param[] = []): Promise<ResultSetHeader> {
  await ready();
  const [res] = await pool().query<ResultSetHeader>(sql, params);
  return res;
}

export type Tx = {
  q<T = Record<string, unknown>>(sql: string, params?: Param[]): Promise<T[]>;
  exec(sql: string, params?: Param[]): Promise<ResultSetHeader>;
};

/** Runs fn in a transaction; commits if it returns, rolls back if it throws. */
export async function tx<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
  await ready();
  const conn: PoolConnection = await pool().getConnection();
  const t: Tx = {
    async q<R>(sql: string, params: Param[] = []) {
      const [rows] = await conn.query(sql, params);
      return rows as R[];
    },
    async exec(sql: string, params: Param[] = []) {
      const [res] = await conn.query<ResultSetHeader>(sql, params);
      return res;
    },
  };
  try {
    await conn.beginTransaction();
    const out = await fn(t);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

export const isDuplicate = (err: unknown) => (err as { errno?: number })?.errno === 1062;

export async function audit(actor: string, action: string, entity: string, entityId: number | null, details?: object) {
  await exec(
    `INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)`,
    [actor, action, entity, entityId, details ? JSON.stringify(details) : null],
  );
}
