import { describe, expect, it } from 'vitest';
import { MemoryCollection } from '@/shared/kernel/collection';
import { SchedulingService, type AvailabilityWindow, type WeeklySchedule } from './index';

const H = (h: number) => h * 60;
const make = () => new SchedulingService(new MemoryCollection<AvailabilityWindow>(), new MemoryCollection<WeeklySchedule>());

describe('horario semanal por barbero', () => {
  it('por defecto parte del horario comercial: domingo cerrado', async () => {
    const w = await make().getWeekly('mateo');
    expect(w.days[0].enabled).toBe(false);
    expect(w.days[1]).toMatchObject({ enabled: true, startMin: H(9), endMin: H(20) });
    expect(w.days[6]).toMatchObject({ enabled: true, endMin: H(18) });
  });

  it('cada barbero aplica su propio horario a fechas concretas', async () => {
    const s = make();
    const base = await s.getWeekly('ana');
    // Ana: solo lunes 10-14. 2030-01-07 es lunes.
    const days = base.days.map((d, i) => (i === 1 ? { enabled: true, startMin: H(10), endMin: H(14) } : { ...d, enabled: false }));
    await s.saveWeekly('ana', days);
    await s.applyWeekly('ana', '2030-01-07', 14);
    expect(await s.windowsFor('ana', '2030-01-07')).toEqual([{ startMin: H(10), endMin: H(14) }]);
    expect(await s.windowsFor('ana', '2030-01-08')).toEqual([]); // martes cerrado
    expect(await s.windowsFor('ana', '2030-01-14')).toEqual([{ startMin: H(10), endMin: H(14) }]); // lunes siguiente
    // El horario de otro barbero no cambia
    expect(await s.windowsFor('luis', '2030-01-07')).toEqual([]);
  });

  it('al aplicar reemplaza ajustes previos del día y rechaza rangos inválidos', async () => {
    const s = make();
    await s.addWindow('ana', '2030-01-07', H(8), H(9));
    const { days } = await s.getWeekly('ana');
    await s.saveWeekly('ana', days);
    await s.applyWeekly('ana', '2030-01-07', 1);
    expect(await s.windowsFor('ana', '2030-01-07')).toEqual([{ startMin: H(9), endMin: H(20) }]);
    await expect(s.saveWeekly('ana', days.map((d) => ({ ...d, endMin: d.startMin })))).rejects.toThrow(/posterior/);
  });
});
