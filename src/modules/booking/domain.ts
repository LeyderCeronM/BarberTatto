import type { Entity } from '@/shared/kernel/collection';
import { startDateTime, type Interval } from '@/shared/kernel/time';

/**
 * booked    = reservada, el cliente aún no confirma asistencia
 * confirmed = el cliente dijo "voy"
 * cancelled = el cliente (o admin) canceló: libera el hueco
 */
export type AppointmentStatus = 'booked' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';

export interface Appointment extends Entity {
  /** Token para el enlace público /cita/:token */
  token: string;
  serviceId: string;
  serviceName: string;
  barberId: string;
  barberName: string;
  durationMin: number;
  priceCOP: number | null;
  date: string;
  startMin: number;
  customerName: string;
  customerPhone: string; // internacional sin '+'
  notes?: string;
  status: AppointmentStatus;
  createdAt: string;
  confirmedAt?: string;
  cancelledAt?: string;
  cancelledBy?: 'client' | 'admin';
  reminderQueuedAt?: string;
  /** Monto realmente cobrado al terminar (COP). Lo registra el admin al marcar Atendida. */
  paidCOP?: number;
  /** Cuándo calificó el servicio (solo aplica a citas atendidas). */
  reviewedAt?: string;
  /** Si fue adelantada: hora original. */
  movedFromStartMin?: number;
}

/** Oferta de adelantar una cita cuando alguien anterior canceló. */
export interface AdvanceOffer extends Entity {
  token: string;
  appointmentId: string;
  barberId: string;
  date: string;
  /** Inicio del hueco liberado que originó la oferta. */
  freedStartMin: number;
  proposedStartMin: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: string;
}

/** Se lanza al reservar si el cliente tiene un servicio ya atendido sin calificar. */
export class RatingRequiredError extends Error {
  constructor(readonly token: string) {
    super('Antes de reservar de nuevo, califica tu último servicio.');
  }
}

export const isActive = (a: Appointment) => a.status === 'booked' || a.status === 'confirmed';
export const intervalOf = (a: Appointment): Interval => ({ startMin: a.startMin, endMin: a.startMin + a.durationMin });
export const startOf = (a: Appointment) => startDateTime(a.date, a.startMin);
export const minutesUntil = (a: Appointment, now: Date) => Math.round((startOf(a).getTime() - now.getTime()) / 60000);

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: 'Sin confirmar',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Atendida',
  no_show: 'No asistió',
};
