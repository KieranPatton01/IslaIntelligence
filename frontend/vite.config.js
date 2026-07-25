import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // CRITICAL: must exactly match the GitHub repo name with surrounding slashes
  base: '/IslaIntelligence/',

  plugins: [
    // TEMPORARILY DISABLED VitePWA to prove if Service Worker is intercepting and breaking Firestore connections
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
