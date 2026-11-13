import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

const backendTarget = process.env.VITE_BACKEND_TARGET || 'http://localhost:8085';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'salaApp',
      filename: 'remoteEntry.js',
      exposes: {
        './App': './src/App.tsx',
      },
      shared: ['react', 'react-dom'],
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    cors: true,
    proxy: {
      '/sala/': {
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
  preview: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    cors: true,
  },
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
});
