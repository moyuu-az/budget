import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: path.resolve(__dirname, 'electron/index.ts')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: path.resolve(__dirname, 'electron/preload.ts')
      }
    }
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    root: '.',
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html')
      }
    }
  }
});
