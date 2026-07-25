import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // CRITICAL: must exactly match the GitHub repo name with surrounding slashes
  base: '/IslaIntelligence/',

  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      // We supply our own /public/manifest.json — don't let the plugin generate one
      manifest: false,
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // Pre-cache the entire app shell
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webp}'],
        // SPA fallback — any navigation goes to index.html
        navigateFallback: '/IslaIntelligence/index.html',
        // Don't intercept requests to external APIs
        navigateFallbackDenylist: [/^\/api/, /workers\.dev/, /googleapis\.com/],
        runtimeCaching: [
          {
            // Google Fonts — cache-first, 1 year
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Firebase Storage images — cache-first, 30 days
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'firebase-storage-images',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Material Symbols icon font
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/css2\?family=Material/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'material-icons' },
          },
        ],
      },
    }),
  ],

  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: 'index.html',
        mermaidTest: 'test-mermaid.html'
      },
      output: {
        // Chunk vendor libs separately for better caching
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
        },
      },
    },
  },
});
