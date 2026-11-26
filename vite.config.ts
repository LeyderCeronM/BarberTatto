import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * En desarrollo, sirve /api/rpc y /api/cron con el MISMO código que corre en producción
 * (server/), leyendo las variables de .env. Así `npm run dev` funciona con Supabase sin Vercel.
 */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      const env = { ...process.env, ...loadEnv(server.config.mode, process.cwd(), '') };
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path !== '/api/rpc' && path !== '/api/cron') return next();
        const { createRpcFromEnv } = await server.ssrLoadModule('/server/env.ts');
        const { nodeHandler } = await server.ssrLoadModule('/server/node.ts');
        const rpc = createRpcFromEnv(env);
        return nodeHandler((r: never) => (path === '/api/rpc' ? rpc.handleRpc(r) : rpc.handleCron(r)))(req, res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
});
