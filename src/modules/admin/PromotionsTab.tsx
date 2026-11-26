import { useState } from 'react';
import { container } from '@/app/container';
import { useAction, useLiveQuery } from '@/shared/hooks';
import { config } from '@/shared/config';
import { dayLabel, toISODate } from '@/shared/kernel/time';

const EMPTY = { title: '', description: '', validUntil: '' };

export function PromotionsTab() {
  const promos = useLiveQuery(() => container.promotions.list(), []);
  const [form, setForm] = useState(EMPTY);
  const { busy, error, run } = useAction();
  const today = toISODate(container.clock.now());

  return (
    <>
      <p className="muted">
        Las promociones activas se muestran a los clientes en su panel. Además, el programa de fidelidad es automático:{' '}
        <strong>cada {config.loyalty.cutsForReward} cortes atendidos ganan «{config.loyalty.reward}»</strong> (se cambia en <code>src/shared/config.ts</code>).
        El descuento se aplica al registrar el monto cobrado en la Agenda.
      </p>
      {error && <p className="error">{error}</p>}
      {promos?.length === 0 && <p className="muted">Aún no hay promociones.</p>}
      <ul className="agenda">
        {promos?.map((p) => {
          const expired = !!p.validUntil && p.validUntil < today;
          return (
            <li key={p.id} className="appt team">
              <div className={`badge ${p.active && !expired ? 'confirmed' : 'cancelled'}`}>{expired ? 'Vencida' : p.active ? 'Activa' : 'Pausada'}</div>
              <div className="who">
                <strong>{p.title}</strong>
                <span className="muted">{p.description}</span>
                {p.validUntil && <span className="mono muted">Hasta {dayLabel(p.validUntil, { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
              </div>
              <span />
              <div className="actions">
                <button className="btn ghost small" disabled={busy} onClick={() => run(() => container.promotions.setActive(p.id, !p.active))}>
                  {p.active ? 'Pausar' : 'Activar'}
                </button>
                <button className="btn ghost small danger" disabled={busy} onClick={() => confirm('¿Eliminar esta promoción?') && run(() => container.promotions.remove(p.id))}>
                  Eliminar
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <h2 className="eyebrow gold">Nueva promoción</h2>
      <form className="form" onSubmit={(e) => { e.preventDefault(); run(async () => { await container.promotions.add(form); setForm(EMPTY); }); }}>
        <label>Título
          <input required placeholder="2x1 en cejas los martes" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label>Descripción
          <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label>Válida hasta (opcional)
          <input type="date" min={today} value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
        </label>
        <button className="btn" disabled={busy}>Publicar promoción</button>
      </form>
    </>
  );
}
