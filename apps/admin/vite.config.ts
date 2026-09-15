import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

const serveRootStaticPlugin = (): Plugin => ({
  name: 'serve-root-static',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url && (req.url.startsWith('/static/') || req.url.startsWith('/public/'))) {
        const cleanUrl = req.url.split('?')[0];
        const filePath = path.resolve(__dirname, '../..', cleanUrl.replace(/^\//, ''));
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.css': 'text/css',
            '.js': 'application/javascript',
          };
          res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      }
      next();
    });
  },
});

export default defineConfig({
  plugins: [react(), serveRootStaticPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
});
