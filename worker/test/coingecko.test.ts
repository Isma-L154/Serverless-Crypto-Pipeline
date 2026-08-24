import { describe, expect, it } from 'vitest';
import {
  buildRequestUrl,
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
