/**
 * Response headers applied to everything this Worker serves.
 *
 * The dashboard has no sessions, no accounts and nothing to steal, so these are
 * not protecting user data. They limit what someone can do *with* the page:
 * chiefly framing it inside another site to lend a fraudulent page the
 * credibility of this domain.
 */

/**
 * Content Security Policy.
 *
 * `default-src 'none'` denies every fetch type by default and each directive
 * below re-allows exactly one. That way a resource type nobody thought about —
 * a worker, a websocket, an object — is denied rather than inheriting a
 * permissive default.
 *
 * There is no `unsafe-inline` anywhere. The stylesheet and the script were
 * moved out of the page into their own assets specifically so this could stay
 * strict without pinning hashes that break on every edit.
 */
const CSP = [
  "default-src 'none'",
  // Cloudflare injects its Web Analytics beacon into pages it serves. It is
  // first-party to the platform already hosting this site, so allowing it does
  // not widen the trust boundary in any real sense — and blocking it only
  // produced a console error on every page load.
  "script-src 'self' https://static.cloudflareinsights.com",
  "style-src 'self'",
  // The fonts are self-hosted, so no third party is involved in rendering the
  // page at all. Loading them from Google would have sent every visitor's IP
  // address there before a single price was drawn.
  "font-src 'self'",
  // The favicon is an inline SVG data URI.
  "img-src 'self' data:",
  // The dashboard only ever calls its own /api/* endpoints.
  // The dashboard calls its own /api/*; the beacon reports to Cloudflare.
  "connect-src 'self' https://cloudflareinsights.com",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP,

  // frame-ancestors covers modern browsers; this is the equivalent for
  // anything that predates CSP support.
  'X-Frame-Options': 'DENY',

  // Stops a browser second-guessing a declared Content-Type, which is how a
  // response meant as data ends up executed as script.
  'X-Content-Type-Options': 'nosniff',

  // Do not leak the full URL to CoinGecko when the footer link is followed.
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Nothing here needs a camera, microphone or location.
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',

  // Two years, covering subdomains. Only honoured over HTTPS, which is the
  // only way this Worker is reachable.
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
};

/** Returns the response with the security headers applied. */
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export { CSP, SECURITY_HEADERS };
