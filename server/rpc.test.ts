import { describe, expect, it } from 'vitest';
import { MemoryCollection, type Collection, type Entity } from '../src/shared/kernel/collection';
import { toISODate } from '../src/shared/kernel/time';
import { ManualChannel } from '../src/modules/notifications';
import { createRpc } from './rpc';
import { signToken, verifyToken } from './auth';

const SECRET = 'a-secret-with-more-than-24-chars!!';
const H = (h: number) => h * 60;

function setup() {
  let now = new Date(2030, 0, 7, 8, 0); // lunes 8:00
  const date = toISODate(now);
  const stores = new Map<string, MemoryCollection<Entity>>();
  const collection = <T extends Entity>(name: string): Collection<T> => {
    if (!stores.has(name)) stores.set(name, new MemoryCollection<Entity>());
    return stores.get(name) as unknown as Collection<T>;
  };
  const rpc = createRpc({
    collection,
    secret: SECRET,
    adminPin: '9999',
    cronSecret: 'cron-secret',
    channel: () => new ManualChannel(),
    baseUrl: () => 'https://barber.test',
    clock: { now: () => now },
  });

  type Res = { status: number; body: { ok: boolean; result?: any; error?: string; code?: string; token?: string } };
  const call = (service: string, method: string, args: unknown[] = [], tokens: string[] = []) =>
    rpc.handleRpc({ method: 'POST', headers: { 'x-auth': tokens.join(',') }, body: { service, method, args } }) as Promise<Res>;

  const adminToken = async () => (await call('auth', 'adminLogin', ['9999'])).body.result.token as string;
  return { call, rpc, date, stores, adminToken, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

describe('permisos', () => {
  it('lo público funciona sin sesión', async () => {
    const { call } = setup();
    const r = await call('catalog', 'barbers');
    expect(r.status).toBe(200);
    expect(r.body.result.map((b: { id: string }) => b.id)).toEqual(['mateo', 'julian', 'samuel']);
  });

  it('sin sesión 401, con otro rol 403', async () => {
    const { call, adminToken } = setup();
    expect((await call('catalog', 'addBarber', [{ name: 'X' }])).status).toBe(401);
    const admin = await adminToken();
    expect((await call('catalog', 'addBarber', [{ name: 'Nuevo', role: '', bio: '' }], [admin])).status).toBe(200);

    await call('access', 'setPin', ['mateo', '1234'], [admin]);
    const barber = (await call('auth', 'barberLogin', ['mateo', '1234'])).body.result.token;
    expect((await call('catalog', 'addBarber', [{ name: 'Otro' }], [barber])).status).toBe(403);
  });

  it('rechaza métodos internos, inexistentes y trucos de prototipo', async () => {
    const { call, adminToken } = setup();
    const admin = await adminToken();
    for (const [s, m] of [['booking', 'findUnrated'], ['booking', 'getAppointment'], ['scheduling', 'isEmpty'], ['booking', 'constructor'], ['__proto__', 'x'], ['booking', '__proto__']]) {
      expect((await call(s, m, ['x'], [admin])).status, `${s}.${m}`).toBe(403);
    }
  });

  it('token manipulado o vencido no vale', async () => {
    const { call, adminToken, advance } = setup();
    const t = await adminToken();
    const [body, sig] = t.split('.');
    expect((await call('promotions', 'list', [], [`${body}.${sig.slice(0, -2)}xx`])).status).toBe(401);
    expect((await call('promotions', 'list', [], [t])).status).toBe(200);
    advance(13 * 3600 * 1000); // pasan las 12 h de vida del token de admin
    expect((await call('promotions', 'list', [], [t])).status).toBe(401);
  });

  it('un barbero solo toca su propio horario y su propia agenda', async () => {
    const { call, adminToken, date } = setup();
    const admin = await adminToken();
    await call('access', 'setPin', ['mateo', '1234'], [admin]);
    const mateo = (await call('auth', 'barberLogin', ['mateo', '1234'])).body.result.token;

    expect((await call('scheduling', 'addWindow', ['mateo', date, H(9), H(13)], [mateo])).status).toBe(200);
    expect((await call('scheduling', 'addWindow', ['julian', date, H(9), H(13)], [mateo])).status).toBe(403);
    expect((await call('booking', 'listByDate', [date, 'mateo'], [mateo])).status).toBe(200);
    expect((await call('booking', 'listByDate', [date, 'julian'], [mateo])).status).toBe(403);
    expect((await call('booking', 'listByDate', [date], [mateo])).status).toBe(403); // sin barberId = todos
    expect((await call('booking', 'listOffers', [date], [mateo])).status).toBe(403);

    // no puede borrar la franja de otro barbero
    await call('scheduling', 'addWindow', ['julian', date, H(14), H(18)], [admin]);
    const [w] = (await call('scheduling', 'listWindows', ['julian', date])).body.result;
    expect((await call('scheduling', 'removeWindow', [w.id], [mateo])).status).toBe(403);
  });
});

describe('bloqueo por intentos fallidos', () => {
  it('tras 5 PIN malos se bloquea aunque luego se escriba el correcto', async () => {
    const { call } = setup();
    for (let i = 0; i < 5; i++) expect((await call('auth', 'adminLogin', ['0000'])).body.error).toBe('PIN incorrecto');
    const locked = await call('auth', 'adminLogin', ['9999']);
    expect(locked.status).toBe(400);
    expect(locked.body.error).toMatch(/Demasiados intentos/);
  });

  it('el bloqueo vence a los 15 minutos', async () => {
    const { call, advance } = setup();
    for (let i = 0; i < 5; i++) await call('auth', 'adminLogin', ['0000']);
    advance(16 * 60 * 1000);
    expect((await call('auth', 'adminLogin', ['9999'])).body.ok).toBe(true);
  });
});

describe('flujo completo por la API', () => {
  async function booked() {
    const s = setup();
    const admin = await s.adminToken();
    await call(s, 'scheduling', 'addWindow', ['mateo', s.date, H(9), H(13)], [admin]);
    const book = (startMin: number, phone: string, name = 'Ana Pérez') =>
      s.call('booking', 'book', [{ serviceId: 'corte', barberId: 'mateo', date: s.date, startMin, customerName: name, customerPhone: phone }]);
    return { ...s, admin, book };
  }
  const call = (s: ReturnType<typeof setup>, ...a: Parameters<ReturnType<typeof setup>['call']>) => s.call(...a);

  it('cliente reserva, confirma y cancela con su token; el admin ve la oferta de adelanto', async () => {
    const { call, admin, date, book } = await booked();
    const a = (await book(H(9), '3001234567')).body.result;
    const b = (await book(H(10), '3109998877', 'Beto')).body.result;

    expect((await call('booking', 'confirmAttendanceByToken', [a.token])).body.result.status).toBe('confirmed');
    expect((await call('booking', 'cancelByToken', [a.token])).body.result.status).toBe('cancelled');

    const offers = (await call('booking', 'listOffers', [date], [admin])).body.result;
    expect(offers[0]).toMatchObject({ appointmentId: b.id, proposedStartMin: H(9), status: 'pending' });
    const accepted = await call('booking', 'respondOffer', [offers[0].token, true]);
    expect(accepted.body.result.appointment.startMin).toBe(H(9));
  });

  it('los datos de las citas NO son legibles públicamente ni se cancela con id desde fuera', async () => {
    const { call, book, date, admin } = await booked();
    const a = (await book(H(9), '3001234567')).body.result;
    expect((await call('booking', 'listByDate', [date])).status).toBe(401);
    expect((await call('booking', 'listByPhone', ['3001234567'])).status).toBe(401);
    expect((await call('booking', 'cancel', [a.id, 'client'])).status).toBe(401);
    expect((await call('booking', 'cancel', [a.id, 'client'], [admin])).status).toBe(403); // por RPC solo "admin"
    expect((await call('booking', 'cancel', [a.id, 'admin'], [admin])).status).toBe(200);
  });

  it('calificar es obligatorio y llega el código para mandar al cliente a calificar', async () => {
    const { call, admin, book } = await booked();
    const a = (await book(H(9), '3001234567')).body.result;
    await call('booking', 'markCompleted', [a.id, 20000], [admin]);

    const blocked = await book(H(10), '3001234567');
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: 'RATING_REQUIRED', token: a.token });

    expect((await call('reviews', 'submit', [{ appointmentToken: a.token, rating: 5, comment: 'Genial' }])).body.ok).toBe(true);
    expect((await book(H(10), '3001234567')).body.ok).toBe(true);

    const pub = (await call('reviews', 'listPublic')).body.result;
    expect(pub).toEqual([{ rating: 5, comment: 'Genial', firstName: 'Ana', createdAt: expect.any(String) }]);
    expect((await call('reviews', 'list')).status).toBe(401); // la versión completa es solo del admin
  });

  it('cuenta de cliente: ve lo suyo y nada de otros', async () => {
    const { call, book } = await booked();
    await book(H(9), '3001234567');
    const me = await call('auth', 'customerRegister', [{ name: 'Ana', phone: '300 123 4567', pin: '2468' }]);
    const token = me.body.result.token;
    expect((await call('booking', 'listByPhone', ['3001234567'], [token])).body.result).toHaveLength(1);
    expect((await call('booking', 'listByPhone', ['3109998877'], [token])).status).toBe(403);
    expect((await call('customers', 'get', ['573001234567'], [token])).status).toBe(200);
    expect((await call('customers', 'get', ['573109998877'], [token])).status).toBe(403);
    expect((await call('auth', 'customerLogin', ['3001234567', '2468'])).body.ok).toBe(true);
    expect((await call('auth', 'customerLogin', ['3001234567', '1111'])).body.error).toBe('WhatsApp o PIN incorrectos');
  });

  it('el PIN queda guardado con hash, nunca en claro', async () => {
    const { call, stores, adminToken } = setup();
    await call('auth', 'customerRegister', [{ name: 'Ana', phone: '3001234567', pin: '2468' }]);
    await call('access', 'setPin', ['mateo', '1357'], [await adminToken()]);
    const saved = JSON.stringify([...(await stores.get('customers')!.all()), ...(await stores.get('barber-access')!.all())]);
    expect(saved).toContain('pbkdf2$');
    expect(saved).not.toContain('2468');
    expect(saved).not.toContain('1357');
  });
});

