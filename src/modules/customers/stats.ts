import { minutesUntil, startOf, type Appointment } from '@/modules/booking';

export interface MonthStat {
  key: string; // YYYY-MM
  label: string; // "nov"
  services: number;
  cuts: number;
  paidCOP: number;
}

export interface Favorite {
  name: string;
  count: number;
}

export interface CustomerStats {
  totalServices: number;
  totalCuts: number;
  totalPaidCOP: number;
  averageTicketCOP: number;
  firstVisit?: string;
  /** Últimos 6 meses (el actual al final). */
  monthly: MonthStat[];
  thisMonth: MonthStat;
  favoriteBarber?: Favorite;
  favoriteService?: Favorite;
  loyalty: { cutsForReward: number; cutsInCycle: number; remaining: number; rewardsEarned: number };
  upcoming?: Appointment;
  /** Servicio atendido que aún no se ha calificado. */
  pendingRating?: Appointment;
  cancelled: number;
  noShows: number;
}

const monthKey = (iso: string) => iso.slice(0, 7);
const paid = (a: Appointment) => a.paidCOP ?? a.priceCOP ?? 0;

function top(items: string[]): Favorite | undefined {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best && { name: best[0], count: best[1] };
}

export interface StatsInput {
  appointments: Appointment[];
  /** Ids de servicios que cuentan como "corte". */
  cutServiceIds: Set<string>;
  now: Date;
  cutsForReward: number;
}

/** Función pura: de la lista de citas del cliente a todas sus estadísticas. */
export function computeStats({ appointments, cutServiceIds, now, cutsForReward }: StatsInput): CustomerStats {
  const done = appointments.filter((a) => a.status === 'completed');
  const isCut = (a: Appointment) => cutServiceIds.has(a.serviceId);

  const months: MonthStat[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const inMonth = done.filter((a) => monthKey(a.date) === key);
    months.push({
      key,
      label: d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', ''),
      services: inMonth.length,
      cuts: inMonth.filter(isCut).length,
      paidCOP: inMonth.reduce((s, a) => s + paid(a), 0),
    });
  }

  const totalCuts = done.filter(isCut).length;
  const totalPaidCOP = done.reduce((s, a) => s + paid(a), 0);
  const upcoming = appointments
    .filter((a) => (a.status === 'booked' || a.status === 'confirmed') && minutesUntil(a, now) >= -5)
    .sort((a, b) => startOf(a).getTime() - startOf(b).getTime())[0];

  return {
    totalServices: done.length,
    totalCuts,
    totalPaidCOP,
    averageTicketCOP: done.length ? Math.round(totalPaidCOP / done.length) : 0,
    firstVisit: done.map((a) => a.date).sort()[0],
    monthly: months,
    thisMonth: months[months.length - 1],
    favoriteBarber: top(done.map((a) => a.barberName)),
    favoriteService: top(done.map((a) => a.serviceName)),
    loyalty: {
      cutsForReward,
      cutsInCycle: totalCuts % cutsForReward,
      remaining: cutsForReward - (totalCuts % cutsForReward),
      rewardsEarned: Math.floor(totalCuts / cutsForReward),
    },
    upcoming,
    pendingRating: done.find((a) => !a.reviewedAt),
    cancelled: appointments.filter((a) => a.status === 'cancelled').length,
    noShows: appointments.filter((a) => a.status === 'no_show').length,
  };
}
