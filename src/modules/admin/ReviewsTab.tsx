import { container } from '@/app/container';
import { useAction, useLiveQuery } from '@/shared/hooks';
import { Stars } from '@/modules/reviews/ui';

/** Moderación: solo el admin puede eliminar una reseña inapropiada; los clientes no pueden editarlas. */
export function ReviewsTab() {
  const reviews = useLiveQuery(() => container.reviews.list(), []);
  const summary = useLiveQuery(() => container.reviews.summary(), []);
  const { busy, error, run } = useAction();

  return (
    <>
      {summary && summary.count > 0 && (
        <p>
          <Stars value={summary.average} size="1.4rem" /> <strong className="mono">{summary.average.toFixed(1)}</strong>{' '}
          <span className="muted">· {summary.count} calificaciones</span>
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {reviews?.length === 0 && <p className="muted">Aún no hay calificaciones.</p>}
      <ul className="agenda">
        {reviews?.map((r) => (
          <li key={r.id} className="appt team">
            <div className="mono muted">{new Date(r.createdAt).toLocaleDateString('es-CO')}</div>
            <div className="who">
              <span><Stars value={r.rating} /> <strong>{r.customerName}</strong> <span className="muted">· {r.serviceName} con {r.barberName}</span></span>
              {r.comment && <span className="muted">“{r.comment}”</span>}
            </div>
            <span />
            <div className="actions">
              <button
                className="btn ghost small danger"
                disabled={busy}
                onClick={() => confirm('¿Eliminar esta calificación?') && run(() => container.reviews.remove(r.id))}
              >
                Eliminar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
