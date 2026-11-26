// Netlify Functions v2: /api/rpc. Netlify empaqueta este archivo con esbuild y respeta los alias de tsconfig.
import { createRpcFromEnv } from '../../server/env';

const rpc = createRpcFromEnv(process.env);

export default async (req: Request): Promise<Response> => {
  const body = await req.json().catch(() => undefined);
  const out = await rpc.handleRpc({ method: req.method, headers: Object.fromEntries(req.headers), body });
  return Response.json(out.body, { status: out.status, headers: { 'cache-control': 'no-store' } });
};

export const config = { path: '/api/rpc' };
