import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendTarget = process.env.VITE_BACKEND_TARGET || 'http://localhost:8085';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/sala': {
        target: backendTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sala/, '/api/v1/floor'),
      },
      '/api/v1/floor': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: backendTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
