import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The renderer is now a plain single-page app served by the Node process in
// server/. In development Vite serves it and proxies /api to that process.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // server/index.ts serves this directory (STATIC_DIR).
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT ?? 8080}`,
        changeOrigin: false,
        headers: {
          // Stands in for the assertion IAP injects in production. The server
          // only honours it when AUTH_MODE=dev, and refuses to start in that
          // mode when NODE_ENV=production.
          //
          // Read from the environment so no real address is committed. Set
          // DEV_USER_EMAIL in .env (git-ignored).
          'X-Dev-User-Email': process.env.DEV_USER_EMAIL ?? 'dev@example.test',
        },
      },
    },
  },
});
