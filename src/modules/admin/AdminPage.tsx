import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { container } from '@/app/container';
import { clearToken, getToken } from '@/app/auth';
import { onStoreChange } from '@/shared/kernel/collection';
import { useAction } from '@/shared/hooks';
import { AgendaTab } from './AgendaTab';
import { AvailabilityTab } from './AvailabilityTab';
import { OutboxTab } from './OutboxTab';
import { TeamTab } from './TeamTab';
import { ReviewsTab } from './ReviewsTab';
import { PromotionsTab } from './PromotionsTab';

const isLogged = () => !!getToken('admin');

export function AdminPage() {
  const [logged, setLogged] = useState(isLogged);
  const [pin, setPin] = useState('');
  const { busy, error, run } = useAction();
  const [tab, setTab] = useState<'agenda' | 'disp' | 'team' | 'promos' | 'reviews' | 'msgs'>('agenda');

  // Planificador de recordatorios: mientras el panel esté abierto, revisa cada 15 s.
  useEffect(() => {
    if (!logged) return;
    const tick = () => container.notifications.runReminderTick().catch(() => undefined);
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, [logged]);

  // Si el servidor dice que la sesión venció, se limpia el token y se vuelve al login.
  useEffect(() => onStoreChange(() => setLogged(isLogged())), []);

  if (!logged) {
    return (
      <main className="page narrow">
        <h1 className="display h2">Panel admin</h1>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await container.auth.adminLogin(pin);
              setPin('');
              setLogged(true);
            });
          }}
        >
          <label>PIN
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn" disabled={busy}>Entrar</button>
        </form>
        <Link to="/" className="muted">← Inicio</Link>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="admin-head">
        <h1 className="display h2">Panel admin</h1>
        <div className="row">
          <Link to="/" className="muted">Ver sitio</Link>
          <button className="link" onClick={() => { clearToken('admin'); setLogged(false); }}>Salir</button>
        </div>
      </div>
      <nav className="tabs">
        <button className={tab === 'agenda' ? 'on' : ''} onClick={() => setTab('agenda')}>Agenda</button>
        <button className={tab === 'disp' ? 'on' : ''} onClick={() => setTab('disp')}>Disponibilidad</button>
        <button className={tab === 'team' ? 'on' : ''} onClick={() => setTab('team')}>Equipo</button>
        <button className={tab === 'promos' ? 'on' : ''} onClick={() => setTab('promos')}>Promociones</button>
        <button className={tab === 'reviews' ? 'on' : ''} onClick={() => setTab('reviews')}>Calificaciones</button>
        <button className={tab === 'msgs' ? 'on' : ''} onClick={() => setTab('msgs')}>Mensajes WhatsApp</button>
      </nav>
      {tab === 'agenda' && <AgendaTab />}
      {tab === 'disp' && <AvailabilityTab />}
      {tab === 'team' && <TeamTab />}
      {tab === 'promos' && <PromotionsTab />}
      {tab === 'reviews' && <ReviewsTab />}
      {tab === 'msgs' && <OutboxTab />}
    </main>
  );
}
