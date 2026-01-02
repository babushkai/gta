import { defineConfig } from 'vite';
import { resolve } from 'path';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [cesium()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    port: 3000,
    open: true
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    chunkSizeWarningLimit: 5000 // Cesium is large
  },
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium/')
  }
});
