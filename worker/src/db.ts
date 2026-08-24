/** Storage for the rolling price window. */

import type { PriceRecord } from './coingecko';

/**
 * How much history the hot tier keeps.
 *
 * Two days is enough for the dashboard's chart while keeping the database a
 * few megabytes against a 5 GB allowance. Anything older belongs to the
 * archive tier.
 */
export const RETENTION_SECONDS = 48 * 60 * 60;

/**
 * Writes one poll's worth of observations.
 *
 * Sent as a single batch so the whole poll lands in one round trip; the free
 * plan caps a Worker at 50 subrequests, and one statement per coin would spend
 * them for no benefit.
 *
 * The upsert makes a retry harmless: re-running the same poll rewrites the
 * same rows instead of failing on the primary key.
 */
export async function insertRecords(
  db: D1Database,
  records: readonly PriceRecord[],
): Promise<void> {
  if (records.length === 0) return;

  const statement = db.prepare(
    `INSERT OR REPLACE INTO prices
       (coin_id, ts, price_usd, market_cap_usd, volume_24h_usd, change_24h_pct)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  await db.batch(
    records.map((record) =>
      statement.bind(
        record.coinId,
        record.ts,
        record.priceUsd,
        record.marketCapUsd,
        record.volume24hUsd,
        record.change24hPct,
      ),
    ),
  );
}

/**
 * Drops observations older than the cutoff and reports how many rows went.
 *
 * Runs on every poll rather than on its own schedule, which keeps the table
 * bounded without spending a second cron trigger on it.
 */
export async function purgeOlderThan(
  db: D1Database,
  cutoff: number,
): Promise<number> {
  const result = await db
    .prepare('DELETE FROM prices WHERE ts < ?')
    .bind(cutoff)
    .run();

  return result.meta.changes ?? 0;
}
