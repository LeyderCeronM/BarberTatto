import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { container } from '@/app/container';
import { clearToken, getToken } from '@/app/auth';
import { onStoreChange } from '@/shared/kernel/collection';
import { useAction, useLiveQuery } from '@/shared/hooks';
import { AgendaTab } from './AgendaTab';
import { AvailabilityTab } from './AvailabilityTab';

const KEY = 'bt:barber';

/** Panel propio del barbero: ve su agenda y define su horario. No ve a los demás ni el equipo. */
export function BarberPage() {
  const [barberId, setBarberId] = useState(() => (getToken('barber') ? (sessionStorage.getItem(KEY) ?? '') : ''));
  const [choice, setChoice] = useState('');
  const [pin, setPin] = useState('');
  const [tab, setTab] = useState<'horario' | 'agenda'>('horario');
  const { busy, error, run, setError } = useAction();

  // Si el servidor dice que la sesión venció, se vuelve al login.
  useEffect(() => onStoreChange(() => !getToken('barber') && setBarberId('')), []);

  const barbers = useLiveQuery(() => container.catalog.barbers(), []);
  const me = barbers?.find((b) => b.id === barberId);

  if (barbers && barberId && !me) {
    // El barbero fue eliminado mientras tenía sesión abierta.
    sessionStorage.removeItem(KEY);
    setBarberId('');
  }

  if (!me) {
    const selected = choice || barbers?.[0]?.id || '';
    return (
      <main className="page narrow">
        <h1 className="display h2">Acceso barberos</h1>
        <p className="muted">Entra con el PIN que te dio el administrador para definir tu horario.</p>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await container.auth.barberLogin(selected, pin);
              sessionStorage.setItem(KEY, selected);
              setBarberId(selected);
              setPin('');
            });
          }}
        >
          <label>Quién eres
            <select value={selected} onChange={(e) => { setChoice(e.target.value); setError(undefined); }}>
              {barbers?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label>PIN
            <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn" disabled={busy || !selected}>Entrar</button>
        </form>
        <Link to="/" className="muted">← Inicio</Link>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="admin-head">
        <h1 className="display h2">Hola, {me.name.split(' ')[0]}</h1>
        <div className="row">
          <Link to="/" className="muted">Ver sitio</Link>
          <button className="link" onClick={() => { sessionStorage.removeItem(KEY); clearToken('barber'); setBarberId(''); }}>Salir</button>
        </div>
      </div>
      <nav className="tabs">
        <button className={tab === 'horario' ? 'on' : ''} onClick={() => setTab('horario')}>Mi horario</button>
        <button className={tab === 'agenda' ? 'on' : ''} onClick={() => setTab('agenda')}>Mi agenda</button>
      </nav>
      {tab === 'horario' && <AvailabilityTab lockedBarberId={me.id} />}
      {tab === 'agenda' && <AgendaTab lockedBarberId={me.id} />}
    </main>
  );
}
