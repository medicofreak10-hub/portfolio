import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiPort = process.env.PORT || 8080;

export default defineConfig({
  root: here,
  publicDir: path.join(here, 'public'),
  build: { outDir: path.join(here, '..', 'dist'), emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: { host: true, port: 5173, proxy: { '/api': `http://localhost:${apiPort}` } },
  css: { postcss: path.join(here, 'postcss.config.cjs') },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'My Halal Portfolio',
        short_name: 'Halal Portfolio',
        description: 'Read-only Shariah-aware portfolio tracker for NSE/BSE',
        theme_color: '#0f7a4a',
        background_color: '#0d0d0d',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,png,svg,ico}'] },
    }),
  ],
});
