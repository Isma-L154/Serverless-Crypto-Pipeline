import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildRequestUrl,
  fetchMarketData,
  toRecords,
  type CoinGeckoResponse,
} from '../src/coingecko';

describe('buildRequestUrl', () => {
  it('requests every tracked coin in one call', () => {
    const url = new URL(buildRequestUrl(['bitcoin', 'ethereum']));

    expect(url.searchParams.get('ids')).toBe('bitcoin,ethereum');
    expect(url.searchParams.get('vs_currencies')).toBe('usd');
  });

  it('does not ask for a seven-day change', () => {
    // The simple/price endpoint has no such parameter. Sending one is ignored
    // silently, which is how the previous implementation ended up recording an
    // always-empty column.
    expect(buildRequestUrl()).not.toContain('7d');
  });
});

describe('toRecords', () => {
  const observedAt = 1_787_532_800;

  it('maps a full payload onto storable records', () => {
    const payload: CoinGeckoResponse = {
      bitcoin: {
        usd: 77_480,
        usd_market_cap: 1_554_879_698_239.7,
        usd_24h_vol: 29_950_709_837.84,
        usd_24h_change: 0.191,
      },
    };

    expect(toRecords(payload, observedAt)).toEqual([
      {
        coinId: 'bitcoin',
        ts: observedAt,
        priceUsd: 77_480,
        marketCapUsd: 1_554_879_698_239.7,
        volume24hUsd: 29_950_709_837.84,
        change24hPct: 0.191,
      },
    ]);
  });

  it('stamps every record in a poll with the same timestamp', () => {
    const payload: CoinGeckoResponse = {
      bitcoin: { usd: 1 },
      ethereum: { usd: 2 },
    };

    const timestamps = toRecords(payload, observedAt).map(
      (record) => record.ts,
    );

    expect(timestamps).toEqual([observedAt, observedAt]);
  });

  it('records absent optional fields as null rather than zero', () => {
    const records = toRecords({ cardano: { usd: 0.42 } }, observedAt);

    expect(records[0]).toMatchObject({
      priceUsd: 0.42,
      marketCapUsd: null,
      volume24hUsd: null,
      change24hPct: null,
    });
  });

  it('keeps a genuine zero for an optional field', () => {
    const records = toRecords(
      { cardano: { usd: 0.42, usd_24h_change: 0 } },
      observedAt,
    );

    expect(records[0]?.change24hPct).toBe(0);
  });

  it('drops a coin with no usable price', () => {
    // Storing this as zero would put a false crash into every chart.
    const payload: CoinGeckoResponse = {
      bitcoin: { usd: 77_480 },
      solana: {},
    };

    expect(toRecords(payload, observedAt).map((r) => r.coinId)).toEqual([
      'bitcoin',
    ]);
  });

  it('rejects prices that are not finite numbers', () => {
    const payload = {
      bitcoin: { usd: Number.NaN },
      ethereum: { usd: Number.POSITIVE_INFINITY },
      solana: { usd: '150' },
    } as unknown as CoinGeckoResponse;

    expect(toRecords(payload, observedAt)).toEqual([]);
  });

  it('discards a non-finite optional field while keeping the record', () => {
    const payload = {
      bitcoin: { usd: 77_480, usd_market_cap: Number.NaN },
    } as unknown as CoinGeckoResponse;

    expect(toRecords(payload, observedAt)[0]).toMatchObject({
      priceUsd: 77_480,
      marketCapUsd: null,
    });
  });

  it('returns nothing for an empty payload', () => {
    expect(toRecords({}, observedAt)).toEqual([]);
  });
});

describe('fetchMarketData', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('authenticates with the demo key header', async () => {
    // Without a key CoinGecko rate limits by source IP, and a Worker's egress
    // addresses are shared and permanently saturated, so this header is the
    // difference between the cron working and returning 429 forever.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ bitcoin: { usd: 1 } }));

    await fetchMarketData('CG-test-key');

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(
      (init.headers as Record<string, string>)['x-cg-demo-api-key'],
    ).toBe('CG-test-key');
  });

  it('refuses to call the API without a key', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(fetchMarketData('')).rejects.toThrow(
      'COINGECKO_API_TOKEN is not configured',
    );
    // Failing before the request is what makes a missing secret diagnosable,
    // rather than surfacing later as an opaque rate-limit error.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports an unsuccessful response rather than returning empty data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('rate limited', { status: 429, statusText: 'Too Many Requests' }),
    );

    await expect(fetchMarketData('CG-test-key')).rejects.toThrow(
      /CoinGecko responded 429/,
    );
  });
});
