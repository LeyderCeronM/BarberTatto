import { dayLabel, fmtMin } from '@/shared/kernel/time';
import type { AdvanceOffer, Appointment } from '@/modules/booking';

const when = (a: Appointment, startMin = a.startMin) => `${dayLabel(a.date, { weekday: 'long', day: 'numeric', month: 'long' })} a las ${fmtMin(startMin)}`;

export const templates = {
  booking: (a: Appointment, link: string) =>
    `Hola ${a.customerName} 👋 Tu cita en Barber Tattoo quedó reservada:\n` +
    `• ${a.serviceName} con ${a.barberName}\n• ${when(a)}\n\n` +
    `Te escribiremos unos minutos antes para confirmar. Puedes ver o cancelar tu cita aquí: ${link}`,

  reminder: (a: Appointment, minutesLeft: number, link: string) =>
    `⏰ Hola ${a.customerName}, tu cita de ${a.serviceName} con ${a.barberName} es ${minutesLeft <= 1 ? 'ya mismo' : `en ${minutesLeft} min`} (${fmtMin(a.startMin)}).\n\n` +
    `¿Vas a venir? Confírmalo o avísanos si no puedes: ${link}`,

  advanceOffer: (a: Appointment, o: AdvanceOffer, link: string) =>
    `Hola ${a.customerName} 👋 Se liberó un espacio antes de tu cita. ¿Quieres que te atendamos a las ${fmtMin(o.proposedStartMin)} en vez de a las ${fmtMin(a.startMin)}?\n\n` +
    `Responde aquí: ${link}`,

  ratingRequest: (a: Appointment, link: string) =>
    `Gracias por visitarnos, ${a.customerName} ✂️ ¿Cómo estuvo tu servicio? Califica a Barber Tattoo, toma 10 segundos (es necesario para tu próxima reserva): ${link}`,

  advanced: (a: Appointment, link: string) => `✅ Listo ${a.customerName}, tu cita quedó para ${when(a)}. Detalle: ${link}`,
};
