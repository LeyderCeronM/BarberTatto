import type { Collection } from '@/shared/kernel/collection';
import type { EventBus } from '@/shared/kernel/eventBus';
import type { DomainEvents } from '@/shared/kernel/events';
import type { Clock } from '@/shared/kernel/time';
import type { BookingService } from '@/modules/booking';
import type { RatingSummary, Review } from './domain';

export interface ReviewDeps {
  reviews: Collection<Review>;
  booking: Pick<BookingService, 'getByToken'>;
  bus: EventBus<DomainEvents>;
  clock: Clock;
}

export interface PublicReview {
  rating: number;
  comment?: string;
  firstName: string;
  createdAt: string;
}

export interface SubmitReviewInput {
  /** Token de la cita (el del enlace que llega por WhatsApp). */
  appointmentToken: string;
  rating: number;
  comment?: string;
}

export class ReviewService {
  constructor(private readonly d: ReviewDeps) {}

  async list(): Promise<Review[]> {
    return (await this.d.reviews.all()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Versión pública: solo estrellas, comentario y primer nombre (sin ids, teléfonos ni barbero). */
  async listPublic(): Promise<PublicReview[]> {
    return (await this.list()).map((r) => ({
      rating: r.rating,
      comment: r.comment,
      firstName: r.customerName.split(' ')[0],
      createdAt: r.createdAt,
    }));
  }

  /** Reseña ya hecha para una cita (null si aún no califica). */
  getForAppointment = (appointmentId: string) => this.d.reviews.get(appointmentId);

  /** Solo el admin elimina (moderación). Los clientes no pueden editar ni borrar. */
  remove = (id: string) => this.d.reviews.remove(id);

  async submit(input: SubmitReviewInput): Promise<Review> {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new Error('Elige de 1 a 5 estrellas');

    const appt = await this.d.booking.getByToken(input.appointmentToken);
    if (!appt) throw new Error('No encontramos tu cita');
    if (appt.status !== 'completed') throw new Error('Podrás calificar cuando termine tu servicio');
    if (await this.d.reviews.get(appt.id)) throw new Error('Ya calificaste este servicio');

    const review: Review = {
      id: appt.id,
      appointmentId: appt.id,
      customerName: appt.customerName,
      barberId: appt.barberId,
      barberName: appt.barberName,
      serviceName: appt.serviceName,
      rating: input.rating,
      comment: input.comment?.trim().slice(0, 500) || undefined,
      createdAt: this.d.clock.now().toISOString(),
    };
    await this.d.reviews.put(review);
    await this.d.bus.emit('ReviewSubmitted', { appointmentId: appt.id });
    return review;
  }

  async summary(): Promise<RatingSummary> {
    const all = await this.d.reviews.all();
    const distribution = [0, 0, 0, 0, 0];
    for (const r of all) distribution[r.rating - 1]++;
    const count = all.length;
    const average = count ? all.reduce((s, r) => s + r.rating, 0) / count : 0;
    return { average, count, distribution };
  }
}
