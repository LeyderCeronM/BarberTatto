// Punto de entrada de la función /api/rpc en Vercel. `npm run build:api` lo empaqueta en api/rpc.js.
import { createRpcFromEnv } from '../env';
import { nodeHandler } from '../node';

const rpc = createRpcFromEnv(process.env);
export default nodeHandler((r) => rpc.handleRpc(r));
