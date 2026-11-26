/**
 * Sesiones del navegador: un token por rol, en sessionStorage (se pierde al cerrar la pestaña).
 * En modo local el token es solo una marca; en modo remoto es el token firmado por el servidor.
 */
export type Role = 'admin' | 'barber' | 'customer';

const key = (r: Role) => `bt:token:${r}`;

export function getToken(role: Role): string | undefined {
  try {
    return sessionStorage.getItem(key(role)) ?? undefined;
  } catch {
    return undefined;
  }
}
export function setToken(role: Role, token: string) {
  try {
    sessionStorage.setItem(key(role), token);
  } catch {
    /* sin almacenamiento: no hay sesión persistente */
  }
}
export function clearToken(role: Role) {
  try {
    sessionStorage.removeItem(key(role));
  } catch {
    /* nada */
  }
}
export const allTokens = (): string[] => (['admin', 'barber', 'customer'] as const).flatMap((r) => getToken(r) ?? []);
export function clearAllTokens() {
  (['admin', 'barber', 'customer'] as const).forEach(clearToken);
}

export interface SessionCustomer {
  id: string;
  name: string;
}

/** Inicio de sesión de cada rol. La implementación depende del modo (local o servidor). */
export interface AuthApi {
  adminLogin(pin: string): Promise<void>;
  barberLogin(barberId: string, pin: string): Promise<void>;
  customerLogin(phone: string, pin: string): Promise<SessionCustomer>;
  customerRegister(input: { name: string; phone: string; pin: string }): Promise<SessionCustomer>;
}
