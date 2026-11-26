// Netlify Functions v2: /api/cron. Llámalo cada minuto con un cron externo (ver README).
import { createRpcFromEnv } from '../../server/env';

const rpc = createRpcFromEnv(process.env);

export default async (req: Request): Promise<Response> => {
  const out = await rpc.handleCron({ method: req.method, headers: Object.fromEntries(req.headers), body: undefined });
  return Response.json(out.body, { status: out.status, headers: { 'cache-control': 'no-store' } });
};

export const config = { path: '/api/cron' };
