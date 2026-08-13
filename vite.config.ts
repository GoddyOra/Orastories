/// <reference types="vitest/config" />
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      // Use relative asset paths in production so GitHub Pages serves
      // correctly for project sites regardless of repo path casing.
      base: mode === 'production' ? './' : '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.ORASTORIES_API_KEY),
        'process.env.ORASTORIES_API_KEY': JSON.stringify(env.ORASTORIES_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            // Vendor code changes far less often than app code - splitting
            // it into its own chunk means a deploy that only touches app
            // code doesn't invalidate the browser cache for React/Supabase
            // too.
            manualChunks: {
              'vendor-react': ['react', 'react-dom'],
              'vendor-supabase': ['@supabase/supabase-js']
            }
          }
        }
      },
      test: {
        environment: 'jsdom',
        setupFiles: ['./tests/setup.ts'],
        // Playwright e2e specs live under tests/e2e and are run separately
        // via `npm run test:e2e` - they hit the live Supabase backend and
        // shouldn't be picked up by the fast, hermetic Vitest run.
        exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**']
      }
    };
});
