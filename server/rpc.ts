import { createServices, type CollectionFactory, type Services } from '../src/app/services';
import type { Clock } from '../src/shared/kernel/time';
import type { MessageChannel } from '../src/modules/notifications';
import { RatingRequiredError } from '../src/modules/booking';
import { LoginGuard, TOKEN_TTL, safeEqual, signToken, verifyToken, type Principal, type Role } from './auth';
import { POLICY } from './policy';
import { ConflictError } from './supabase';

export interface HttpRequest {
  method: string;
  /** Nombres en minúscula. */
  headers: Record<string, string | undefined>;
  /** JSON ya interpretado (o undefined si no había cuerpo). */
  body: unknown;
}
export interface HttpResponse {
  status: number;
  body: unknown;
}

export interface RpcOptions {
  collection: CollectionFactory;
  /** Secreto para firmar sesiones (AUTH_SECRET). */
  secret: string;
  /** PIN del administrador (ADMIN_PIN). */
  adminPin: string;
  /** Si se define, /api/cron exige `Authorization: Bearer <cronSecret>`. */
  cronSecret?: string;
  channel: () => MessageChannel;
  baseUrl: (headers: HttpRequest['headers']) => string;
  clock?: Clock;
}

const fail = (status: number, error: string, extra: object = {}): HttpResponse => ({ status, body: { ok: false, error, ...extra } });
const ok = (result: unknown): HttpResponse => ({ status: 200, body: { ok: true, result } });

/** Errores "de dominio" (mensajes pensados para el usuario) son `Error` planos o ConflictError. */
const isDomainError = (e: unknown): e is Error => e instanceof ConflictError || (e instanceof Error && e.constructor === Error);

export function createRpc(opts: RpcOptions) {
  const clock = opts.clock ?? { now: () => new Date() };

  const services = (headers: HttpRequest['headers']): Services =>
    createServices({ collection: opts.collection, clock, channel: opts.channel(), baseUrl: () => opts.baseUrl(headers) });

  const principalsOf = (headers: HttpRequest['headers']): Principal[] =>
    (headers['x-auth'] ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => verifyToken(t, opts.secret, clock.now().getTime()))
      .filter((p): p is Principal => !!p);

  async function auth(s: Services, method: string, args: unknown[]): Promise<HttpResponse> {
    const guard = new LoginGuard(opts.collection('auth-attempts'), () => clock.now().getTime());
    const issue = (role: Role, sub: string, extra: object = {}) =>
      ok({ token: signToken({ role, sub }, opts.secret, TOKEN_TTL[role], clock.now().getTime()), ...extra });

    // Intenta una verificación con bloqueo por intentos fallidos.
    const attempt = async (key: string, check: () => Promise<boolean>, message: string) => {
      await guard.assertOpen(key);
      if (!(await check())) {
        await guard.fail(key);
        throw new Error(message);
      }
      await guard.ok(key);
    };

    switch (method) {
      case 'adminLogin': {
        if (!opts.adminPin) throw new Error('El servidor no tiene ADMIN_PIN configurado');
        await attempt('admin', async () => safeEqual(String(args[0] ?? ''), opts.adminPin), 'PIN incorrecto');
        return issue('admin', 'admin');
      }
      case 'barberLogin': {
        const [barberId, pin] = [String(args[0] ?? ''), String(args[1] ?? '')];
        await attempt(`barber:${barberId}`, async () => !!(await s.catalog.getBarber(barberId)) && (await s.access.verify(barberId, pin)), 'PIN incorrecto o sin PIN asignado');
        return issue('barber', barberId);
      }
      case 'customerLogin': {
        const [phone, pin] = [String(args[0] ?? ''), String(args[1] ?? '')];
        const key = `customer:${phone.replace(/\D/g, '')}`;
        let customer: Awaited<ReturnType<Services['customers']['login']>> | undefined;
        await attempt(
          key,
          async () => {
            try {
              customer = await s.customers.login(phone, pin);
              return true;
            } catch {
              return false;
            }
          },
          'WhatsApp o PIN incorrectos',
        );
        return issue('customer', customer!.id, { customer });
      }
      case 'customerRegister': {
        const customer = await s.customers.register(args[0] as { name: string; phone: string; pin: string });
        return issue('customer', customer.id, { customer });
      }
      default:
        return fail(404, 'Método de autenticación desconocido');
    }
  }

  async function handleRpc(req: HttpRequest): Promise<HttpResponse> {
    if (req.method !== 'POST') return fail(405, 'Método no permitido');
    const b = req.body as { service?: unknown; method?: unknown; args?: unknown } | undefined;
    if (!b || typeof b.service !== 'string' || typeof b.method !== 'string') return fail(400, 'Solicitud inválida');
    const args = Array.isArray(b.args) ? b.args : [];

    try {
      const s = services(req.headers);
      if (b.service === 'auth') return await auth(s, b.method, args);

      const key = `${b.service}.${b.method}`;
      const rule = Object.hasOwn(POLICY, key) ? POLICY[key] : undefined;
      if (!rule) return fail(403, 'Operación no permitida');

      const principals = principalsOf(req.headers);
      if (!(await rule({ principals, args, services: s }))) {
        return principals.length ? fail(403, 'No tienes permiso para esto') : fail(401, 'Inicia sesión para continuar');
      }

      const target = (s as unknown as Record<string, Record<string, unknown>>)[b.service];
      const fn = target?.[b.method];
      if (typeof fn !== 'function') return fail(404, 'Operación desconocida');
      return ok(await (fn as (...a: unknown[]) => unknown).apply(target, args));
    } catch (e) {
      if (e instanceof RatingRequiredError) return fail(409, e.message, { code: 'RATING_REQUIRED', token: e.token });
      if (isDomainError(e)) return fail(400, e.message);
      console.error('[rpc]', b.service, b.method, e);
      return fail(500, 'Error interno del servidor');
    }
  }

  /** Recordatorios: lo llama un cron externo con `Authorization: Bearer CRON_SECRET`. */
  async function handleCron(req: HttpRequest): Promise<HttpResponse> {
    if (!opts.cronSecret) return fail(503, 'CRON_SECRET no configurado');
    const given = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');
    if (!safeEqual(given, opts.cronSecret)) return fail(401, 'No autorizado');
    try {
      const queued = await services(req.headers).notifications.runReminderTick();
      return ok({ queued });
    } catch (e) {
      console.error('[cron]', e);
      return fail(500, 'Error interno del servidor');
    }
  }

  return { handleRpc, handleCron };
}
