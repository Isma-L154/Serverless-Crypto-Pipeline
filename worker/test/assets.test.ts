import { describe, expect, it } from 'vitest';
import { CSP } from '../src/headers';

// Imported as text rather than read from disk: these run inside the Workers
// runtime, which has no filesystem.
import html from '../public/index.html?raw';
import js from '../public/app.js?raw';
import headersFile from '../public/_headers?raw';
import terms from '../public/terms.html?raw';
import privacy from '../public/privacy.html?raw';

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

describe('legal pages', () => {
  const pages = { terms, privacy };

  it.each(Object.entries(pages))(
    'the %s page is reachable from the dashboard footer',
    (name) => {
      // Linked without the .html suffix: Workers Assets redirects the
      // extension form to the bare path, so linking it would cost every
      // visitor a 307 on the way in.
      expect(html).toContain(`href="/${name}"`);
    },
  );

  it.each(Object.entries(pages))('%s links back to the dashboard', (_n, page) => {
    expect(page).toContain('href="/"');
  });

  it('the two pages link to each other', () => {
    expect(terms).toContain('href="/privacy"');
    expect(privacy).toContain('href="/terms"');
  });

  it.each(Object.entries(pages))(
    '%s carries no inline style or script, so the policy still covers it',
    (_n, page) => {
      expect(page).not.toMatch(/<style[^>]*>/);
      expect(page).not.toMatch(/<script(?![^>]*src=)[^>]*>/);
      expect(page).not.toMatch(/style="/);
    },
  );

  it.each(Object.entries(pages))('%s states when it was last updated', (_n, page) => {
    expect(page).toMatch(/Last updated \d{1,2} \w+ \d{4}/);
  });

  it('leads the terms with the financial disclaimer', () => {
    // The one thing on these pages a reader could be harmed by missing.
    expect(terms).toContain('not financial advice');
    expect(terms.indexOf('not financial advice')).toBeLessThan(
      terms.indexOf('The public API'),
    );
  });

  it('does not claim the site collects nothing', () => {
    // It processes IP addresses for rate limiting; saying otherwise would be
    // untrue, and is the easy mistake to make on a site with no accounts.
    expect(privacy).toContain('IP address');
    expect(privacy).toContain('Rate limiting');
  });
});

describe('third-party attribution and privacy', () => {
  it('credits CoinGecko in one of the wordings their guide accepts', () => {
    // "Prices from CoinGecko" was not one of them.
    const accepted = [
      'Data provided by',
      'Price data by',
      'Source:',
      'Powered by',
    ];
    expect(accepted.some((phrase) => html.includes(phrase))).toBe(true);
    expect(html).toContain('https://www.coingecko.com');
  });

  it('loads no font from a third party', () => {
    // Google Fonts sent every visitor's IP address to Google before a single
    // price was drawn. The stylesheet is deliberately not asserted on here:
    // Vite returns an empty string for `?raw` on a stylesheet, so such a check
    // would pass whatever the file contained.
    for (const asset of [html, terms, privacy]) {
      expect(asset).not.toContain('fonts.googleapis.com');
      expect(asset).not.toContain('fonts.gstatic.com');
    }
  });

  it('forbids third-party fonts in the policy, which is what enforces it', () => {
    expect(headersFile).toContain("font-src 'self'");
    expect(headersFile).not.toContain('gstatic');
    expect(headersFile).not.toContain('googleapis');
  });
});
