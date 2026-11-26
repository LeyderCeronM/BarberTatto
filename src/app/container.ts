/**
 * Punto único que usa la interfaz para hablar con la aplicación. Según VITE_BACKEND:
 *  - "local"  (por defecto): todo corre en el navegador con localStorage. Sirve para probar sin servidor.
 *  - "remote": el navegador llama a /api/rpc y los datos viven en Supabase. Es el modo de producción.
 */
import { LocalCollection } from '@/shared/kernel/collection';
import { systemClock, toISODate } from '@/shared/kernel/time';
import { config } from '@/shared/config';
import { ManualChannel } from '@/modules/notifications';
import { createServices, type Services } from './services';
import { createRemoteServices, remoteAuth } from './remote';
import { setToken, type AuthApi } from './auth';

// Lo que diga VITE_BACKEND manda. Si no está definido: el sitio publicado usa el servidor y el
// desarrollo usa el navegador. Así un despliegue sin la variable nunca arranca por error en modo demo.
const forced = import.meta.env.VITE_BACKEND as string | undefined;
export const backend: 'local' | 'remote' = forced === 'local' || forced === 'remote' ? forced : import.meta.env.PROD ? 'remote' : 'local';
const clock = systemClock;

function buildLocal() {
  const s = createServices({
    collection: (name) => new LocalCollection(name),
    clock,
    channel: new ManualChannel(),
    baseUrl: () => window.location.origin,
  });
  const auth: AuthApi = {
    async adminLogin(pin) {
      if (pin !== config.adminPin) throw new Error('PIN incorrecto');
      setToken('admin', 'local');
    },
    async barberLogin(barberId, pin) {
      if (!(await s.access.verify(barberId, pin))) throw new Error('PIN incorrecto o sin PIN asignado');
      setToken('barber', 'local');
    },
    async customerLogin(phone, pin) {
      const c = await s.customers.login(phone, pin);
      setToken('customer', 'local');
      return c;
    },
    async customerRegister(input) {
      const c = await s.customers.register(input);
      setToken('customer', 'local');
      return c;
    },
  };
  return { ...s, auth };
}

const built = backend === 'remote' ? { ...createRemoteServices(), auth: remoteAuth } : buildLocal();

export const container = { ...built, clock } as Omit<Services, 'bus'> & { auth: AuthApi };

/** Solo modo local: abre 7 días de horario base la primera vez para que la demo funcione. */
export async function seedDemoAvailability() {
  if (backend !== 'local') return;
  const { scheduling, catalog } = container;
  if (!(await scheduling.isEmpty())) return;
  for (const b of await catalog.barbers()) await scheduling.openBusinessHours(b.id, toISODate(clock.now()), 7);
}
