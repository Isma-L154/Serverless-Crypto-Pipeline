// Secrets are set with `wrangler secret put` and so never appear in
// wrangler.jsonc, which means `wrangler types` cannot generate them.
//
// The generated file declares two separate interfaces that both extend the
// same base: the global `Env` used by the handlers, and `Cloudflare.Env` used
// by the test runner. Augmenting only one leaves the other missing the
// binding, so both are declared here.

interface Env {
  /** CoinGecko Demo API key. Set with `wrangler secret put COINGECKO_API_TOKEN`. */
  COINGECKO_API_TOKEN: string;
}

declare namespace Cloudflare {
  interface Env {
    COINGECKO_API_TOKEN: string;
  }
}
