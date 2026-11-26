/**
 * Hash de PIN con PBKDF2-SHA256 (Web Crypto: disponible en navegadores y Node 20+).
 * Formato guardado: `pbkdf2$<iteraciones>$<salt b64>$<hash b64>`.
 *
 * Un PIN de 4 dígitos solo tiene 10 000 combinaciones: el hash NO lo hace seguro por sí solo.
 * La protección real es que la base de datos no sea legible desde fuera y el bloqueo por intentos
 * fallidos del servidor (server/auth.ts).
 */
const ITER = 100_000;

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
}

export async function hashPin(pin: string): Promise<string> {
  if (!globalThis.crypto?.subtle) return `plain$${pin}`; // contexto sin Web Crypto (http en red local)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await derive(pin, salt, ITER))}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  if (stored.startsWith('pbkdf2$')) {
    if (!globalThis.crypto?.subtle) return false;
    const [, iter, salt, hash] = stored.split('$');
    const got = new Uint8Array(await derive(pin, unb64(salt), Number(iter)));
    const want = unb64(hash);
    let diff = got.length ^ want.length;
    for (let i = 0; i < got.length; i++) diff |= got[i] ^ (want[i] ?? 0);
    return diff === 0;
  }
  if (stored.startsWith('plain$')) return stored.slice(6) === pin;
  return stored === pin; // datos guardados antes de existir el hash
}
