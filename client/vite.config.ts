import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '3000'),
    allowedHosts: ['all'],
  },
  build: {
    rollupOptions: {
      output: {
        // PERF-10: route-level React.lazy() (see App.tsx) already keeps
        // recharts/jspdf out of anyone's bundle who never visits the one
        // dashboard that uses them. This splits the stable, rarely-changing
        // vendor code (react itself, the router) into its own chunk too, so
        // a routine app-code deploy doesn't invalidate the browser cache for
        // code that didn't change.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
