import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Unit tests never touch MySQL, but the modules under test read config at
    // import time, so the environment has to be present.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'mysql://test:test@localhost:3306/test',
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      JWT_ISSUER: 'MonitoringSaaS',
      JWT_AUDIENCE: 'MonitoringSaasUsers',
    },
  },
})
