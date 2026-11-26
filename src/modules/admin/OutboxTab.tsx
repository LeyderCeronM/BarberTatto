import { container } from '@/app/container';
import { useAction, useLiveQuery } from '@/shared/hooks';
import { config } from '@/shared/config';
import { KIND_LABEL, whatsappLink, type OutboxMessage } from '@/modules/notifications';

export function OutboxTab() {
  const messages = useLiveQuery(() => container.notifications.listOutbox(), [], 15000);
  const mode = useLiveQuery(() => container.notifications.getMode(), []);
  const { busy, error, run } = useAction();
  const manual = mode !== 'auto';

  // Manual: se abre WhatsApp con el texto listo y luego se marca como enviado. Automático: lo envía el servidor.
  const send = (m: OutboxMessage) =>
    run(async () => {
      if (manual) {
        window.open(whatsappLink(m), '_blank', 'noopener');
        await container.notifications.markSent(m.id);
      } else {
        await container.notifications.deliver(m.id);
      }
    });

  return (
    <>
      <p className="muted">
        {manual
          ? `Modo manual: los mensajes quedan en cola y pulsas "Enviar" para abrir WhatsApp con el texto listo. Los recordatorios se generan ${config.reminderLeadMin} min antes de cada cita mientras este panel esté abierto.`
          : 'Modo automático: los mensajes se envían solos por la WhatsApp Cloud API.'}
      </p>
      {error && <p className="error">{error}</p>}
      {messages?.length === 0 && <p className="muted">Aún no hay mensajes.</p>}
      <ul className="agenda">
        {messages?.map((m) => (
          <li key={m.id} className="appt">
            <div className="time mono">{new Date(m.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</div>
            <div className="who">
              <strong>{KIND_LABEL[m.kind]} · +{m.to}</strong>
              <span className="muted pre">{m.text}</span>
              {m.error && <span className="error">{m.error}</span>}
            </div>
            <span className={`badge ${m.status}`}>{{ queued: 'En cola', sent: 'Enviado', failed: 'Falló' }[m.status]}</span>
            <div className="actions">
              {m.status !== 'sent' && (
                <button className="btn small" disabled={busy} onClick={() => send(m)}>
                  {manual ? 'Enviar por WhatsApp' : 'Reintentar'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
