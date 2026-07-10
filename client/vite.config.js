import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// If you have a local backend, set VITE_BACKEND_URL=http://localhost:5000 in client/.env
// Otherwise it proxies to the deployed Render backend
const backendTarget = process.env.VITE_BACKEND_URL || 'https://aws-quiz-app.onrender.com';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});

