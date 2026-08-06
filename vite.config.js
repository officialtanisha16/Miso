import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://miso-jguv.onrender.com/',
        changeOrigin: true,
      },
    },
  },
});
