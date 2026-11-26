/**
 * Contrato de eventos de dominio entre módulos.
 * Los payloads llevan solo ids/primitivos: quien escucha consulta al dueño del dato.
 */
export type DomainEvents = {
  AppointmentBooked: { appointmentId: string };
  AttendanceConfirmed: { appointmentId: string };
  AppointmentCancelled: { appointmentId: string; by: 'client' | 'admin' };
  /** Se liberó un hueco en la agenda; si hay offerId, se ofreció adelantar a otro cliente. */
  SlotFreed: { barberId: string; date: string; startMin: number; offerId?: string };
  /** El admin marcó el servicio como atendido: dispara la solicitud de calificación. */
  AppointmentCompleted: { appointmentId: string };
  /** El cliente calificó el servicio de esa cita. */
  ReviewSubmitted: { appointmentId: string };
  AppointmentAdvanced: { appointmentId: string; fromStartMin: number; toStartMin: number };
};
