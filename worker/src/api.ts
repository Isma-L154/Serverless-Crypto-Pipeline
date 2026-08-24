/**
 * JSON endpoints the dashboard reads.
 *
 * Both responses are small and cheap: a query, a serialisation, and no
 * per-request template rendering, which keeps invocations inside the 10 ms of
 * CPU the free plan allows.
 */

import { RETENTION_SECONDS, selectHistorySince, selectLatest } from './db';

/** Default span of the history endpoint when the caller does not ask for one. */
const DEFAULT_HISTORY_HOURS = 24;

/** Ceiling on the requested span, matching what the hot tier actually keeps. */
const MAX_HISTORY_HOURS = RETENTION_SECONDS / 3600;

/**
 * How long a response may be reused.
 *
 * The cron writes every five minutes, so anything older than that is stale by
 * definition. Caching for a minute collapses the polling of several open tabs
 * into far fewer Worker invocations without the dashboard ever showing data a
 * user would notice as out of date.
 */
const CACHE_SECONDS = 60;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control':
        status === 200
          ? `public, max-age=${CACHE_SECONDS}`
          : 'no-store',
    },
  });
}

/** Errors carry a shape the dashboard can branch on, rather than a bare status. */
function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * Reads the requested span, clamping rather than rejecting.
 *
 * A caller asking for a week gets the two days that exist. Refusing the
 * request would be pedantically correct and less useful.
 */
export function parseHistoryHours(raw: string | null): number {
  if (raw === null || raw.trim() === '') return DEFAULT_HISTORY_HOURS;

  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_HISTORY_HOURS;

  return Math.min(Math.trunc(hours), MAX_HISTORY_HOURS);
}

export async function handleLatest(db: D1Database): Promise<Response> {
  const coins = await selectLatest(db);

  return jsonResponse({
    coins,
    // Lets the dashboard show how fresh the data is without a second call.
    updatedAt: coins[0]?.ts ?? null,
  });
}

export async function handleHistory(
  db: D1Database,
  url: URL,
): Promise<Response> {
  const hours = parseHistoryHours(url.searchParams.get('hours'));
  const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;
  const points = await selectHistorySince(db, cutoff);

  return jsonResponse({ hours, points });
}

/**
 * Routes a request, translating any failure into a JSON error.
 *
 * The message is deliberately generic: a database error can carry query text,
 * and this endpoint is public.
 */
export async function handleRequest(
  request: Request,
  db: D1Database,
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    switch (url.pathname) {
      case '/api/latest':
        return await handleLatest(db);
      case '/api/history':
        return await handleHistory(db, url);
      default:
        return errorResponse('Not found', 404);
    }
  } catch (cause) {
    console.error('request failed', cause);
    return errorResponse('Internal error', 500);
  }
}
