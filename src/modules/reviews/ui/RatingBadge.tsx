import { container } from '@/app/container';
import { useLiveQuery } from '@/shared/hooks';
import { Stars } from './Stars';

/** Promedio y cantidad de calificaciones de clientes atendidos. Solo lectura. */
export function RatingBadge() {
  const s = useLiveQuery(() => container.reviews.summary(), []);
  return (
    <div className="rating-badge">
      {s && s.count > 0 ? (
        <>
          <Stars value={s.average} size="1.25rem" />
          <strong className="mono">{s.average.toFixed(1)}</strong>
          <span className="muted">· {s.count} {s.count === 1 ? 'calificación' : 'calificaciones'} de clientes</span>
        </>
      ) : (
        <span className="muted">Aún sin calificaciones de clientes</span>
      )}
    </div>
  );
}
