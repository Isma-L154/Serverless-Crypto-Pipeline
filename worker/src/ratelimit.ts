/**
 * Per-client rate limiting for the JSON API.
 *
 * The endpoints are cheap per call but not free: one `/api/history` request
 * reads roughly 2,900 rows once the retention window is full, against a free
 * allowance of five million row reads a day. A few thousand cache-busted
 * requests would exhaust that and take the dashboard down until the daily
 * reset, so the limit exists to protect the database allowance rather than CPU.
 */

/**
 * Requests allowed per client per period.
 *
 * The dashboard polls twice a minute, so this leaves a real visitor with
 * several tabs open plenty of room.
 *
 * The effective ceiling is looser than this number suggests. Cloudflare keeps
 * the counter on the machine serving the request and reconciles it
 * asynchronously, so traffic spread across a colo's machines is counted
 * separately: measured against production, a 300-request burst was cut by
 * roughly a quarter rather than at the thirtieth request.
 *
 * That is still the protection this needs. The threat is a sustained script
 * exhausting a daily row-read allowance, not a precise per-second cap, and a
 * sustained attack saturates individual machines and is throttled. It would be
 * wrong to describe this as a hard limit of 30.
 */
const REQUESTS_PER_PERIOD = 30;

/**
 * Identifies the caller.
 *
 * Keyed on the client IP rather than the path. Keying on the path would make
 * one shared counter for every visitor, so a single abusive client would lock
 * everyone else out — turning the protection into the outage it prevents.
 *
 * CF-Connecting-IP is set by Cloudflare's edge and cannot be spoofed by the
 * client, unlike X-Forwarded-For.
 */
export function clientKey(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

/**
 * Applies the limit, failing open if the binding is unavailable.
 *
 * A rate limiter that errors should not take the API down with it: this
 * protects a cost allowance, and denying real traffic because the limiter
 * itself broke would cause the outage it exists to prevent.
 */
export async function withinLimit(
  limiter: RateLimit | undefined,
  request: Request,
): Promise<boolean> {
  if (!limiter) return true;

  try {
    const { success } = await limiter.limit({ key: clientKey(request) });
    return success;
  } catch (cause) {
    console.error('rate limiter unavailable, allowing request', cause);
    return true;
  }
}

export { REQUESTS_PER_PERIOD };
