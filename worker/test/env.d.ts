/// <reference types="@cloudflare/vitest-plugin/types" />

// The bindings declared in wrangler.jsonc reach the tests through the generated
// Cloudflare.Env. This adds the one binding that exists only under test, which
// vitest.config.ts injects so the setup file can build the schema.
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import('@cloudflare/vitest-plugin').D1Migration[];
  }
}
