import { useState } from 'react';
import { container } from '@/app/container';
import { useAction, useLiveQuery } from '@/shared/hooks';
import { addDays, dayLabel, fmtMin, toISODate } from '@/shared/kernel/time';
import { whatsappLink } from '@/modules/notifications';
import { isActive, STATUS_LABEL, type Appointment } from '@/modules/booking';

export function AgendaTab({ lockedBarberId }: { lockedBarberId?: string }) {
  const [date, setDate] = useState(() => toISODate(container.clock.now()));
  const [barberId, setBarberId] = useState(lockedBarberId ?? '');
  const { busy, error, run } = useAction();

  const barbers = useLiveQuery(() => container.catalog.barbers(), []);
  const appts = useLiveQuery(() => container.booking.listByDate(date, barberId || undefined), [date, barberId], 15000);
  const offers = useLiveQuery(() => container.booking.listOffers(date, barberId || undefined), [date, barberId], 15000);

  const apptById = new Map(appts?.map((a) => [a.id, a]));

  const act = (fn: () => Promise<unknown>) => run(fn);
  const complete = (a: Appointment) => {
    const input = prompt(`Monto cobrado a ${a.customerName} (COP). Ajústalo si hubo descuento o el servicio era "Consultar".`, a.priceCOP != null ? String(a.priceCOP) : '');
    if (input === null) return;
    const amount = Number(input.replace(/[^\d]/g, ''));
    if (input.trim() === '' || Number.isNaN(amount)) return alert('Escribe un monto válido');
    act(() => container.booking.markCompleted(a.id, amount));
  };
  const cancel = (a: Appointment) =>
    confirm(`¿Cancelar la cita de ${a.customerName}? Se le ofrecerá el espacio a la siguiente persona.`) && act(() => container.booking.cancel(a.id, 'admin'));

  return (
    <>
      <div className="toolbar">
        <button className="btn ghost small" onClick={() => setDate(addDays(date, -1))}>←</button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="btn ghost small" onClick={() => setDate(addDays(date, 1))}>→</button>
        <button className="btn ghost small" onClick={() => setDate(toISODate(container.clock.now()))}>Hoy</button>
        {!lockedBarberId && (
          <select value={barberId} onChange={(e) => setBarberId(e.target.value)}>
            <option value="">Todos los barberos</option>
            {barbers?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>
      <h2 className="eyebrow gold">{dayLabel(date)}</h2>
      {error && <p className="error">{error}</p>}

      {appts?.length === 0 && <p className="muted">Sin citas para este día.</p>}
      <ul className="agenda">
        {appts?.map((a) => (
          <li key={a.id} className={`appt ${a.status}`}>
            <div className="time mono">{fmtMin(a.startMin)}<span className="muted"> – {fmtMin(a.startMin + a.durationMin)}</span></div>
            <div className="who">
              <strong>{a.customerName}</strong>
              <span className="muted">{a.serviceName} · {a.barberName}</span>
              {a.movedFromStartMin != null && <span className="mono muted">Adelantada desde {fmtMin(a.movedFromStartMin)}</span>}
              {a.notes && <span className="muted">“{a.notes}”</span>}
            </div>
            <span className={`badge ${a.status}`}>{STATUS_LABEL[a.status]}{a.status === 'cancelled' && a.cancelledBy === 'client' ? ' (cliente)' : ''}{a.status === 'completed' ? (a.reviewedAt ? ' · calificada' : ' · falta calificar') : ''}</span>
            <div className="actions">
              <a className="btn ghost small" href={`https://wa.me/${a.customerPhone}`} target="_blank" rel="noreferrer">WhatsApp</a>
              {isActive(a) && (
                <>
                  {a.status === 'booked' && <button className="btn ghost small" disabled={busy} onClick={() => act(() => container.booking.confirmAttendance(a.id))}>Confirmar</button>}
                  <button className="btn ghost small" disabled={busy} onClick={() => complete(a)}>Atendida</button>
                  <button className="btn ghost small" disabled={busy} onClick={() => act(() => container.booking.markNoShow(a.id))}>No llegó</button>
                  <button className="btn ghost small danger" disabled={busy} onClick={() => cancel(a)}>Cancelar</button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!!offers?.length && (
        <>
          <h2 className="eyebrow gold">Ofertas de adelanto</h2>
          <ul className="agenda">
            {offers.map((o) => {
              const a = apptById.get(o.appointmentId);
              return (
                <li key={o.id} className="appt">
                  <div className="time mono">{fmtMin(o.freedStartMin)}</div>
                  <div className="who">
                    <strong>{a?.customerName ?? 'Cliente'}</strong>
                    <span className="muted">Propuesto: {fmtMin(o.proposedStartMin)} (antes {a ? fmtMin(a.movedFromStartMin ?? a.startMin) : '—'})</span>
                  </div>
                  <span className={`badge ${o.status}`}>{{ pending: 'Esperando respuesta', accepted: 'Aceptada', declined: 'Rechazada', expired: 'Vencida' }[o.status]}</span>
                  <div className="actions">
                    {o.status === 'pending' && a && (
                      <a className="btn ghost small" target="_blank" rel="noreferrer" href={whatsappLink({ to: a.customerPhone, text: `Hola ${a.customerName}, ¿puedes adelantar tu cita a las ${fmtMin(o.proposedStartMin)}? ${window.location.origin}/oferta/${o.token}` })}>
                        Insistir por WhatsApp
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
