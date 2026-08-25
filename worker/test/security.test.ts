import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleRequest } from '../src/api';
import { clientKey, withinLimit } from '../src/ratelimit';
import { withSecurityHeaders } from '../src/headers';

/** A limiter that denies after `allowed` calls, tracked per key. */
function fakeLimiter(allowed: number): RateLimit {
  const seen = new Map<string, number>();

  return {
    async limit({ key }) {
      const used = (seen.get(key) ?? 0) + 1;
      seen.set(key, used);
      return { success: used <= allowed };
    },
  };
}

function get(path: string, ip = '203.0.113.7'): Request {
  return new Request(`https://crypto.example.com${path}`, {
    headers: { 'CF-Connecting-IP': ip },
  });
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM prices').run();
});

describe('rate limiting', () => {
  it('serves requests below the limit', async () => {
    const limiter = fakeLimiter(3);

    const first = await handleRequest(get('/api/latest'), env.DB, limiter);

    expect(first.status).toBe(200);
  });

  it('rejects with 429 once the limit is exceeded', async () => {
    const limiter = fakeLimiter(2);

    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const response = await handleRequest(get('/api/latest'), env.DB, limiter);
      statuses.push(response.status);
    }

    // Provoked, not assumed: the limit is shown to deny.
    expect(statuses).toEqual([200, 200, 429, 429]);
  });

  it('counts each client separately', async () => {
    // Keying on path instead of caller would let one abusive client lock
    // everyone out, turning the protection into the outage it prevents.
    const limiter = fakeLimiter(1);

    const a = await handleRequest(get('/api/latest', '203.0.113.7'), env.DB, limiter);
    const b = await handleRequest(get('/api/latest', '198.51.100.4'), env.DB, limiter);

    expect([a.status, b.status]).toEqual([200, 200]);
  });

  it('rejects before touching the database', async () => {
    // Reading first would spend the row-read allowance the limit protects.
    await env.DB.prepare(
      "INSERT INTO prices VALUES ('bitcoin', 1, 1, 1, 1, 1)",
    ).run();

    const limiter = fakeLimiter(0);
    const response = await handleRequest(get('/api/history'), env.DB, limiter);

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'Too many requests' });
  });

  it('does not let a 429 be cached and replayed as a hit', async () => {
    const response = await handleRequest(get('/api/latest'), env.DB, fakeLimiter(0));

    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('allows the request when the limiter itself fails', async () => {
    // Protecting a cost allowance must not become an outage of its own.
    const broken: RateLimit = {
      async limit() {
        throw new Error('limiter unavailable');
      },
    };

    expect(await withinLimit(broken, get('/api/latest'))).toBe(true);
  });

  it('allows the request when no limiter is bound', async () => {
    expect(await withinLimit(undefined, get('/api/latest'))).toBe(true);
  });

  it('identifies the caller by the edge-set client IP', async () => {
    // X-Forwarded-For is client-supplied and would be trivially spoofed to
    // reset the counter; CF-Connecting-IP is set by Cloudflare.
    const spoofed = new Request('https://crypto.example.com/api/latest', {
      headers: {
        'CF-Connecting-IP': '203.0.113.7',
        'X-Forwarded-For': '1.2.3.4',
      },
    });

    expect(clientKey(spoofed)).toBe('203.0.113.7');
  });
});

describe('security headers', () => {
  const required = [
    'content-security-policy',
    'x-frame-options',
    'x-content-type-options',
    'referrer-policy',
    'permissions-policy',
    'strict-transport-security',
  ];

  it.each(required)('sets %s on API responses', async (header) => {
    const response = await handleRequest(get('/api/latest'), env.DB);

    expect(response.headers.get(header)).toBeTruthy();
  });

  it('sets them on errors too, not only on success', async () => {
    const response = await handleRequest(get('/api/nope'), env.DB);

    expect(response.status).toBe(404);
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  it('forbids framing, which is the concrete risk for a public dashboard', async () => {
    const response = await handleRequest(get('/api/latest'), env.DB);
    const csp = response.headers.get('content-security-policy') ?? '';

    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  it('carries no unsafe-inline or unsafe-eval', async () => {
    // The stylesheet and script were moved out of the page precisely so this
    // stays true; an inline block would force one of these back in.
    const response = await handleRequest(get('/api/latest'), env.DB);
    const csp = response.headers.get('content-security-policy') ?? '';

    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('denies by default so an unlisted resource type is not permitted', async () => {
    const response = await handleRequest(get('/api/latest'), env.DB);

    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'none'",
    );
  });

  it('preserves the original status and body', async () => {
    const inner = new Response('{"ok":true}', {
      status: 418,
      statusText: 'Teapot',
    });
    const wrapped = withSecurityHeaders(inner);

    expect(wrapped.status).toBe(418);
    expect(await wrapped.text()).toBe('{"ok":true}');
  });
});
