import { overlaps, type Interval } from '@/shared/kernel/time';

/** Une ventanas que se tocan o solapan ([9-12] + [12-14] => [9-14]). */
export function mergeWindows(windows: Interval[]): Interval[] {
  const sorted = [...windows].sort((a, b) => a.startMin - b.startMin);
  const out: Interval[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && w.startMin <= last.endMin) last.endMin = Math.max(last.endMin, w.endMin);
    else out.push({ ...w });
  }
  return out;
}

export interface StartTimeInput {
  windows: Interval[];
  durationMin: number;
  /** Intervalos ya ocupados por citas activas. */
  busy: Interval[];
  stepMin: number;
  /** No ofrecer horas anteriores a esta (para "hoy"). */
  minStartMin?: number;
}

/**
 * Horas de inicio posibles: el servicio debe caber entero dentro de una ventana
 * abierta por el admin y no chocar con ninguna cita activa.
 */
export function computeStartTimes({ windows, durationMin, busy, stepMin, minStartMin = 0 }: StartTimeInput): number[] {
  const out: number[] = [];
  for (const w of mergeWindows(windows)) {
    for (let t = w.startMin; t + durationMin <= w.endMin; t += stepMin) {
      if (t < minStartMin) continue;
      const candidate = { startMin: t, endMin: t + durationMin };
      if (busy.some((b) => overlaps(candidate, b))) continue;
      out.push(t);
    }
  }
  return out;
}
