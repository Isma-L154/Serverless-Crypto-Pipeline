import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PriceRecord } from '../src/coingecko';
import { insertRecords, purgeOlderThan, RETENTION_SECONDS } from '../src/db';

const NOW = 1_787_532_800;

function record(overrides: Partial<PriceRecord> = {}): PriceRecord {
  return {
    coinId: 'bitcoin',
    ts: NOW,
    priceUsd: 77_480,
    marketCapUsd: 1_554_879_698_239.7,
    volume24hUsd: 29_950_709_837.84,
    change24hPct: 0.191,
    ...overrides,
  };
}

async function countRows(): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM prices',
  ).first<{ n: number }>();

  return row?.n ?? 0;
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM prices').run();
});

describe('insertRecords', () => {
  it('writes every record in the batch', async () => {
    await insertRecords(env.DB, [
      record({ coinId: 'bitcoin' }),
      record({ coinId: 'ethereum', priceUsd: 2_456.34 }),
    ]);

    expect(await countRows()).toBe(2);
  });

  it('round-trips values without distortion', async () => {
    await insertRecords(env.DB, [record()]);

    const stored = await env.DB.prepare(
      'SELECT * FROM prices WHERE coin_id = ?',
    )
      .bind('bitcoin')
      .first();

    expect(stored).toMatchObject({
      coin_id: 'bitcoin',
      ts: NOW,
      price_usd: 77_480,
      change_24h_pct: 0.191,
    });
  });

  it('stores absent optional values as null', async () => {
    await insertRecords(env.DB, [
      record({ marketCapUsd: null, volume24hUsd: null, change24hPct: null }),
    ]);

    const stored = await env.DB.prepare(
      'SELECT market_cap_usd, volume_24h_usd, change_24h_pct FROM prices',
    ).first();

    expect(stored).toEqual({
      market_cap_usd: null,
      volume_24h_usd: null,
      change_24h_pct: null,
    });
  });

  it('replaces rather than duplicating when the same poll is retried', async () => {
    await insertRecords(env.DB, [record({ priceUsd: 77_480 })]);
    await insertRecords(env.DB, [record({ priceUsd: 77_500 })]);

    expect(await countRows()).toBe(1);

    const stored = await env.DB.prepare(
      'SELECT price_usd FROM prices',
    ).first<{ price_usd: number }>();

    expect(stored?.price_usd).toBe(77_500);
  });

  it('keeps observations of the same coin at different times', async () => {
    await insertRecords(env.DB, [
      record({ ts: NOW }),
      record({ ts: NOW - 300 }),
    ]);

    expect(await countRows()).toBe(2);
  });

  it('does nothing when given no records', async () => {
    await insertRecords(env.DB, []);

    expect(await countRows()).toBe(0);
  });
});

describe('purgeOlderThan', () => {
  it('removes only rows older than the cutoff', async () => {
    const cutoff = NOW - RETENTION_SECONDS;

    await insertRecords(env.DB, [
      record({ ts: cutoff - 1 }),
      record({ ts: cutoff }),
      record({ ts: NOW }),
    ]);

    const pruned = await purgeOlderThan(env.DB, cutoff);

    expect(pruned).toBe(1);
    expect(await countRows()).toBe(2);
  });

  it('treats a row exactly on the cutoff as still current', async () => {
    const cutoff = NOW - RETENTION_SECONDS;
    await insertRecords(env.DB, [record({ ts: cutoff })]);

    expect(await purgeOlderThan(env.DB, cutoff)).toBe(0);
  });

  it('reports zero when there is nothing to remove', async () => {
    await insertRecords(env.DB, [record()]);

    expect(await purgeOlderThan(env.DB, NOW - RETENTION_SECONDS)).toBe(0);
    expect(await countRows()).toBe(1);
  });

  it('reports zero on an empty table', async () => {
    expect(await purgeOlderThan(env.DB, NOW)).toBe(0);
  });
});
