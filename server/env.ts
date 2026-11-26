import { ManualChannel, WhatsAppCloudChannel } from '../src/modules/notifications';
import type { Collection, Entity } from '../src/shared/kernel/collection';
import { createRpc, type HttpRequest, type HttpResponse } from './rpc';
import { SupabaseCollection } from './supabase';

export type Env = Record<string, string | undefined>;

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'AUTH_SECRET', 'ADMIN_PIN'] as const;

/** Arma el manejador de producción a partir de variables de entorno (solo servidor). */
export function createRpcFromEnv(env: Env) {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) {
    const msg = `Servidor sin configurar: faltan ${missing.join(', ')}`;
    const fail = async (): Promise<HttpResponse> => ({ status: 503, body: { ok: false, error: msg } });
    return { handleRpc: fail, handleCron: fail };
  }
  if ((env.AUTH_SECRET as string).length < 24) {
    const fail = async (): Promise<HttpResponse> => ({ status: 503, body: { ok: false, error: 'AUTH_SECRET debe tener al menos 24 caracteres' } });
    return { handleRpc: fail, handleCron: fail };
  }
  const cfg = { url: env.SUPABASE_URL as string, key: env.SUPABASE_SERVICE_KEY as string };

  return createRpc({
    collection: <T extends Entity>(name: string): Collection<T> => new SupabaseCollection<T>(cfg, name),
    secret: env.AUTH_SECRET as string,
    adminPin: env.ADMIN_PIN as string,
    cronSecret: env.CRON_SECRET,
    channel: () =>
      env.WHATSAPP_MODE === 'cloud' && env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID
        ? new WhatsAppCloudChannel({ token: env.WHATSAPP_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID })
        : new ManualChannel(),
    baseUrl: (h: HttpRequest['headers']) => {
      if (env.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL.replace(/\/$/, '');
      const host = h['x-forwarded-host'] ?? h['host'] ?? 'localhost';
      const proto = h['x-forwarded-proto'] ?? (host.startsWith('localhost') ? 'http' : 'https');
      return `${proto}://${host}`;
    },
  });
}
