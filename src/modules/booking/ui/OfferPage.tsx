import { useParams } from 'react-router-dom';
import { container } from '@/app/container';
import { useAction, useLiveQuery } from '@/shared/hooks';
import { dayLabel, fmtMin } from '@/shared/kernel/time';

/** Enlace de WhatsApp para el cliente al que se le ofrece adelantar su cita. */
export function OfferPage() {
  const { token = '' } = useParams();
  const data = useLiveQuery(() => container.booking.getOfferView(token), [token]);
  const { busy, error, run } = useAction();

  if (!data) return <main className="page narrow"><p className="muted">Cargando…</p></main>;
  const { offer, appt } = data;
  if (!offer || !appt) return <main className="page narrow"><p className="muted">Esta oferta no existe.</p></main>;

  return (
    <main className="page narrow">
      <p className="eyebrow gold">Se liberó un espacio</p>
      <h1 className="display h2">¿Quieres adelantar tu cita?</h1>
      <p className="lead">
        {appt.customerName.split(' ')[0]}, tu cita de <strong>{appt.serviceName}</strong> con {appt.barberName} el {dayLabel(appt.date)} está a las{' '}
        <strong>{fmtMin(offer.status === 'accepted' ? (appt.movedFromStartMin ?? appt.startMin) : appt.startMin)}</strong>. Podemos atenderte a las{' '}
        <strong>{fmtMin(offer.proposedStartMin)}</strong>.
      </p>

      {offer.status === 'pending' ? (
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => run(() => container.booking.respondOffer(token, true))}>
            Sí, adelantar
          </button>
          <button className="btn ghost" disabled={busy} onClick={() => run(() => container.booking.respondOffer(token, false))}>
            No, mantener mi hora
          </button>
        </div>
      ) : (
        <p className={offer.status === 'accepted' ? 'ok' : 'muted'}>
          {offer.status === 'accepted' && `Listo, tu nueva hora es ${fmtMin(appt.startMin)}.`}
          {offer.status === 'declined' && 'Perfecto, mantenemos tu hora original.'}
          {offer.status === 'expired' && 'Esta oferta ya venció.'}
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </main>
  );
}
