import { describe, expect, it } from 'vitest';
import { CSP } from '../src/headers';

// Imported as text rather than read from disk: these run inside the Workers
// runtime, which has no filesystem.
import html from '../public/index.html?raw';
import js from '../public/app.js?raw';
import headersFile from '../public/_headers?raw';

describe('the page stays compatible with the policy that protects it', () => {
  it('has no inline <style> or <script> block', () => {
    // Both were moved into their own assets so the policy needs no hashes,
    // which would otherwise have to be recomputed on every edit.
    expect(html).not.toMatch(/<style[^>]*>/);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
  });

  it('generates no inline style attributes', () => {
    // style-src 'self' blocks style attributes, so the per-coin colours are
    // applied through the CSSOM instead. Reintroducing one here silently
    // strips the colours from the dashboard, which is how this was caught.
    expect(js).not.toMatch(/style="/);
  });

  it('applies per-coin colours through the CSSOM', () => {
    expect(js).toContain('setProperty');
  });

  it('serves the same policy to assets as the Worker serves to the API', () => {
    // The Worker cannot add headers to static assets, so the two sets live in
    // separate files and can drift apart. This catches that.
    for (const directive of CSP.split('; ')) {
      expect(headersFile).toContain(directive);
    }
  });

  it('keeps every header the Worker sets on the assets too', () => {
    for (const header of [
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Strict-Transport-Security',
    ]) {
      expect(headersFile).toContain(header);
    }
  });
});
