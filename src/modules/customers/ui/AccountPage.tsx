import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { container } from '@/app/container';
import { config } from '@/shared/config';
import { useAction, useLiveQuery } from '@/shared/hooks';
import { dayLabel, fmtMin, formatCOP } from '@/shared/kernel/time';
import { STATUS_LABEL } from '@/modules/booking';
import { computeStats, type MonthStat } from '../stats';
import { clearToken, getToken } from '@/app/auth';
import { onStoreChange } from '@/shared/kernel/collection';
import { clearCustomerSession, getCustomerSession, setCustomerSession } from './session';

/** /cuenta — acceso de clientes y panel con su historial y estadísticas. */
export function AccountPage() {
  const [id, setId] = useState(() => (getToken('customer') ? getCustomerSession() : undefined));
  // Si el servidor dice que la sesión venció, se vuelve al login.
  useEffect(() => onStoreChange(() => !getToken('customer') && setId(undefined)), []);
  const me = useLiveQuery(() => (id ? container.customers.get(id) : Promise.resolve(undefined)), [id]);

  if (!id) return <AuthForm onLogged={(cid) => { setCustomerSession(cid); setId(cid); }} />;
  if (!me) return <main className="page narrow"><p className="muted">Cargando…</p></main>;
  return <Dashboard id={id} name={me.name} since={me.createdAt} onLogout={() => { clearCustomerSession(); clearToken('customer'); setId(undefined); }} />;
}

function AuthForm({ onLogged }: { onLogged: (id: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', phone: '', pin: '' });
  const { busy, error, run, setError } = useAction();

  const submit = () =>
    run(async () => {
      const c = mode === 'register' ? await container.auth.customerRegister(form) : await container.auth.customerLogin(form.phone, form.pin);
      onLogged(c.id);
    });

  return (
    <main className="page narrow">
      <Link to="/" className="muted back">← Inicio</Link>
      <p className="eyebrow gold">Mi cuenta</p>
      <h1 className="display h2">{mode === 'login' ? 'Entra a tu cuenta.' : 'Crea tu cuenta.'}</h1>
      <p className="muted">Consulta tus citas, lo que has pagado, tus cortes por mes y tus promociones.</p>
      <nav className="tabs">
        <button className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setError(undefined); }}>Entrar</button>
        <button className={mode === 'register' ? 'on' : ''} onClick={() => { setMode('register'); setError(undefined); }}>Crear cuenta</button>
      </nav>
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {mode === 'register' && (
          <label>Nombre
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
          </label>
        )}
        <label>WhatsApp
          <input required inputMode="tel" placeholder="300 123 4567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
        </label>
        <label>PIN {mode === 'register' && '(4 a 8 dígitos)'}
          <input required type="password" inputMode="numeric" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </label>
        {mode === 'register' && <p className="muted small-text">Usa el mismo WhatsApp con el que reservas: así verás tus citas anteriores y las nuevas.</p>}
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy}>{mode === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
      </form>
    </main>
  );
}

