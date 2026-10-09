import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Adds a Content-Security-Policy to the built index.html. Every script, style
 * and font is bundled and served from this origin, so the policy can be strict:
 * the only other place the page may talk to is the API.
 *
 * Build only — the dev server injects inline scripts for hot reload.
 */
function contentSecurityPolicy(apiUrl: string): Plugin {
  const apiOrigin = new URL(apiUrl).origin;
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    // Recharts and React set inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`
      ),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiUrl = env.API_URL || 'http://localhost:4000/graphql';
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), contentSecurityPolicy(apiUrl)],
    build: {
      rollupOptions: {
        // Charting is most of the bundle and changes far less often than app code.
        output: { manualChunks: { charts: ['recharts'] } },
      },
    },
    define: {
      // Monitoring API the dashboard reads from. No secret belongs here —
      // anything in `define` is inlined into the bundle every browser downloads.
      'process.env.API_URL': JSON.stringify(apiUrl),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
