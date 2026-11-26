import type { Entity } from '@/shared/kernel/collection';

export type MessageKind = 'booking' | 'reminder' | 'advance_offer' | 'advanced' | 'rating_request';

export interface OutboxMessage extends Entity {
  kind: MessageKind;
  /** Teléfono internacional sin '+' */
  to: string;
  text: string;
  appointmentId?: string;
  createdAt: string;
  status: 'queued' | 'sent' | 'failed';
  sentAt?: string;
  error?: string;
}

/**
 * Puerto de canal (Strategy). 'manual' = una persona debe pulsar "Enviar"
 * (wa.me); 'auto' = el canal envía solo (WhatsApp Cloud API).
 */
export interface MessageChannel {
  readonly mode: 'manual' | 'auto';
  send(message: OutboxMessage): Promise<void>;
}

export const KIND_LABEL: Record<MessageKind, string> = {
  booking: 'Reserva',
  reminder: 'Recordatorio',
  advance_offer: 'Oferta de adelanto',
  advanced: 'Cita adelantada',
  rating_request: 'Pedir calificación',
};
