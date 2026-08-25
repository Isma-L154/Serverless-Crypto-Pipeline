import { handleRequest } from './api';
import { fetchMarketData, toRecords } from './coingecko';
import { insertRecords, purgeOlderThan, RETENTION_SECONDS } from './db';

// Env is generated from the bindings in wrangler.jsonc by `wrangler types`,
// so the binding list cannot drift from the configuration that provides it.

/**
 * Collects one observation of every tracked coin and prunes expired rows.
 *
 * Failures are allowed to propagate. A thrown error marks the invocation as
 * failed, which is what makes a broken poll visible; swallowing it would leave
 * the dashboard quietly serving stale data. The schedule itself is unaffected,
 * so the next run ten minutes later proceeds normally.
 */
async function collect(env: Env): Promise<void> {
  const observedAt = Math.floor(Date.now() / 1000);

  const payload = await fetchMarketData(env.COINGECKO_API_TOKEN);
  const records = toRecords(payload, observedAt);

  if (records.length === 0) {
    throw new Error('CoinGecko returned no usable prices');
  }

  await insertRecords(env.DB, records);
  const pruned = await purgeOlderThan(env.DB, observedAt - RETENTION_SECONDS);

  console.log(
    `stored ${records.length} observations, pruned ${pruned} expired rows`,
  );
}

export default {
  async scheduled(_controller, env, _ctx): Promise<void> {
    await collect(env);
  },

  async fetch(request, env, _ctx): Promise<Response> {
    return handleRequest(request, env.DB);
  },
} satisfies ExportedHandler<Env>;

export { collect };
