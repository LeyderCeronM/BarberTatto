// Empaqueta las funciones de Vercel (server/entry/*.ts) en api/*.js.
// Vercel no resuelve los alias "@/…" de TypeScript, así que se entrega JavaScript ya empaquetado.
import { build } from 'esbuild';

const banner = '// ARCHIVO GENERADO por `npm run build:api` desde server/entry. No lo edites a mano.';

for (const [entry, out] of [
  ['server/entry/vercel-rpc.ts', 'api/rpc.js'],
  ['server/entry/vercel-cron.ts', 'api/cron.js'],
]) {
  await build({
    entryPoints: [entry],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    tsconfig: 'tsconfig.json',
    banner: { js: banner },
    legalComments: 'none',
  });
  console.log('✓', out);
}
