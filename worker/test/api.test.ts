import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleRequest, parseHistoryHours } from '../src/api';
import type { PriceRecord } from '../src/coingecko';
import { insertRecords, RETENTION_SECONDS } from '../src/db';

const NOW = Math.floor(Date.now() / 1000);

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

function get(path: string): Promise<Response> {
  return handleRequest(
    new Request(`https://crypto.example.com${path}`),
    env.DB,
  );
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM prices').run();
});

describe('parseHistoryHours', () => {
  it('falls back to a day when unspecified', () => {
    expect(parseHistoryHours(null)).toBe(24);
    expect(parseHistoryHours('')).toBe(24);
  });

  it('accepts a valid span', () => {
    expect(parseHistoryHours('6')).toBe(6);
  });

  it('clamps a span longer than the data actually kept', () => {
    // Asking for a week returns the two days that exist, rather than an error.
    expect(parseHistoryHours('168')).toBe(RETENTION_SECONDS / 3600);
  });

  it('falls back when the value is not a usable number', () => {
    expect(parseHistoryHours('abc')).toBe(24);
    expect(parseHistoryHours('-5')).toBe(24);
    expect(parseHistoryHours('0')).toBe(24);
    expect(parseHistoryHours('NaN')).toBe(24);
  });
});

describe('GET /api/latest', () => {
  it('returns one row per coin, newest observation only', async () => {
    await insertRecords(env.DB, [
      record({ coinId: 'bitcoin', ts: NOW - 300, priceUsd: 70_000 }),
      record({ coinId: 'bitcoin', ts: NOW, priceUsd: 77_480 }),
      record({
        coinId: 'ethereum',
        ts: NOW,
        priceUsd: 2_456,
        marketCapUsd: 296_466_712_959,
      }),
    ]);

    const body = (await (await get('/api/latest')).json()) as {
      coins: Array<{ coin_id: string; price_usd: number }>;
    };

    expect(body.coins).toHaveLength(2);
    expect(body.coins[0]).toMatchObject({
      coin_id: 'bitcoin',
      price_usd: 77_480,
    });
  });

  it('orders coins by market capitalisation', async () => {
    await insertRecords(env.DB, [
      record({ coinId: 'cardano', priceUsd: 0.42, marketCapUsd: 15_000 }),
      record({ coinId: 'bitcoin', marketCapUsd: 1_554_879_698_239 }),
      record({ coinId: 'ethereum', marketCapUsd: 296_466_712_959 }),
    ]);

    const body = (await (await get('/api/latest')).json()) as {
      coins: Array<{ coin_id: string }>;
    };

    expect(body.coins.map((c) => c.coin_id)).toEqual([
      'bitcoin',
      'ethereum',
      'cardano',
    ]);
  });

  it('reports the observation time so the page can show freshness', async () => {
    await insertRecords(env.DB, [record()]);

    const body = (await (await get('/api/latest')).json()) as {
      updatedAt: number | null;
    };

    expect(body.updatedAt).toBe(NOW);
  });

  it('returns an empty result rather than an error before any data exists', async () => {
    const response = await get('/api/latest');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ coins: [], updatedAt: null });
  });

  it('is cacheable so repeated polling does not reach the Worker each time', async () => {
    const response = await get('/api/latest');

    expect(response.headers.get('cache-control')).toContain('max-age=60');
  });
});

describe('GET /api/history', () => {
  it('returns only points inside the requested span', async () => {
    await insertRecords(env.DB, [
      record({ ts: NOW - 10 * 3600 }),
      record({ ts: NOW - 30 * 60 }),
      record({ ts: NOW }),
    ]);

    const body = (await (await get('/api/history?hours=1')).json()) as {
      hours: number;
      points: Array<{ ts: number }>;
    };

    expect(body.hours).toBe(1);
    expect(body.points).toHaveLength(2);
  });

  it('returns points oldest first so the chart can draw them in order', async () => {
    await insertRecords(env.DB, [
      record({ ts: NOW }),
      record({ ts: NOW - 600 }),
      record({ ts: NOW - 300 }),
    ]);

    const body = (await (await get('/api/history')).json()) as {
      points: Array<{ ts: number }>;
    };

    expect(body.points.map((p) => p.ts)).toEqual([
      NOW - 600,
      NOW - 300,
      NOW,
    ]);
  });

  it('carries only the columns the chart draws', async () => {
    await insertRecords(env.DB, [record()]);

    const body = (await (await get('/api/history')).json()) as {
      points: Array<Record<string, unknown>>;
    };

    expect(Object.keys(body.points[0] ?? {}).sort()).toEqual([
      'coin_id',
      'price_usd',
      'ts',
    ]);
  });

  it('returns an empty series rather than an error when there is no data', async () => {
    const response = await get('/api/history');

    expect(response.status).toBe(200);
    expect(((await response.json()) as { points: unknown[] }).points).toEqual(
      [],
    );
  });
});

describe('routing', () => {
  it('reports an unknown path as not found', async () => {
    const response = await get('/api/nope');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  });

  it('rejects a write method', async () => {
    const response = await handleRequest(
      new Request('https://crypto.example.com/api/latest', { method: 'POST' }),
      env.DB,
    );

    expect(response.status).toBe(405);
  });

  it('does not let error responses be cached', async () => {
    const response = await get('/api/nope');

    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('reports a storage failure as a generic error without leaking detail', async () => {
    // A D1 error message can carry the failing query; this endpoint is public.
    await env.DB.prepare('DROP TABLE prices').run();

    const response = await get('/api/latest');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal error' });
  });
});
