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

/** One coin's most recent observation, as served to the dashboard. */
export interface LatestRow {
  coin_id: string;
  ts: number;
  price_usd: number;
  market_cap_usd: number | null;
  volume_24h_usd: number | null;
  change_24h_pct: number | null;
}

/** A single point on the price chart. */
export interface HistoryRow {
  coin_id: string;
  ts: number;
  price_usd: number;
}

/**
 * The newest observation for each coin, ordered by market capitalisation so
 * the dashboard can render cards without sorting them itself.
 *
 * The subquery finds each coin's latest timestamp and the join pulls the
 * matching row; both halves are served by the primary key, which leads on
 * coin_id.
 */
export async function selectLatest(db: D1Database): Promise<LatestRow[]> {
  const { results } = await db
    .prepare(
      `SELECT p.coin_id, p.ts, p.price_usd, p.market_cap_usd,
              p.volume_24h_usd, p.change_24h_pct
         FROM prices AS p
         JOIN (
           SELECT coin_id, MAX(ts) AS ts
             FROM prices
            GROUP BY coin_id
         ) AS newest
           ON newest.coin_id = p.coin_id
          AND newest.ts = p.ts
        ORDER BY p.market_cap_usd DESC NULLS LAST, p.coin_id ASC`,
    )
    .all<LatestRow>();

  return results;
}

/**
 * Price points from the cutoff onward, oldest first.
 *
 * Only the columns the chart draws are selected. Market cap and volume would
 * roughly triple the payload for data the chart never reads, and this response
 * is refetched on an interval by every open tab.
 */
export async function selectHistorySince(
  db: D1Database,
  cutoff: number,
): Promise<HistoryRow[]> {
  const { results } = await db
    .prepare(
      `SELECT coin_id, ts, price_usd
         FROM prices
        WHERE ts >= ?
        ORDER BY ts ASC, coin_id ASC`,
    )
    .bind(cutoff)
    .all<HistoryRow>();

  return results;
}
