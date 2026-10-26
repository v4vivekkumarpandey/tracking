import { createClient, type ClickHouseClient } from '@clickhouse/client';

const g = globalThis as unknown as { __ch?: ClickHouseClient };
export const ch = (g.__ch ??= createClient({
  url: process.env.CLICKHOUSE_URL ?? 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER ?? 'tracking',
  password: process.env.CLICKHOUSE_PASSWORD ?? 'tracking',
  database: 'tracking',
}));

export async function chq<T>(query: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const rs = await ch.query({ query, query_params: params, format: 'JSONEachRow' });
  return rs.json<T>();
}
