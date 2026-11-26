import { Link, useParams } from 'react-router-dom';
import { container } from '@/app/container';
import { useAction, useLiveQuery } from '@/shared/hooks';
import { dayLabel, fmtMin, formatCOP } from '@/shared/kernel/time';
import { isActive, STATUS_LABEL } from '../domain';
import { Summary } from './BookingWizard';

/** Enlace público que llega por WhatsApp: el cliente confirma que va o cancela. */
export function AppointmentPage() {
  const { token = '' } = useParams();
  const a = useLiveQuery(() => container.booking.getByToken(token), [token], 10000);
  const { busy, error, run } = useAction();

  if (!a) return <main className="page narrow"><p className="muted">Buscando tu cita…</p></main>;

  return (
    <main className="page narrow">
      <p className="eyebrow gold">{STATUS_LABEL[a.status]}</p>
      <h1 className="display h2">Hola, {a.customerName.split(' ')[0]}.</h1>
      <Summary rows={[
        ['Servicio', a.serviceName],
        ['Artesano', a.barberName],
        ['Día', dayLabel(a.date)],
        ['Hora', fmtMin(a.startMin)],
        ['Total', formatCOP(a.priceCOP)],
      ]} />

      {a.status === 'confirmed' && <p className="ok">¡Gracias por confirmar! Te esperamos.</p>}
      {a.status === 'completed' && (
        <>
          <p className="muted">{a.reviewedAt ? '¡Gracias por calificar!' : 'Tu servicio terminó. Calificarlo es necesario para tu próxima reserva.'}</p>
          {!a.reviewedAt && <Link className="btn" to={`/calificar/${a.token}`}>Calificar el servicio</Link>}
        </>
      )}
      {a.status === 'cancelled' && <p className="muted">Tu cita fue cancelada. Puedes <Link to="/reservar">reservar otra</Link>.</p>}

      {isActive(a) && (
        <>
          <p className="muted">¿Vas a venir? Tu respuesta le avisa a la barbería.</p>
          <div className="row">
            {a.status !== 'confirmed' && (
              <button className="btn" disabled={busy} onClick={() => run(() => container.booking.confirmAttendanceByToken(a.token))}>
                Sí, voy
              </button>
            )}
            <button
              className="btn ghost"
              disabled={busy}
              onClick={() => confirm('¿Seguro que no puedes ir? Liberaremos tu espacio.') && run(() => container.booking.cancelByToken(a.token))}
            >
              No puedo ir
            </button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}

      <p>
        <Link className={`btn ${a.status === 'confirmed' ? '' : 'ghost'}`} to="/">
          Ir al inicio
        </Link>
      </p>
    </main>
  );
}
