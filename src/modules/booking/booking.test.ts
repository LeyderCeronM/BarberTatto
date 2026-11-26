import { describe, expect, it } from 'vitest';
import { EventBus } from '@/shared/kernel/eventBus';
import type { DomainEvents } from '@/shared/kernel/events';
import { MemoryCollection } from '@/shared/kernel/collection';
import { toISODate } from '@/shared/kernel/time';
import { CatalogService, MemoryCatalogRepository } from '@/modules/catalog';
import { SchedulingService, type AvailabilityWindow } from '@/modules/scheduling';
import { BookingService, type AdvanceOffer, type Appointment } from './index';

const H = (h: number, m = 0) => h * 60 + m;

async function setup(nowHour = 8) {
  const now = new Date(2030, 0, 7, nowHour, 0); // lunes
  const date = toISODate(now);
  const bus = new EventBus<DomainEvents>();
  const events: string[] = [];
  (['AppointmentBooked', 'SlotFreed', 'AppointmentAdvanced'] as const).forEach((e) => bus.on(e, () => void events.push(e)));
  const scheduling = new SchedulingService(new MemoryCollection<AvailabilityWindow>());
  await scheduling.addWindow('mateo', date, H(9), H(13));
  const booking = new BookingService({
    appointments: new MemoryCollection<Appointment>(),
    offers: new MemoryCollection<AdvanceOffer>(),
    catalog: new CatalogService(new MemoryCatalogRepository()),
    scheduling,
    bus,
    clock: { now: () => now },
  });
  const book = (startMin: number, name: string, serviceId = 'corte') =>
    booking.book({ serviceId, barberId: 'mateo', date, startMin, customerName: name, customerPhone: '3001234567' });
  return { booking, book, date, events };
}

describe('disponibilidad', () => {
  it('solo ofrece horas dentro de las franjas abiertas y quita las ocupadas', async () => {
    const { booking, book, date } = await setup();
    const before = await booking.availableTimes('mateo', 'corte', date);
    expect(before[0]).toBe(H(9));
    expect(before.every((t) => t + 40 <= H(13))).toBe(true);
    await book(H(9), 'Ana');
    const after = await booking.availableTimes('mateo', 'corte', date);
    expect(after).not.toContain(H(9));
    expect(after).not.toContain(H(9, 20));
    expect(after).toContain(H(9, 40));
  });

  it('rechaza reservar un horario no disponible', async () => {
    const { book } = await setup();
    await book(H(10), 'Ana');
    await expect(book(H(10), 'Beto')).rejects.toThrow(/no está disponible/);
  });
});

