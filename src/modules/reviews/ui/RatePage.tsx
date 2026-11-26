import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { container } from '@/app/container';
import { useAction, useLiveQuery } from '@/shared/hooks';
import { dayLabel, fmtMin } from '@/shared/kernel/time';
import { StarInput, Stars } from './Stars';

/**
 * /calificar/:token — enlace que llega por WhatsApp al terminar el servicio.
 * Solo se puede calificar una vez por servicio atendido y no se puede editar después.
 */
export function RatePage() {
  const { token = '' } = useParams();
  const data = useLiveQuery(async () => {
    const appt = await container.booking.getByToken(token);
    const review = appt && (await container.reviews.getForAppointment(appt.id));
    return { appt, review };
  }, [token]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const { busy, error, run } = useAction();

  if (!data) return <main className="page narrow"><p className="muted">Cargando…</p></main>;
  const { appt, review } = data;
  if (!appt) return <main className="page narrow"><p className="muted">No encontramos este servicio.</p></main>;

  const summary = (
    <p className="muted">
      {appt.serviceName} con {appt.barberName} · {dayLabel(appt.date)} · {fmtMin(appt.startMin)}
    </p>
  );

  if (review) {
    return (
      <main className="page narrow">
        <p className="eyebrow gold">Gracias, {appt.customerName.split(' ')[0]}</p>
        <h1 className="display h2">Ya calificaste este servicio.</h1>
        {summary}
        <Stars value={review.rating} size="1.8rem" />
        {review.comment && <p className="muted">“{review.comment}”</p>}
        <p><Link className="btn" to="/reservar">Reservar otra cita</Link></p>
      </main>
    );
  }

  if (appt.status !== 'completed') {
    return (
      <main className="page narrow">
        <h1 className="display h2">Aún no puedes calificar.</h1>
        {summary}
        <p className="muted">La calificación se habilita cuando termina tu servicio.</p>
        <Link className="btn ghost" to={`/cita/${appt.token}`}>Ver mi cita</Link>
      </main>
    );
  }

  return (
    <main className="page narrow">
      <p className="eyebrow gold">Tu servicio terminó</p>
      <h1 className="display h2">¿Cómo te fue, {appt.customerName.split(' ')[0]}?</h1>
      {summary}
      <form className="form" onSubmit={(e) => { e.preventDefault(); run(() => container.reviews.submit({ appointmentToken: token, rating, comment })); }}>
        <StarInput value={rating} onChange={setRating} />
        <label>Comentario (opcional)
          <textarea rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Cuéntanos cómo fue la atención" />
        </label>
        <p className="muted small-text">Tu calificación es para toda la barbería. Una vez enviada no se puede editar.</p>
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy || rating === 0}>Enviar calificación</button>
      </form>
    </main>
  );
}
