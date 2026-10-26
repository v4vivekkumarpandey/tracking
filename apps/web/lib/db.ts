import { Pool } from 'pg';

// Reuse one pool across hot reloads in development.
const g = globalThis as unknown as { __pgPool?: Pool };
export const pool = (g.__pgPool ??= new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
}));

// pg returns NUMERIC and BIGINT as strings; money stays exact that way.
export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function audit(actor: string, action: string, entity: string, entityId: number | string | null, details?: object) {
  await q(
    `INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5)`,
    [actor, action, entity, entityId, details ? JSON.stringify(details) : null],
  );
}
