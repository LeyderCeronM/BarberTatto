/**
 * Composition root COMPARTIDO: arma todos los módulos a partir de una fábrica de colecciones.
 * Lo usan tanto el navegador (modo local, con localStorage) como el servidor (con Supabase).
 * No toca `window` ni `localStorage`: eso lo decide quien lo llama.
 */
import { EventBus } from '@/shared/kernel/eventBus';
import type { DomainEvents } from '@/shared/kernel/events';
import type { Collection, Entity } from '@/shared/kernel/collection';
import type { Clock } from '@/shared/kernel/time';
import { CatalogService, CollectionCatalogRepository, type Barber } from '@/modules/catalog';
import { SchedulingService, type AvailabilityWindow, type WeeklySchedule } from '@/modules/scheduling';
import { BookingService, type AdvanceOffer, type Appointment } from '@/modules/booking';
import { ReviewService, type Review } from '@/modules/reviews';
import { PromotionService, type Promotion } from '@/modules/promotions';
import { CustomerService, type CustomerAccount } from '@/modules/customers';
import { BarberAccess, type BarberCredential } from '@/modules/admin/access';
import { NotificationService, type MessageChannel, type OutboxMessage } from '@/modules/notifications';

export type CollectionFactory = <T extends Entity>(name: string) => Collection<T>;

export interface ServicesDeps {
  collection: CollectionFactory;
  clock: Clock;
  channel: MessageChannel;
  /** Origen público para armar enlaces de WhatsApp (https://tu-barberia.vercel.app). */
  baseUrl: () => string;
}

export function createServices({ collection, clock, channel, baseUrl }: ServicesDeps) {
  const bus = new EventBus<DomainEvents>();

  const catalog = new CatalogService(new CollectionCatalogRepository(collection<Barber>('barbers'), collection<Entity>('meta')));
  const scheduling = new SchedulingService(collection<AvailabilityWindow>('availability'), collection<WeeklySchedule>('weekly'));
  const booking = new BookingService({
    appointments: collection<Appointment>('appointments'),
    offers: collection<AdvanceOffer>('offers'),
    catalog,
    scheduling,
    bus,
    clock,
  });
  const notifications = new NotificationService({ outbox: collection<OutboxMessage>('outbox'), channel, booking, bus, clock, baseUrl });
  const access = new BarberAccess(collection<BarberCredential>('barber-access'));
  const reviews = new ReviewService({ reviews: collection<Review>('reviews'), booking, bus, clock });
  const promotions = new PromotionService(collection<Promotion>('promotions'), clock);
  const customers = new CustomerService(collection<CustomerAccount>('customers'), clock);

  return { bus, clock, catalog, scheduling, booking, notifications, access, reviews, promotions, customers };
}

export type Services = ReturnType<typeof createServices>;