function Dashboard({ id, name, since, onLogout }: { id: string; name: string; since: string; onLogout: () => void }) {
  const data = useLiveQuery(async () => {
    const [appointments, services, promos] = await Promise.all([
      container.booking.listByPhone(id),
      container.catalog.services(),
      container.promotions.listActive(),
    ]);
    const stats = computeStats({
      appointments,
      cutServiceIds: new Set(services.filter((s) => s.category === 'Corte').map((s) => s.id)),
      now: container.clock.now(),
      cutsForReward: config.loyalty.cutsForReward,
    });
    return { appointments, stats, promos };
  }, [id], 15000);

  if (!data) return <main className="page"><p className="muted">Cargando tus datos…</p></main>;
  const { appointments, stats, promos } = data;
  const { loyalty } = stats;

  return (
    <main className="page">
      <div className="admin-head">
        <div>
          <p className="eyebrow gold">Mi cuenta</p>
          <h1 className="display h2">Hola, {name.split(' ')[0]}.</h1>
          <p className="muted">
            Cliente desde {dayLabel((stats.firstVisit ?? since).slice(0, 10), { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="row">
          <Link className="btn" to="/reservar">Reservar cita</Link>
          <button className="btn ghost" onClick={onLogout}>Salir</button>
        </div>
      </div>

      {stats.pendingRating && (
        <div className="card alert">
          <strong className="gold">Te falta calificar tu último servicio.</strong>
          <p className="muted">{stats.pendingRating.serviceName} con {stats.pendingRating.barberName}. Es necesario para reservar de nuevo.</p>
          <Link className="btn small" to={`/calificar/${stats.pendingRating.token}`}>Calificar ahora</Link>
        </div>
      )}

      <section className="stat-grid">
        <Stat label="Servicios atendidos" value={String(stats.totalServices)} />
        <Stat label="Cortes" value={String(stats.totalCuts)} />
        <Stat label="Total pagado" value={formatCOP(stats.totalPaidCOP)} />
        <Stat label="Promedio por visita" value={stats.totalServices ? formatCOP(stats.averageTicketCOP) : '—'} />
      </section>

      <div className="two-col">
        <section className="card">
          <h2 className="eyebrow gold">Este mes</h2>
          <p className="big">{stats.thisMonth.cuts} {stats.thisMonth.cuts === 1 ? 'corte' : 'cortes'}</p>
          <p className="muted">{stats.thisMonth.services} servicios · {formatCOP(stats.thisMonth.paidCOP)} pagados</p>
          <h2 className="eyebrow gold">Últimos 6 meses</h2>
          <MonthBars months={stats.monthly} />
        </section>

        <section className="card">
          <h2 className="eyebrow gold">Programa de fidelidad</h2>
          <p><strong>{loyalty.cutsInCycle} de {loyalty.cutsForReward}</strong> cortes hacia «{config.loyalty.reward}»</p>
          <div className="progress" role="progressbar" aria-valuenow={loyalty.cutsInCycle} aria-valuemax={loyalty.cutsForReward}>
            <div style={{ width: `${(loyalty.cutsInCycle / loyalty.cutsForReward) * 100}%` }} />
          </div>
          <p className="muted">
            Te {loyalty.remaining === 1 ? 'falta 1 corte' : `faltan ${loyalty.remaining} cortes`}.
            {loyalty.rewardsEarned > 0 && ` Recompensas ganadas hasta hoy: ${loyalty.rewardsEarned} (pídela en el local).`}
          </p>
          <h2 className="eyebrow gold">Tus favoritos</h2>
          <p className="muted">
            Barbero: <strong className="fg">{stats.favoriteBarber ? `${stats.favoriteBarber.name} (${stats.favoriteBarber.count})` : '—'}</strong>
            <br />
            Servicio: <strong className="fg">{stats.favoriteService ? `${stats.favoriteService.name} (${stats.favoriteService.count})` : '—'}</strong>
          </p>
          {(stats.cancelled > 0 || stats.noShows > 0) && (
            <p className="mono muted small-text">{stats.cancelled} canceladas · {stats.noShows} sin asistir</p>
          )}
        </section>
      </div>

      <section>
        <h2 className="eyebrow gold">Promociones para ti</h2>
        {promos?.length === 0 && <p className="muted">No hay promociones activas por ahora.</p>}
        <div className="grid3">
          {promos?.map((p) => (
            <article key={p.id} className="card">
              <strong>{p.title}</strong>
              <p className="muted">{p.description}</p>
              {p.validUntil && <p className="mono muted small-text">Hasta {dayLabel(p.validUntil, { day: 'numeric', month: 'long' })}</p>}
            </article>
          ))}
        </div>
      </section>

      {stats.upcoming && (
        <section>
          <h2 className="eyebrow gold">Tu próxima cita</h2>
          <Link className="card next" to={`/cita/${stats.upcoming.token}`}>
            <strong>{dayLabel(stats.upcoming.date)} · {fmtMin(stats.upcoming.startMin)}</strong>
            <span className="muted">{stats.upcoming.serviceName} con {stats.upcoming.barberName} · {STATUS_LABEL[stats.upcoming.status]}</span>
            <span className="mono gold">Ver detalle / cancelar →</span>
          </Link>
        </section>
      )}

      <section>
        <h2 className="eyebrow gold">Historial de citas</h2>
        {appointments.length === 0 && <p className="muted">Aún no tienes citas con este WhatsApp.</p>}
        <ul className="agenda">
          {appointments.map((a) => (
            <li key={a.id} className={`appt ${a.status}`}>
              <div className="time mono">{dayLabel(a.date, { day: 'numeric', month: 'short', year: 'numeric' })}<span className="muted"> {fmtMin(a.startMin)}</span></div>
              <div className="who">
                <strong>{a.serviceName}</strong>
                <span className="muted">{a.barberName}{a.status === 'completed' && ` · Pagado ${formatCOP(a.paidCOP ?? a.priceCOP)}`}</span>
              </div>
              <span className={`badge ${a.status}`}>{STATUS_LABEL[a.status]}</span>
              <div className="actions">
                {a.status === 'completed' && !a.reviewedAt && <Link className="btn small" to={`/calificar/${a.token}`}>Calificar</Link>}
                {(a.status === 'booked' || a.status === 'confirmed') && <Link className="btn ghost small" to={`/cita/${a.token}`}>Ver</Link>}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card stat">
      <span className="eyebrow">{label}</span>
      <strong className="big">{value}</strong>
    </div>
  );
}

function MonthBars({ months }: { months: MonthStat[] }) {
  const max = Math.max(1, ...months.map((m) => m.services));
  return (
    <div className="bars" role="img" aria-label="Servicios atendidos por mes">
      {months.map((m) => (
        <div key={m.key} className="bar-col" title={`${m.services} servicios · ${formatCOP(m.paidCOP)}`}>
          <span className="mono">{m.services}</span>
          <div className="bar" style={{ height: `${(m.services / max) * 100}%` }} />
          <span className="mono muted">{m.label}</span>
          <span className="mono muted tiny">{m.paidCOP ? formatCOP(m.paidCOP).replace('COP', '').trim() : '—'}</span>
        </div>
      ))}
    </div>
  );
}
