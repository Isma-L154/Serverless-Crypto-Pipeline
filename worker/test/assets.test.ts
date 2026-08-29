import { describe, expect, it } from 'vitest';
import { CSP } from '../src/headers';

// Imported as text rather than read from disk: these run inside the Workers
// runtime, which has no filesystem.
import html from '../public/index.html?raw';
import js from '../public/app.js?raw';
import headersFile from '../public/_headers?raw';
import terms from '../public/terms.html?raw';
import privacy from '../public/privacy.html?raw';

// The card image itself, as a data URI: binary cannot be read from disk in a
// runtime with no filesystem, and its real dimensions are what the metadata
// claims they are.
import ogImage from '../public/og.png?inline';

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

describe('link preview metadata', () => {
  const SITE = 'https://crypto.cloudils.com';

  // Path and page together. Every assertion below is about the relationship
  // between the two, which is precisely what a copied metadata block breaks.
  const pages: ReadonlyArray<readonly [string, string]> = [
    ['/', html],
    ['/terms', terms],
    ['/privacy', privacy],
  ];

  /**
   * Reads one meta tag's content.
   *
   * Tolerates the wrapped form as well as the single-line one: Prettier breaks
   * a long tag across lines, and a parser that only matched one shape would
   * pass or fail on formatting rather than on what the page declares.
   */
  function metaContent(page: string, name: string): string | undefined {
    const tag = page.match(
      new RegExp(
        String.raw`<meta\s[^>]*?(?:property|name)="${name}"[^>]*?>`,
        's',
      ),
    )?.[0];

    return tag?.match(/content="([^"]*)"/s)?.[1];
  }

  /** Width and height read straight out of the PNG's IHDR chunk. */
  function pngDimensions(dataUri: string): { width: number; height: number } {
    const binary = atob(dataUri.slice(dataUri.indexOf(',') + 1));
    const int32 = (offset: number) =>
      (binary.charCodeAt(offset) << 24) |
      (binary.charCodeAt(offset + 1) << 16) |
      (binary.charCodeAt(offset + 2) << 8) |
      binary.charCodeAt(offset + 3);

    // 8-byte signature, 4-byte chunk length, 4-byte "IHDR", then the two.
    return { width: int32(16), height: int32(20) };
  }

  it.each(pages)('%s declares a full card', (_path, page) => {
    for (const property of [
      'og:type',
      'og:title',
      'og:description',
      'og:image',
      'og:url',
      'twitter:card',
    ]) {
      expect(metaContent(page, property)).toBeTruthy();
    }
  });

  it.each(pages)('%s shares as itself, not as another page', (path, page) => {
    // The easy mistake is copying the block between pages and leaving the
    // homepage's URL on all three, so that every shared link previews the
    // dashboard regardless of which page was actually shared.
    expect(metaContent(page, 'og:url')).toBe(`${SITE}${path}`);
  });

  it.each(pages)('%s points its canonical at the same URL', (_path, page) => {
    const canonical = page.match(
      /<link rel="canonical" href="([^"]+)"/,
    )?.[1];

    expect(canonical).toBe(metaContent(page, 'og:url'));
  });

  it.each(pages)('%s gives the image an absolute URL', (_path, page) => {
    // Crawlers do not resolve a relative og:image against the page, they drop
    // it. A card that looks right in a browser can still be blank everywhere
    // it actually matters.
    expect(metaContent(page, 'og:image')).toBe(`${SITE}/og.png`);
  });

  it('claims the dimensions the image actually has', () => {
    const { width, height } = pngDimensions(ogImage);

    expect(width).toBe(1200);
    expect(height).toBe(630);
    expect(metaContent(html, 'og:image:width')).toBe(String(width));
    expect(metaContent(html, 'og:image:height')).toBe(String(height));
  });

  it('asks for the large card, which is what a 1200x630 image is for', () => {
    // summary and summary_large_image crop very differently; the wrong one
    // reduces this image to a small square with its middle cut out.
    expect(metaContent(html, 'twitter:card')).toBe('summary_large_image');
  });

  it('describes the dashboard the same way everywhere', () => {
    // One canonical description, reused. If the page description and the card
    // description drift, the link and the page it opens say different things.
    expect(metaContent(html, 'og:description')).toBe(
      metaContent(html, 'description'),
    );
    expect(metaContent(html, 'og:description')).toContain('every ten minutes');
  });

  it('gives the image alt text', () => {
    expect(metaContent(html, 'og:image:alt')).toBeTruthy();
  });
});