describe('cron de recordatorios', () => {
  it('exige el secreto y genera el recordatorio a ≤ 20 min', async () => {
    const s = setup();
    const admin = await s.adminToken();
    await s.call('scheduling', 'addWindow', ['mateo', s.date, H(8), H(13)], [admin]);
    await s.call('booking', 'book', [{ serviceId: 'corte', barberId: 'mateo', date: s.date, startMin: H(8), customerName: 'Ana', customerPhone: '3001234567' }]).catch(() => undefined);
    const req = (auth?: string) => s.rpc.handleCron({ method: 'GET', headers: { authorization: auth }, body: undefined });
    expect((await req()).status).toBe(401);
    expect((await req('Bearer mal')).status).toBe(401);
    const ok = await req('Bearer cron-secret');
    expect(ok.status).toBe(200);
    expect((ok.body as { result: { queued: number } }).result.queued).toBe(1);
    expect(((await req('Bearer cron-secret')).body as { result: { queued: number } }).result.queued).toBe(0); // no repite
  });
});

describe('tokens', () => {
  it('firma y verifica; rechaza otro secreto y roles inventados', () => {
    const t = signToken({ role: 'barber', sub: 'mateo' }, SECRET, 60);
    expect(verifyToken(t, SECRET)).toEqual({ role: 'barber', sub: 'mateo' });
    expect(verifyToken(t, 'otro-secreto-otro-secreto-123456')).toBeNull();
    const evil = Buffer.from(JSON.stringify({ role: 'root', sub: 'x', exp: 9999999999 })).toString('base64url');
    expect(verifyToken(`${evil}.${t.split('.')[1]}`, SECRET)).toBeNull();
  });
});
