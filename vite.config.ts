import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

// In development the API runs on :8000; proxying keeps the SPA same-origin so
// Sanctum cookie auth + CSRF work exactly as in production.
// API_PROXY_TARGET points a second dev server at another API, e.g. one on a throwaway database.
const api = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000';
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: api, changeOrigin: false },
      '/sanctum': { target: api, changeOrigin: false },
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // By package path, not by entry name: listing 'recharts' as an entry also pulled the small helpers it shares
        // with the app (clsx…) into the charts chunk, so every page, even sign-in, downloaded 500 KB of charts.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'react';
          if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return 'query';
          // Small helpers used by the app and by the charts: a chunk of their own, or the charts would come with them.
          if (/[\\/]node_modules[\\/](clsx|tailwind-merge)[\\/]/.test(id)) return 'ui';
          if (/[\\/]node_modules[\\/](recharts|recharts-scale|react-smooth|victory-vendor|d3-[^\\/]+|internmap|decimal\.js-light|eventemitter3|lodash|fast-equals|react-is|tiny-invariant)[\\/]/.test(id)) return 'charts';
          return undefined;
        },
      },
    },
  },
  test: { environment: 'node' },
} as never);
