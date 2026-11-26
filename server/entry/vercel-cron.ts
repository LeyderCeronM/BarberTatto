// Punto de entrada de /api/cron (recordatorios). `npm run build:api` lo empaqueta en api/cron.js.
import { createRpcFromEnv } from '../env';
import { nodeHandler } from '../node';

const rpc = createRpcFromEnv(process.env);
export default nodeHandler((r) => rpc.handleCron(r));
