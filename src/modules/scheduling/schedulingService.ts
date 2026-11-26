import { MemoryCollection, type Collection, type Entity } from '@/shared/kernel/collection';
import { newId } from '@/shared/kernel/ids';
import { addDays, fromISODate, type Interval } from '@/shared/kernel/time';
import { businessHoursFor } from '@/shared/config';
import { mergeWindows } from './slots';

/** Ventana de disponibilidad que el administrador abre para un barbero en una fecha. */
export interface AvailabilityWindow extends Entity {
  barberId: string;
  date: string; // YYYY-MM-DD
  startMin: number;
  endMin: number;
}

export interface WeeklyDay {
  enabled: boolean;
  startMin: number;
  endMin: number;
}

/** Plantilla semanal propia de cada barbero. `days[0]` = domingo … `days[6]` = sábado. id = barberId. */
export interface WeeklySchedule extends Entity {
  days: WeeklyDay[];
}

export class SchedulingService {
  constructor(
    private readonly windows: Collection<AvailabilityWindow>,
    private readonly weekly: Collection<WeeklySchedule> = new MemoryCollection<WeeklySchedule>(),
  ) {}

  /** Plantilla guardada del barbero; si no tiene, parte del horario comercial base. */
  async getWeekly(barberId: string): Promise<WeeklySchedule> {
    const saved = await this.weekly.get(barberId);
    if (saved) return saved;
    const days: WeeklyDay[] = Array.from({ length: 7 }, (_, dow) => {
      // 2030-01-06 es domingo: sirve para reutilizar businessHoursFor por día de la semana.
      const hours = businessHoursFor(addDays('2030-01-06', dow));
      return { enabled: !!hours, startMin: hours?.startMin ?? 9 * 60, endMin: hours?.endMin ?? 18 * 60 };
    });
    return { id: barberId, days };
  }

  async saveWeekly(barberId: string, days: WeeklyDay[]) {
    if (days.length !== 7) throw new Error('La semana debe tener 7 días');
    for (const d of days) if (d.enabled && !(d.endMin > d.startMin)) throw new Error('En cada día activo, la hora final debe ser posterior a la inicial');
    await this.weekly.put({ id: barberId, days });
  }

  /**
   * Convierte la plantilla semanal en franjas por fecha para los próximos `days` días.
   * Reemplaza lo que hubiera en esas fechas (los días no activos quedan cerrados).
   * No toca citas ya reservadas.
   */
  async applyWeekly(barberId: string, fromDate: string, days: number) {
    const { days: week } = await this.getWeekly(barberId);
    for (let i = 0; i < days; i++) {
      const date = addDays(fromDate, i);
      const d = week[fromISODate(date).getDay()];
      if (d.enabled) await this.openDay(barberId, date, d.startMin, d.endMin);
      else await this.clearDay(barberId, date);
    }
  }

  async listWindows(barberId: string, date: string): Promise<AvailabilityWindow[]> {
    return (await this.windows.all())
      .filter((w) => w.barberId === barberId && w.date === date)
      .sort((a, b) => a.startMin - b.startMin);
  }

  /** Ventanas fusionadas, listas para calcular horarios. */
  async windowsFor(barberId: string, date: string): Promise<Interval[]> {
    const ws = await this.listWindows(barberId, date);
    return mergeWindows(ws.map(({ startMin, endMin }) => ({ startMin, endMin })));
  }

  /** Ventanas fusionadas de varias fechas con UNA sola lectura (para el calendario de reservas). */
  async windowsForDates(barberId: string, dates: string[]): Promise<Record<string, Interval[]>> {
    const wanted = new Set(dates);
    const byDate: Record<string, Interval[]> = Object.fromEntries(dates.map((d) => [d, []]));
    for (const w of await this.windows.all()) {
      if (w.barberId === barberId && wanted.has(w.date)) byDate[w.date].push({ startMin: w.startMin, endMin: w.endMin });
    }
    for (const d of dates) byDate[d] = mergeWindows(byDate[d]);
    return byDate;
  }

  async addWindow(barberId: string, date: string, startMin: number, endMin: number) {
    if (!(endMin > startMin)) throw new Error('La hora final debe ser posterior a la inicial');
    await this.windows.put({ id: newId(), barberId, date, startMin, endMin });
  }

  getWindow = (id: string) => this.windows.get(id);

  removeWindow = (id: string) => this.windows.remove(id);

  async clearDay(barberId: string, date: string) {
    for (const w of await this.listWindows(barberId, date)) await this.windows.remove(w.id);
  }

  /** Borra todas las franjas de un barbero (al darlo de baja). */
  async clearBarber(barberId: string) {
    for (const w of (await this.windows.all()).filter((x) => x.barberId === barberId)) await this.windows.remove(w.id);
    await this.weekly.remove(barberId);
  }

  /** Reemplaza el día por una sola ventana. */
  async openDay(barberId: string, date: string, startMin: number, endMin: number) {
    await this.clearDay(barberId, date);
    await this.addWindow(barberId, date, startMin, endMin);
  }

  /** Aplica el horario comercial base a los próximos `days` días (domingos cerrados). */
  async openBusinessHours(barberId: string, fromDate: string, days: number) {
    for (let i = 0; i < days; i++) {
      const date = addDays(fromDate, i);
      const hours = businessHoursFor(date);
      if (hours) await this.openDay(barberId, date, hours.startMin, hours.endMin);
    }
  }

  async isEmpty() {
    return (await this.windows.all()).length === 0;
  }
}
