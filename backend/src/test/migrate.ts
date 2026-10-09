import { execSync } from 'node:child_process'

/** Vitest global setup: bring the test database's schema up to date once. */
export default function setup(): void {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  })
}
