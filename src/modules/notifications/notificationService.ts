import type { Collection } from '@/shared/kernel/collection';
import type { EventBus } from '@/shared/kernel/eventBus';
import type { DomainEvents } from '@/shared/kernel/events';
import { newId } from '@/shared/kernel/ids';
import type { Clock } from '@/shared/kernel/time';
import { config } from '@/shared/config';
import { minutesUntil, type BookingService } from '@/modules/booking';
import type { MessageChannel, MessageKind, OutboxMessage } from './domain';
import { templates } from './templates';

export interface NotificationDeps {
  outbox: Collection<OutboxMessage>;
  channel: MessageChannel;
  booking: Pick<BookingService, 'getAppointment' | 'getOffer' | 'listActiveUpcoming' | 'markReminderQueued'>;
  bus: EventBus<DomainEvents>;
  clock: Clock;
  /** Origen público para armar enlaces (https://tu-barberia.vercel.app). */
  baseUrl: () => string;
}

export class NotificationService {
  constructor(private readonly d: NotificationDeps) {
    this.subscribe();
  }

  get mode() {
    return this.d.channel.mode;
  }

  /** Para el panel admin (por RPC no se pueden leer getters). */
  async getMode(): Promise<'manual' | 'auto'> {
    return this.d.channel.mode;
  }

  /** Modo manual: la persona ya abrió WhatsApp con el texto; se registra como enviado. */
  async markSent(id: string): Promise<void> {
    const m = await this.d.outbox.get(id);
    if (m) await this.d.outbox.put({ ...m, status: 'sent', sentAt: this.d.clock.now().toISOString(), error: undefined });
  }

  async listOutbox(): Promise<OutboxMessage[]> {
    return (await this.d.outbox.all()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Envía (o reintenta) un mensaje por el canal activo y lo marca. */
  async deliver(id: string): Promise<void> {
    const m = await this.d.outbox.get(id);
    if (!m) return;
    try {
      await this.d.channel.send(m);
      await this.d.outbox.put({ ...m, status: 'sent', sentAt: this.d.clock.now().toISOString(), error: undefined });
    } catch (e) {
      await this.d.outbox.put({ ...m, status: 'failed', error: e instanceof Error ? e.message : 'Error desconocido' });
    }
  }

  /**
   * Revisa las citas activas: a las que les faltan <= reminderLeadMin minutos y aún no
   * tienen recordatorio, se les encola uno. Cubre también el caso "agendó con menos de
   * 20 min de anticipación": el recordatorio sale en el siguiente tick.
   */
  async runReminderTick(): Promise<number> {
    const now = this.d.clock.now();
    let queued = 0;
    for (const a of await this.d.booking.listActiveUpcoming()) {
      if (a.reminderQueuedAt) continue;
      const left = minutesUntil(a, now);
      if (left > config.reminderLeadMin || left < -5) continue;
      await this.enqueue('reminder', a.customerPhone, templates.reminder(a, Math.max(left, 0), this.link('cita', a.token)), a.id);
      await this.d.booking.markReminderQueued(a.id);
      queued++;
    }
    return queued;
  }

  // ---------- Internos ----------

  private link(kind: 'cita' | 'oferta' | 'calificar', token: string) {
    return `${this.d.baseUrl()}/${kind}/${token}`;
  }

  private async enqueue(kind: MessageKind, to: string, text: string, appointmentId?: string) {
    const message: OutboxMessage = { id: newId(), kind, to, text, appointmentId, createdAt: this.d.clock.now().toISOString(), status: 'queued' };
    await this.d.outbox.put(message);
    if (this.d.channel.mode === 'auto') await this.deliver(message.id);
  }

  private subscribe() {
    const { bus, booking } = this.d;

    bus.on('AppointmentBooked', async ({ appointmentId }) => {
      const a = await booking.getAppointment(appointmentId);
      if (a) await this.enqueue('booking', a.customerPhone, templates.booking(a, this.link('cita', a.token)), a.id);
    });

    bus.on('SlotFreed', async ({ offerId }) => {
      if (!offerId) return;
      const offer = await booking.getOffer(offerId);
      const a = offer && (await booking.getAppointment(offer.appointmentId));
      if (offer && a) await this.enqueue('advance_offer', a.customerPhone, templates.advanceOffer(a, offer, this.link('oferta', offer.token)), a.id);
    });

    bus.on('AppointmentCompleted', async ({ appointmentId }) => {
      const a = await booking.getAppointment(appointmentId);
      if (a) await this.enqueue('rating_request', a.customerPhone, templates.ratingRequest(a, this.link('calificar', a.token)), a.id);
    });

    bus.on('AppointmentAdvanced', async ({ appointmentId }) => {
      const a = await booking.getAppointment(appointmentId);
      if (a) await this.enqueue('advanced', a.customerPhone, templates.advanced(a, this.link('cita', a.token)), a.id);
    });
  }
}
