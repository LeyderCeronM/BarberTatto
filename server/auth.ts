import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Collection, Entity } from '../src/shared/kernel/collection';

export type Role = 'admin' | 'barber' | 'customer';
export interface Principal {
  role: Role;
  /** admin: 'admin' · barber: barberId · customer: WhatsApp normalizado */
  sub: string;
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sign = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest();

/** Token firmado (HMAC-SHA256) y con vencimiento. No necesita guardarse en base de datos. */
export function signToken(p: Principal, secret: string, ttlSec: number, nowMs = Date.now()): string {
  const body = b64u(JSON.stringify({ ...p, exp: Math.floor(nowMs / 1000) + ttlSec }));
  return `${body}.${b64u(sign(body, secret))}`;
}

export function verifyToken(token: string, secret: string, nowMs = Date.now()): Principal | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = sign(body, secret);
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const { role, sub, exp } = JSON.parse(Buffer.from(body, 'base64url').toString()) as Principal & { exp: number };
    if (!['admin', 'barber', 'customer'].includes(role) || typeof sub !== 'string' || exp * 1000 < nowMs) return null;
    return { role, sub };
  } catch {
    return null;
  }
}

export const TOKEN_TTL: Record<Role, number> = { admin: 12 * 3600, barber: 12 * 3600, customer: 7 * 24 * 3600 };

interface Attempts extends Entity {
  count: number;
  lockedUntil?: number;
}

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

/**
 * Bloqueo por intentos fallidos guardado en la base de datos (las funciones serverless no comparten
 * memoria). Tras 5 errores seguidos con la misma clave, 15 minutos sin poder intentar.
 */
export class LoginGuard {
  constructor(
    private readonly store: Collection<Attempts>,
    private readonly now: () => number = Date.now,
  ) {}

  async assertOpen(key: string) {
    const a = await this.store.get(key);
    if (a?.lockedUntil && a.lockedUntil > this.now()) {
      const min = Math.ceil((a.lockedUntil - this.now()) / 60000);
      throw new Error(`Demasiados intentos. Vuelve a intentar en ${min} min.`);
    }
  }

  async fail(key: string) {
    const prev = await this.store.get(key);
    const expired = prev?.lockedUntil && prev.lockedUntil <= this.now();
    const count = (expired ? 0 : (prev?.count ?? 0)) + 1;
    await this.store.put({ id: key, count: count >= MAX_FAILS ? 0 : count, lockedUntil: count >= MAX_FAILS ? this.now() + LOCK_MS : undefined });
  }

  async ok(key: string) {
    if (await this.store.get(key)) await this.store.remove(key);
  }
}

/** Comparación de secretos en tiempo constante. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