describe('cancelación y adelanto', () => {
  it('al cancelar, ofrece el hueco a la siguiente cita', async () => {
    const { booking, book, date } = await setup();
    const a = await book(H(9), 'Ana');
    const b = await book(H(10), 'Beto');
    await booking.cancel(a.id, 'client');
    const [offer] = await booking.listOffers(date);
    expect(offer).toMatchObject({ appointmentId: b.id, proposedStartMin: H(9), status: 'pending' });
  });

  it('si la siguiente acepta, se mueve y su hora vieja se ofrece en cascada', async () => {
    const { booking, book, date, events } = await setup();
    const a = await book(H(9), 'Ana');
    const b = await book(H(10), 'Beto');
    const c = await book(H(11), 'Carla');
    await booking.cancel(a.id, 'client');
    const [offer] = await booking.listOffers(date);
    const res = await booking.respondOffer(offer.token, true);
    expect(res.appointment).toMatchObject({ id: b.id, startMin: H(9), status: 'confirmed', movedFromStartMin: H(10) });
    expect(events).toContain('AppointmentAdvanced');
    const offers = await booking.listOffers(date);
    expect(offers.find((o) => o.status === 'pending')).toMatchObject({ appointmentId: c.id, proposedStartMin: H(10) });
  });

  it('si la siguiente rechaza, el hueco pasa a la que sigue', async () => {
    const { booking, book, date } = await setup();
    const a = await book(H(9), 'Ana');
    await book(H(10), 'Beto');
    const c = await book(H(11), 'Carla');
    await booking.cancel(a.id, 'client');
    const [first] = await booking.listOffers(date);
    await booking.respondOffer(first.token, false);
    const pending = (await booking.listOffers(date)).find((o) => o.status === 'pending');
    expect(pending).toMatchObject({ appointmentId: c.id, proposedStartMin: H(9) });
  });

  it('no ofrece nada si no hay citas posteriores', async () => {
    const { booking, book, date } = await setup();
    const a = await book(H(9), 'Ana');
    await booking.cancel(a.id, 'client');
    expect(await booking.listOffers(date)).toHaveLength(0);
  });

  it('no propone horas en el pasado', async () => {
    const { booking, book, date } = await setup(8);
    const a = await book(H(9), 'Ana');
    await book(H(10), 'Beto');
    // Reloj a las 9:30: el hueco de las 9:00 ya pasó, lo mínimo que se puede proponer es 9:30
    const late = new BookingService({
      appointments: (booking as any).d.appointments,
      offers: (booking as any).d.offers,
      catalog: (booking as any).d.catalog,
      scheduling: (booking as any).d.scheduling,
      bus: (booking as any).d.bus,
      clock: { now: () => new Date(2030, 0, 7, 9, 30) },
    });
    await late.cancel(a.id, 'client');
    const [offer] = await late.listOffers(date);
    expect(offer.proposedStartMin).toBe(H(9, 30));
  });
});

describe('cobro al terminar', () => {
  it('guarda el monto cobrado; por defecto el precio del servicio', async () => {
    const { booking, book } = await setup();
    const a = await book(H(9), 'Ana');
    const b = await book(H(10), 'Beto');
    expect((await booking.markCompleted(a.id, 18000)).paidCOP).toBe(18000);
    expect((await booking.markCompleted(b.id)).paidCOP).toBe(22000);
  });

  it('rechaza montos inválidos y servicios "Consultar" sin monto quedan en 0 hasta que el admin lo indique', async () => {
    const { booking, book } = await setup();
    const a = await book(H(9), 'Ana');
    await expect(booking.markCompleted(a.id, -5)).rejects.toThrow(/monto/);
    const c = await book(H(10), 'Carla', 'color'); // precio "Consultar"
    expect((await booking.markCompleted(c.id)).paidCOP).toBe(0);
  });

  it('listByPhone devuelve solo las citas de ese cliente, la más reciente primero', async () => {
    const { booking, book } = await setup();
    await book(H(9), 'Ana');
    await book(H(10), 'Ana');
    expect((await booking.listByPhone('300 123 4567')).map((a) => a.startMin)).toEqual([H(10), H(9)]);
    expect(await booking.listByPhone('3109999999')).toEqual([]);
  });
});

describe('horarios por lotes', () => {
  it('availableTimesByDate coincide con availableTimes día por día y descuenta citas', async () => {
    const { booking, book, date } = await setup();
    await book(H(9), 'Ana');
    const tomorrow = '2030-01-08';
    const batch = await booking.availableTimesByDate('mateo', 'corte', [date, tomorrow]);
    expect(batch[date]).toEqual(await booking.availableTimes('mateo', 'corte', date));
    expect(batch[date]).not.toContain(H(9));
    expect(batch[tomorrow]).toEqual([]); // sin franjas abiertas ese día
  });

  it('rechaza fechas inválidas o demasiadas fechas', async () => {
    const { booking } = await setup();
    await expect(booking.availableTimesByDate('mateo', 'corte', ['hoy'])).rejects.toThrow(/Fechas/);
    await expect(booking.availableTimesByDate('mateo', 'corte', Array.from({ length: 63 }, () => '2030-01-07'))).rejects.toThrow(/Fechas/);
  });
});
