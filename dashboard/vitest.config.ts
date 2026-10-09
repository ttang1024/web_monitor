import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**'],
    environment: 'jsdom',
    globals: true,
  },
  define: {
    // api.ts reads this at module scope, exactly as the Vite build inlines it.
    // Without it the import throws before any test runs.
    'process.env.API_URL': JSON.stringify('http://localhost:4000/graphql'),
  },
});
