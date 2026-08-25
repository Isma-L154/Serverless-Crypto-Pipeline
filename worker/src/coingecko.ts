/**
 * Reading market data from CoinGecko's free API.
 *
 * Isolating the upstream contract here means a change on CoinGecko's side is a
 * change to this file alone, rather than something that reaches into storage
 * and the API handlers.
 */

/** Coins tracked by the dashboard, ordered by market capitalisation. */
export const COIN_IDS = [
  'bitcoin',
  'ethereum',
  'solana',
  'binancecoin',
  'cardano',
] as const;

export type CoinId = (typeof COIN_IDS)[number];

/** A single observation of one coin, ready to be stored. */
export interface PriceRecord {
  coinId: string;
  /** Epoch seconds, UTC. Shared by every record in one poll. */
  ts: number;
  priceUsd: number;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  change24hPct: number | null;
}

/**
 * The subset of CoinGecko's response this project reads.
 *
 * Every field is optional: the endpoint omits values it cannot supply rather
 * than returning nulls, so nothing here can be assumed present.
 */
export interface CoinGeckoResponse {
  [coinId: string]:
    | {
        usd?: number;
        usd_market_cap?: number;
        usd_24h_vol?: number;
        usd_24h_change?: number;
      }
    | undefined;
}

const ENDPOINT = 'https://api.coingecko.com/api/v3/simple/price';
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Note the absence of a seven-day change parameter. The simple/price endpoint
 * does not support one; passing it is silently ignored, which is why the
 * previous implementation always recorded an empty seven-day column.
 */
export function buildRequestUrl(ids: readonly string[] = COIN_IDS): string {
  const params = new URLSearchParams({
    ids: ids.join(','),
    vs_currencies: 'usd',
    include_market_cap: 'true',
    include_24hr_vol: 'true',
    include_24hr_change: 'true',
  });

  return `${ENDPOINT}?${params.toString()}`;
}

/** Accepts a value only if it is a usable number, treating anything else as absent. */
function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Converts a CoinGecko payload into storable records.
 *
 * Coins without a usable price are dropped rather than stored with a placeholder:
 * a row that claims a price of zero would corrupt every chart that reads it.
 */
export function toRecords(
  payload: CoinGeckoResponse,
  observedAt: number,
): PriceRecord[] {
  const records: PriceRecord[] = [];

  for (const [coinId, data] of Object.entries(payload ?? {})) {
    const priceUsd = finiteOrNull(data?.usd);
    if (priceUsd === null) continue;

    records.push({
      coinId,
      ts: observedAt,
      priceUsd,
      marketCapUsd: finiteOrNull(data?.usd_market_cap),
      volume24hUsd: finiteOrNull(data?.usd_24h_vol),
      change24hPct: finiteOrNull(data?.usd_24h_change),
    });
  }

  return records;
}

/**
 * Fetches current market data, throwing on any response that is not usable.
 *
 * The API key is required rather than optional. Without one CoinGecko rate
 * limits by source IP, and a Worker's egress IPs are shared across Cloudflare
 * and permanently saturated: keyless requests from the edge return 429 on
 * every attempt, even though the same request succeeds from a laptop.
 */
export async function fetchMarketData(
  apiKey: string,
  ids: readonly string[] = COIN_IDS,
): Promise<CoinGeckoResponse> {
  if (!apiKey) {
    throw new Error('COINGECKO_API_TOKEN is not configured');
  }

  const response = await fetch(buildRequestUrl(ids), {
    headers: {
      'User-Agent': 'crypto-pipeline/2.0',
      accept: 'application/json',
      'x-cg-demo-api-key': apiKey,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `CoinGecko responded ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as CoinGeckoResponse;
}
