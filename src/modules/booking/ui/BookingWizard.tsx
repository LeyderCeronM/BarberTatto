import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { container } from '@/app/container';
import { config } from '@/shared/config';
import { useAction, useLiveQuery } from '@/shared/hooks';
import { addDays, dayLabel, fmtMin, formatCOP, toISODate } from '@/shared/kernel/time';
import { getCustomerSession } from '@/modules/customers/ui/session';
import { RatingRequiredError, type Appointment } from '../domain';

const STEPS = ['Servicio', 'Artesano', 'Horario', 'Datos'];

export function BookingWizard() {
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState<string>();
  const [barberId, setBarberId] = useState<string>();
  const [date, setDate] = useState<string>();
  const [startMin, setStartMin] = useState<number>();
  const [form, setForm] = useState({ name: '', phone: '', notes: '' });
  const [done, setDone] = useState<Appointment>();
  const [mustRate, setMustRate] = useState<string>();
  const { busy, error, run } = useAction();

  // Si el cliente tiene sesión, se precargan sus datos.
  const sessionId = getCustomerSession();
  useEffect(() => {
    if (sessionId) container.customers.get(sessionId).then((c) => c && setForm((f) => ({ ...f, name: f.name || c.name, phone: f.phone || c.id }))).catch(() => undefined);
  }, [sessionId]);

  const services = useLiveQuery(() => container.catalog.services(), []);
  const barbers = useLiveQuery(() => container.catalog.barbers(), []);
  const service = services?.find((s) => s.id === serviceId);
  const barber = barbers?.find((b) => b.id === barberId);

  const today = toISODate(container.clock.now());
  const days = Array.from({ length: config.bookingHorizonDays }, (_, i) => addDays(today, i));

  // Horarios por día (para deshabilitar días sin cupo). Se refresca si cambia la agenda.
  const slotsByDay = useLiveQuery(async () => {
    if (!barberId || !serviceId) return {} as Record<string, number[]>;
    return container.booking.availableTimesByDate(barberId, serviceId, days);
  }, [barberId, serviceId], 15000);
  const times = date ? slotsByDay?.[date] ?? [] : [];

  if (done) {
    return (
      <main className="page narrow">
        <p className="eyebrow gold">Reserva confirmada</p>
        <h1 className="display h2">Te esperamos, {done.customerName.split(' ')[0]}.</h1>
        <Summary rows={[
          ['Servicio', done.serviceName],
          ['Artesano', done.barberName],
          ['Día', dayLabel(done.date)],
          ['Hora', fmtMin(done.startMin)],
          ['Total', formatCOP(done.priceCOP)],
        ]} />
        <p className="muted">
          Unos {config.reminderLeadMin} minutos antes te llegará un recordatorio por WhatsApp para que confirmes si vas a venir. Si no puedes, avísanos desde el
          enlace para darle el espacio a otra persona.
        </p>
        <div className="row">
          <Link className="btn" to={`/cita/${done.token}`}>
            Ver / cancelar mi cita
          </Link>
          <Link className="btn ghost" to="/">
            Inicio
          </Link>
        </div>
      </main>
    );
  }

  const submit = () =>
    run(async () => {
      setMustRate(undefined);
      try {
        const a = await container.booking.book({
          serviceId: serviceId!, barberId: barberId!, date: date!, startMin: startMin!,
          customerName: form.name, customerPhone: form.phone, notes: form.notes,
        });
        setDone(a);
      } catch (e) {
        if (e instanceof RatingRequiredError) setMustRate(e.token);
        else throw e;
      }
    });

  return (
    <main className="page">
      <Link to="/" className="muted back">← Volver</Link>
      <p className="eyebrow">06 — Reserva</p>
      <h1 className="display h2">Elige tu ritual.</h1>
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
            <span className="mono">{i + 1}</span> {s}
          </li>
        ))}
      </ol>

      <div className="wizard">
        <section>
          {step === 0 &&
            [...new Set(services?.map((s) => s.category))].map((cat) => (
              <div key={cat} className="svc-group">
                <h3 className="eyebrow gold">{cat}</h3>
                {services?.filter((s) => s.category === cat).map((s) => (
                  <button key={s.id} className={`opt ${serviceId === s.id ? 'sel' : ''}`} onClick={() => { setServiceId(s.id); setStartMin(undefined); setStep(1); }}>
                    <span>{s.name}</span>
                    <span className="mono muted">{s.durationMin} MIN</span>
                    <span className="mono">{formatCOP(s.priceCOP)}</span>
                  </button>
                ))}
              </div>
            ))}

          {step === 1 && (
            <div className="grid3">
              {barbers?.map((b) => (
                <button key={b.id} className={`card opt-card ${barberId === b.id ? 'sel' : ''}`} onClick={() => { setBarberId(b.id); setDate(undefined); setStartMin(undefined); setStep(2); }}>
                  {b.photo && <img src={b.photo} alt="" className="avatar" />}
                  <h3>{b.name}</h3>
                  <p className="eyebrow gold">{b.role}</p>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <>
              <div className="chips">
                {days.map((d) => {
                  const n = slotsByDay?.[d]?.length ?? 0;
                  return (
                    <button key={d} disabled={!n} className={`chip ${date === d ? 'sel' : ''}`} onClick={() => { setDate(d); setStartMin(undefined); }}>
                      <span className="mono">{dayLabel(d, { weekday: 'short' })}</span>
                      <strong>{dayLabel(d, { day: 'numeric' })}</strong>
                      <span className="mono muted">{n ? `${n} cupos` : 'sin cupo'}</span>
                    </button>
                  );
                })}
              </div>
              {date && (
                <div className="chips times">
                  {times.map((t) => (
                    <button key={t} className={`chip ${startMin === t ? 'sel' : ''}`} onClick={() => { setStartMin(t); setStep(3); }}>
                      {fmtMin(t)}
                    </button>
                  ))}
                </div>
              )}
              {!date && <p className="muted">Si el horario que buscas no aparece, ya está ocupado o no fue habilitado.</p>}
            </>
          )}

          {step === 3 && (
            <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
              <label>Nombre
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
              </label>
              <label>WhatsApp
                <input required inputMode="tel" placeholder="300 123 4567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
              </label>
              <label>Notas (opcional)
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
              {mustRate && (
                <div className="card">
                  <p className="gold">Antes de reservar, califica tu último servicio.</p>
                  <p className="muted">Es un paso obligatorio y toma 10 segundos.</p>
                  <Link className="btn" to={`/calificar/${mustRate}`}>Calificar ahora</Link>
                </div>
              )}
              {error && <p className="error">{error}</p>}
              <button className="btn" disabled={busy}>{busy ? 'Reservando…' : 'Confirmar reserva'}</button>
            </form>
          )}

          {step > 0 && <button className="link" onClick={() => setStep(step - 1)}>← Atrás</button>}
        </section>

        <aside className="card">
          <p className="eyebrow gold">Tu reserva</p>
          <Summary rows={[
            ['Servicio', service?.name ?? '—'],
            ['Duración', service ? `${service.durationMin} min` : '—'],
            ['Artesano', barber?.name ?? '—'],
            ['Día', date ? dayLabel(date) : '—'],
            ['Hora', startMin != null ? fmtMin(startMin) : '—'],
            ['Total', service ? formatCOP(service.priceCOP) : '—'],
          ]} />
          <p className="muted small-text">El pago se hace en el local.</p>
        </aside>
      </div>
    </main>
  );
}

export function Summary({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="summary">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="mono muted">{k.toUpperCase()}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
