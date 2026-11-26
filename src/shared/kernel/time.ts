export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };

export interface Interval {
  startMin: number;
  endMin: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' en hora local. */
export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** 540 -> '09:00' */
export const fmtMin = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** '09:30' -> 570 */
export function parseHHMM(v: string): number {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
}

export function startDateTime(date: string, startMin: number): Date {
  const d = fromISODate(date);
  d.setMinutes(startMin);
  return d;
}

export function dayLabel(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return fromISODate(iso).toLocaleDateString('es-CO', opts);
}

export const overlaps = (a: Interval, b: Interval) => a.startMin < b.endMin && b.startMin < a.endMin;

export const formatCOP = (n: number | null) =>
  n == null ? 'Consultar' : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

/** Normaliza un celular colombiano a formato internacional sin '+': 3001234567 -> 573001234567 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  return digits;
}
