/**
 * Modo servidor: el navegador NO toca la base de datos. Cada método de un servicio se envía a
 * /api/rpc, donde el servidor comprueba permisos y ejecuta el mismo código de dominio.
 */
import type { Services } from './services';
import { RatingRequiredError } from '@/modules/booking';
import { allTokens, clearAllTokens, setToken, type AuthApi, type SessionCustomer } from './auth';

/**
 * Solo estas operaciones MODIFICAN datos y avisan a las pantallas para que se refresquen.
 * (Al revés sería peligroso: una lectura que avise de un "cambio" provoca recargas en bucle.)
 */
const MUTATIONS = /^(add|update|remove|save|set|apply|open|clear|book|confirm|cancel|mark|respond|submit|deliver)/;

async function rpc<T>(service: string, method: string, args: unknown[]): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-auth': allTokens().join(',') },
      body: JSON.stringify({ service, method, args }),
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor. Revisa tu internet.');
  }

  let json: { ok: boolean; result?: T; error?: string; code?: string; token?: string } | undefined;
  try {
    json = await res.json();
  } catch {
    throw new Error('El servidor respondió algo inesperado.');
  }
  if (!json?.ok) {
    if (json?.code === 'RATING_REQUIRED' && json.token) throw new RatingRequiredError(json.token);
    if (res.status === 401) {
      clearAllTokens();
      window.dispatchEvent(new Event('bt:changed'));
      throw new Error('Tu sesión venció. Entra de nuevo.');
    }
    throw new Error(json?.error ?? `Error ${res.status}`);
  }
  if (MUTATIONS.test(method)) window.dispatchEvent(new Event('bt:changed'));
  return json.result as T;
}

const serviceProxy = (name: string) =>
  new Proxy(
    {},
    {
      get: (_t, method) => {
        if (typeof method !== 'string' || method === 'then') return undefined; // no ser "thenable"
        return (...args: unknown[]) => rpc(name, method, args);
      },
    },
  );

export function createRemoteServices(): Omit<Services, 'bus' | 'clock'> {
  return {
    catalog: serviceProxy('catalog'),
    scheduling: serviceProxy('scheduling'),
    booking: serviceProxy('booking'),
    notifications: serviceProxy('notifications'),
    access: serviceProxy('access'),
    reviews: serviceProxy('reviews'),
    promotions: serviceProxy('promotions'),
    customers: serviceProxy('customers'),
  } as unknown as Omit<Services, 'bus' | 'clock'>;
}

export const remoteAuth: AuthApi = {
  async adminLogin(pin) {
    const r = await rpc<{ token: string }>('auth', 'adminLogin', [pin]);
    setToken('admin', r.token);
  },
  async barberLogin(barberId, pin) {
    const r = await rpc<{ token: string }>('auth', 'barberLogin', [barberId, pin]);
    setToken('barber', r.token);
  },
  async customerLogin(phone, pin) {
    const r = await rpc<{ token: string; customer: SessionCustomer }>('auth', 'customerLogin', [phone, pin]);
    setToken('customer', r.token);
    return r.customer;
  },
  async customerRegister(input) {
    const r = await rpc<{ token: string; customer: SessionCustomer }>('auth', 'customerRegister', [input]);
    setToken('customer', r.token);
    return r.customer;
  },
};
