import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { '@': path.resolve(here, 'src') } },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: false },
      '/files': { target: 'http://localhost:4000', changeOrigin: false },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand/favicon-32.png', 'brand/apple-touch-icon.png'],
      manifest: {
        name: 'MSBLR E-Directory',
        short_name: 'MSBLR',
        description: 'Maheshwari Sabha, Bengaluru — Connect • Engage • Prosper',
        theme_color: '#C2501E',
        background_color: '#F7F1E8',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/brand/logo-orange-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/brand/logo-orange.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/, /^\/files/],
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1200 },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
});
