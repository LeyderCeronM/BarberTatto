import { fromISODate, type Interval } from './kernel/time';

export const config = {
  businessName: 'Barber Tattoo',
  /** Solo modo local (VITE_BACKEND=local). En modo servidor el PIN es ADMIN_PIN y vive en el servidor. */
  adminPin: (import.meta.env?.VITE_ADMIN_PIN as string | undefined) ?? '1234',
  /** Minutos antes de la cita en que se envía el recordatorio. */
  reminderLeadMin: 20,
  /** Granularidad de los horarios ofrecidos al cliente. */
  slotStepMin: 20,
  /** Cuántos días hacia adelante se puede reservar. */
  bookingHorizonDays: 14,
  address: 'Cra. 4c #19C Norte-8, Popayán, Cauca',
  /** Texto de "Sobre nosotros" del inicio. Edítalo aquí con la historia real del negocio. */
  about:
    'Barber Tattoo es una barbería de autor fundada en 2014 en Popayán. Trabajamos con agenda cerrada para dedicarle a cada cliente el tiempo justo: tijera, máquina, navaja y un ritual de toalla caliente que empieza con un café y termina en el espejo. Nuestro equipo combina clásicos, degradados limpios y diseño de barba, siempre con atención personalizada.',
  /** Programa de fidelidad: cada N cortes atendidos ganan una recompensa. */
  loyalty: { cutsForReward: 10, reward: 'Un corte gratis' },
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Cra. 4c #19C Norte-8, Popayán, Cauca'),
};

/** Horario comercial base (del sitio original). Domingo cerrado. Sirve de plantilla para el admin. */
export function businessHoursFor(isoDate: string): Interval | null {
  const dow = fromISODate(isoDate).getDay();
  if (dow === 0) return null;
  return dow === 6 ? { startMin: 9 * 60, endMin: 18 * 60 } : { startMin: 9 * 60, endMin: 20 * 60 };
}
