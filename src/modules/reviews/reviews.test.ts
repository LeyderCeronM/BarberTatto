import { describe, expect, it } from 'vitest';
import { EventBus } from '@/shared/kernel/eventBus';
import type { DomainEvents } from '@/shared/kernel/events';
import { MemoryCollection } from '@/shared/kernel/collection';
import { toISODate } from '@/shared/kernel/time';
import { CatalogService, MemoryCatalogRepository } from '@/modules/catalog';
import { SchedulingService, type AvailabilityWindow } from '@/modules/scheduling';
import { BookingService, RatingRequiredError, type AdvanceOffer, type Appointment } from '@/modules/booking';
import { ReviewService } from './index';
import type { Review } from './domain';

async function setup() {
  const now = new Date(2030, 0, 7, 8, 0);
  const date = toISODate(now);
  const bus = new EventBus<DomainEvents>();
  const scheduling = new SchedulingService(new MemoryCollection<AvailabilityWindow>());
  await scheduling.addWindow('mateo', date, 9 * 60, 13 * 60);
  const clock = { now: () => now };
  const booking = new BookingService({
    appointments: new MemoryCollection<Appointment>(),
    offers: new MemoryCollection<AdvanceOffer>(),
    catalog: new CatalogService(new MemoryCatalogRepository()),
    scheduling,
    bus,
    clock,
  });
  const reviews = new ReviewService({ reviews: new MemoryCollection<Review>(), booking, bus, clock });
  const book = (startMin: number, phone = '3001234567') =>
    booking.book({ serviceId: 'corte', barberId: 'mateo', date, startMin, customerName: 'Ana Pérez', customerPhone: phone });
  return { booking, reviews, book };
}

describe('calificar tras el servicio', () => {
  it('no se puede calificar antes de que el servicio esté atendido', async () => {
    const { reviews, book } = await setup();
    const a = await book(9 * 60);
    await expect(reviews.submit({ appointmentToken: a.token, rating: 5 })).rejects.toThrow(/cuando termine/);
  });

  it('no existe token => no se puede calificar (no basta con entrar a la página)', async () => {
    const { reviews } = await setup();
    await expect(reviews.submit({ appointmentToken: 'inventado', rating: 5 })).rejects.toThrow(/No encontramos/);
  });

  it('una calificación por servicio y no se puede cambiar', async () => {
    const { booking, reviews, book } = await setup();
    const a = await book(9 * 60);
    await booking.markCompleted(a.id);
    const r = await reviews.submit({ appointmentToken: a.token, rating: 4, comment: ' muy bien ' });
    expect(r).toMatchObject({ rating: 4, comment: 'muy bien', customerName: 'Ana Pérez', barberName: 'Mateo Ríos' });
    await expect(reviews.submit({ appointmentToken: a.token, rating: 1 })).rejects.toThrow(/Ya calificaste/);
    expect((await reviews.summary()).average).toBe(4);
  });

  it('rechaza estrellas fuera de 1-5', async () => {
    const { booking, reviews, book } = await setup();
    const a = await book(9 * 60);
    await booking.markCompleted(a.id);
    for (const bad of [0, 6, 3.5, NaN]) await expect(reviews.submit({ appointmentToken: a.token, rating: bad })).rejects.toThrow(/1 a 5/);
  });

  it('calificar es obligatorio: con un servicio sin calificar no se puede reservar de nuevo', async () => {
    const { booking, reviews, book } = await setup();
    const a = await book(9 * 60);
    await booking.markCompleted(a.id);

    const err = await book(10 * 60).catch((e) => e);
    expect(err).toBeInstanceOf(RatingRequiredError);
    expect(err.token).toBe(a.token);
    // Otra persona (otro teléfono) no se ve afectada
    await expect(book(10 * 60, '3109998877')).resolves.toBeTruthy();

    await reviews.submit({ appointmentToken: a.token, rating: 5 });
    await expect(book(11 * 60)).resolves.toBeTruthy();
  });

  it('promedio y distribución', async () => {
    const { booking, reviews, book } = await setup();
    const phones = ['3001110001', '3001110002', '3001110003'];
    const stars = [5, 4, 4];
    for (const [i, p] of phones.entries()) {
      const a = await book((9 + i) * 60, p);
      await booking.markCompleted(a.id);
      await reviews.submit({ appointmentToken: a.token, rating: stars[i] });
    }
    const s = await reviews.summary();
    expect(s.count).toBe(3);
    expect(s.average).toBeCloseTo(13 / 3);
    expect(s.distribution).toEqual([0, 0, 0, 2, 1]);
  });
});
