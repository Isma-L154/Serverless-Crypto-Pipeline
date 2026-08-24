import { applyD1Migrations, env } from 'cloudflare:test';

// Each test file gets a fresh, isolated database. Applying the real migrations
// here means the tests fail if a migration is wrong, rather than running
// against a schema that only exists in the test setup.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
