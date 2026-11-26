import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HttpRequest, HttpResponse } from './rpc';

const MAX_BODY = 100_000;

/** Lee el JSON del cuerpo (o usa el ya interpretado por Vercel). */
async function readBody(req: IncomingMessage): Promise<unknown> {
  const pre = (req as IncomingMessage & { body?: unknown }).body;
  if (pre !== undefined) return typeof pre === 'string' ? safeParse(pre) : pre;
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    const buf = Buffer.isBuffer(c) ? c : Buffer.from(c as string);
    size += buf.length;
    if (size > MAX_BODY) throw new Error('Cuerpo demasiado grande');
    chunks.push(buf);
  }
  return safeParse(Buffer.concat(chunks).toString('utf8'));
}

const safeParse = (s: string): unknown => {
  try {
    return s ? JSON.parse(s) : undefined;
  } catch {
    return undefined;
  }
};

/** Adapta un manejador agnóstico a (req, res) de Node: sirve para Vercel y para el servidor de desarrollo. */
export function nodeHandler(fn: (r: HttpRequest) => Promise<HttpResponse>) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    let out: HttpResponse;
    try {
      const headers: HttpRequest['headers'] = {};
      for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v.join(',') : v;
      out = await fn({ method: req.method ?? 'GET', headers, body: await readBody(req) });
    } catch (e) {
      out = { status: 400, body: { ok: false, error: e instanceof Error ? e.message : 'Solicitud inválida' } };
    }
    res.statusCode = out.status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(out.body));
  };
}
