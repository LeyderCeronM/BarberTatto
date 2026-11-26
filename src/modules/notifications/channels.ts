import type { MessageChannel, OutboxMessage } from './domain';

export const whatsappLink = (m: Pick<OutboxMessage, 'to' | 'text'>) => `https://wa.me/${m.to}?text=${encodeURIComponent(m.text)}`;

/**
 * Modo "manual": no envía nada por sí mismo. El mensaje queda en la bandeja y el admin pulsa
 * "Enviar" para abrir WhatsApp (wa.me) con el texto ya escrito; después se marca como enviado.
 * Funciona sin cuenta de WhatsApp Business API.
 */
export class ManualChannel implements MessageChannel {
  readonly mode = 'manual' as const;
  async send() {
    /* el envío lo hace una persona desde el navegador */
  }
}

/**
 * Modo "cloud": envía solo por la WhatsApp Cloud API de Meta. SOLO se instancia en el servidor:
 * el token nunca llega al navegador.
 *
 * Meta solo permite texto libre dentro de las 24 h posteriores a un mensaje del cliente. Para
 * recordatorios iniciados por el negocio hay que usar plantillas aprobadas (type: "template").
 */
export class WhatsAppCloudChannel implements MessageChannel {
  readonly mode = 'auto' as const;
  constructor(private readonly cfg: { token: string; phoneNumberId: string }) {}

  async send(message: OutboxMessage) {
    const res = await fetch(`https://graph.facebook.com/v21.0/${this.cfg.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: message.to, type: 'text', text: { body: message.text } }),
    });
    if (!res.ok) throw new Error(`WhatsApp API respondió ${res.status}`);
  }
}
