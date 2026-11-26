export const newId = (): string => crypto.randomUUID();

/** Token corto y no adivinable para enlaces públicos (/cita/:token). */
export function newToken(len = 12): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
