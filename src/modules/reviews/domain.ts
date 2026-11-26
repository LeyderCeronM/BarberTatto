import type { Entity } from '@/shared/kernel/collection';

/**
 * Calificación de la barbería hecha por un cliente tras un servicio atendido.
 * Una por cita (id = appointmentId) y no se puede editar: así solo califican clientes reales.
 */
export interface Review extends Entity {
  appointmentId: string;
  /** Datos de la cita al momento de calificar (para moderación). */
  customerName: string;
  barberId: string;
  barberName: string;
  serviceName: string;
  /** Entero de 1 a 5 */
  rating: number;
  comment?: string;
  createdAt: string;
}

export interface RatingSummary {
  average: number;
  count: number;
  /** Cantidad de reseñas por estrellas: índice 0 = 1 estrella … 4 = 5 estrellas */
  distribution: number[];
}
