import { randomUUID } from 'node:crypto';
import { exec, q } from './db';

const MAX_ATTEMPTS = 8;
let running = false;

/**
 * Sends queued publisher postbacks. Triggered right after each conversion,
 * and by the cron job every minute as a safety net. A claim token stops two
 * runs (or two processes) from sending the same job.
 */
export async function processOutbox(maxJobs = 200): Promise<{ sent: number; failed: number }> {
  if (running) return { sent: 0, failed: 0 };
  running = true;
  let sent = 0;
  let failed = 0;
  try {
    while (sent + failed < maxJobs) {
      const claim = randomUUID();
      const res = await exec(
        `UPDATE outbox SET claim = ?, attempts = attempts + 1,
                next_attempt_at = NOW(3) + INTERVAL 2 MINUTE
         WHERE status = 'pending' AND next_attempt_at <= NOW(3)
         ORDER BY id LIMIT 20`,
        [claim],
      );
      if (res.affectedRows === 0) break;

      const jobs = await q<{ id: number; ref_id: number; payload: string; attempts: number }>(
        `SELECT id, ref_id, payload, attempts FROM outbox WHERE claim = ? ORDER BY id`,
        [claim],
      );
      await Promise.all(
        jobs.map(async (j) => {
          const err = await send(j.ref_id, JSON.parse(j.payload).url as string);
          if (!err) {
            sent++;
            await exec(`UPDATE outbox SET status = 'done', last_error = NULL WHERE id = ?`, [j.id]);
          } else if (j.attempts >= MAX_ATTEMPTS) {
            failed++;
            await exec(`UPDATE outbox SET status = 'failed', last_error = ? WHERE id = ?`, [err, j.id]);
          } else {
            failed++;
            const delay = 30 * 2 ** j.attempts; // 1m, 2m, 4m ... about 2h
            await exec(
              `UPDATE outbox SET last_error = ?, next_attempt_at = NOW(3) + INTERVAL ? SECOND WHERE id = ?`,
              [err, delay, j.id],
            );
          }
        }),
      );
    }
  } finally {
    running = false;
  }
  return { sent, failed };
}

/** Returns an error message, or null on a 2xx response. */
async function send(conversionId: number, url: string): Promise<string | null> {
  let status: number | null = null;
  let body = '';
  let error: string | null = null;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'tracking-postback/1.0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
    body = (await res.text()).slice(0, 1024);
    if (status < 200 || status > 299) error = `publisher postback returned ${status}`;
  } catch (e) {
    error = (e as Error).message.slice(0, 250);
  }
  await exec(
    `INSERT INTO postback_deliveries (conversion_id, url, status_code, response, error) VALUES (?, ?, ?, ?, ?)`,
    [conversionId, url, status, body, status === null ? error : null],
  ).catch((e) => console.error('postback_deliveries insert', e));
  return error;
}
