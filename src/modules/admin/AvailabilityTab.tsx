import { useState } from 'react';
import { container } from '@/app/container';
import { businessHoursFor } from '@/shared/config';
import { useAction, useLiveQuery } from '@/shared/hooks';
import { WeeklyEditor } from './WeeklyEditor';
import { addDays, dayLabel, fmtMin, parseHHMM, toISODate } from '@/shared/kernel/time';

export function AvailabilityTab({ lockedBarberId }: { lockedBarberId?: string }) {
  const barbers = useLiveQuery(() => container.catalog.barbers(), []);
  const [barberId, setBarberId] = useState('');
  const [date, setDate] = useState(() => toISODate(container.clock.now()));
  const [from, setFrom] = useState('09:00');
  const [to, setTo] = useState('13:00');
  const { busy, error, run } = useAction();

  // Si el barbero elegido fue eliminado, se vuelve al primero de la lista.
  const bid = lockedBarberId ?? barbers?.find((b) => b.id === barberId)?.id ?? barbers?.[0]?.id ?? '';
  const windows = useLiveQuery(() => (bid ? container.scheduling.listWindows(bid, date) : Promise.resolve([])), [bid, date]);
  const hours = businessHoursFor(date);
  const today = toISODate(container.clock.now());
  const next7 = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  return (
    <>
      {!lockedBarberId && (
        <div className="toolbar">
          <select value={bid} onChange={(e) => setBarberId(e.target.value)}>
            {barbers?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}
      {bid && <WeeklyEditor barberId={bid} />}
      <h2 className="eyebrow gold">Ajustes por día</h2>
      <p className="muted">Abre las franjas en las que se puede reservar. Los clientes solo verán horarios dentro de estas franjas.</p>
      <div className="toolbar">
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>
      <div className="chips">
        {next7.map((d) => (
          <button key={d} className={`chip ${d === date ? 'sel' : ''}`} onClick={() => setDate(d)}>
            <span className="mono">{dayLabel(d, { weekday: 'short' })}</span>
            <strong>{dayLabel(d, { day: 'numeric' })}</strong>
          </button>
        ))}
      </div>

      <h2 className="eyebrow gold">{dayLabel(date)}</h2>
      {error && <p className="error">{error}</p>}
      {windows?.length === 0 && <p className="muted">Día cerrado: no hay horarios disponibles.</p>}
      <ul className="agenda">
        {windows?.map((w) => (
          <li key={w.id} className="appt">
            <div className="time mono">{fmtMin(w.startMin)} – {fmtMin(w.endMin)}</div>
            <div className="who muted">Franja abierta</div>
            <div className="actions">
              <button className="btn ghost small danger" disabled={busy} onClick={() => run(() => container.scheduling.removeWindow(w.id))}>Quitar</button>
            </div>
          </li>
        ))}
      </ul>

      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => container.scheduling.addWindow(bid, date, parseHHMM(from), parseHHMM(to)));
        }}
      >
        <input type="time" step={1200} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="muted">a</span>
        <input type="time" step={1200} value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn small" disabled={busy}>Abrir franja</button>
      </form>

      <div className="toolbar">
        {hours && (
          <button className="btn ghost small" disabled={busy} onClick={() => run(() => container.scheduling.openDay(bid, date, hours.startMin, hours.endMin))}>
            Abrir jornada completa ({fmtMin(hours.startMin)}–{fmtMin(hours.endMin)})
          </button>
        )}
        <button className="btn ghost small" disabled={busy} onClick={() => run(() => container.scheduling.openBusinessHours(bid, date, 14))}>
          Aplicar horario base a 14 días
        </button>
        <button className="btn ghost small danger" disabled={busy} onClick={() => confirm('¿Cerrar el día? Las citas ya reservadas no se cancelan.') && run(() => container.scheduling.clearDay(bid, date))}>
          Cerrar día
        </button>
      </div>
    </>
  );
}
