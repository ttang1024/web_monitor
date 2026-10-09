import { defineConfig } from 'vitest/config'

/**
 * Integration tests: run the raw SQL (upserts, window functions, JSON queries)
 * against a real MySQL, which the unit tests' Prisma mocks cannot vouch for.
 *
 *   TEST_DATABASE_URL=mysql://root:pw@127.0.0.1:3306/monitoring_test npm run test:int
 *
 * The database is migrated on start and truncated between tests. Never point
 * this at a database whose data you want to keep.
 */
const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL must be set for integration tests')

export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    globalSetup: ['./src/test/migrate.ts'],
    // One database: test files must not interleave.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      ALERTS_ENABLED: 'false',
      RETENTION_ENABLED: 'false',
    },
  },
})
