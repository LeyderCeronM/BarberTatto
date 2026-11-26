import { useState } from 'react';
import { container } from '@/app/container';
import { useAction, useLiveQuery } from '@/shared/hooks';
import { toISODate } from '@/shared/kernel/time';
import type { Barber } from '@/modules/catalog';

const EMPTY = { name: '', role: '', bio: '', photo: '' };

/** Alta, edición y baja de las personas que atienden. */
export function TeamTab() {
  const barbers = useLiveQuery(() => container.catalog.barbers(), []);
  const [editing, setEditing] = useState<Barber>();
  const [form, setForm] = useState(EMPTY);
  const [openHours, setOpenHours] = useState(true);
  const { busy, error, run, setError } = useAction();

  const startEdit = (b: Barber) => {
    setEditing(b);
    setForm({ name: b.name, role: b.role, bio: b.bio, photo: b.photo ?? '' });
    setError(undefined);
  };
  const reset = () => {
    setEditing(undefined);
    setForm(EMPTY);
  };

  const submit = () =>
    run(async () => {
      if (editing) {
        await container.catalog.updateBarber({ ...editing, ...form });
      } else {
        const b = await container.catalog.addBarber(form);
        // Un barbero nuevo no tiene franjas abiertas: opcionalmente se le aplica el horario base.
        if (openHours) await container.scheduling.openBusinessHours(b.id, toISODate(container.clock.now()), 14);
      }
      reset();
    });

  const remove = (b: Barber) =>
    run(async () => {
      const upcoming = (await container.booking.listActiveUpcoming()).filter((a) => a.barberId === b.id);
      if (upcoming.length > 0) {
        throw new Error(
          `${b.name} tiene ${upcoming.length} cita(s) activa(s). Cancélalas o márcalas como atendidas desde la Agenda antes de eliminarlo.`,
        );
      }
      if (!confirm(`¿Eliminar a ${b.name}? Dejará de aparecer para los clientes y se borrarán sus franjas de disponibilidad.`)) return;
      await container.catalog.removeBarber(b.id);
      await container.scheduling.clearBarber(b.id);
      await container.access.remove(b.id);
      if (editing?.id === b.id) reset();
    });

  return (
    <>
      <p className="muted">Agrega o elimina a quienes atienden. Los clientes solo podrán elegir a las personas de esta lista.</p>

      {error && <p className="error">{error}</p>}
      {barbers?.length === 0 && <p className="muted">No hay nadie en el equipo: los clientes no podrán reservar hasta que agregues a alguien.</p>}
      <ul className="agenda">
        {barbers?.map((b) => (
          <li key={b.id} className="appt team">
            <div>{b.photo ? <img src={b.photo} alt="" className="avatar sm" /> : <div className="avatar sm ph" />}</div>
            <div className="who">
              <strong>{b.name}</strong>
              <span className="eyebrow gold">{b.role}</span>
              <span className="muted">{b.bio}</span>
              <PinRow barberId={b.id} />
            </div>
            <span />
            <div className="actions">
              <button className="btn ghost small" disabled={busy} onClick={() => startEdit(b)}>Editar</button>
              <button className="btn ghost small danger" disabled={busy} onClick={() => remove(b)}>Eliminar</button>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="eyebrow gold">{editing ? `Editando a ${editing.name}` : 'Agregar persona'}</h2>
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label>Nombre
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>Cargo / especialidad
          <input placeholder="Barbero · Fades y máquina" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
        </label>
        <label>Descripción
          <textarea rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
        </label>
        <label>URL de la foto (opcional)
          <input type="url" placeholder="https://…" value={form.photo} onChange={(e) => setForm({ ...form, photo: e.target.value })} />
        </label>
        {!editing && (
          <label className="check">
            <input type="checkbox" checked={openHours} onChange={(e) => setOpenHours(e.target.checked)} />
            Abrir el horario base de los próximos 14 días
          </label>
        )}
        <div className="row">
          <button className="btn" disabled={busy}>{editing ? 'Guardar cambios' : 'Agregar al equipo'}</button>
          {editing && <button type="button" className="btn ghost" onClick={reset}>Cancelar</button>}
        </div>
      </form>
    </>
  );
}

/** Asigna o cambia el PIN con el que el barbero entra a /barbero a definir su horario. */
function PinRow({ barberId }: { barberId: string }) {
  const [pin, setPin] = useState('');
  const has = useLiveQuery(() => container.access.hasPin(barberId), [barberId]);
  const { busy, error, run } = useAction();
  return (
    <span className="pin-row">
      <input type="text" inputMode="numeric" placeholder={has ? 'Nuevo PIN' : 'PIN de acceso (4-8 dígitos)'} value={pin} onChange={(e) => setPin(e.target.value)} />
      <button type="button" className="btn ghost small" disabled={busy || !pin} onClick={() => run(async () => { await container.access.setPin(barberId, pin); setPin(''); })}>
        {has ? 'Cambiar PIN' : 'Asignar PIN'}
      </button>
      {has && <span className="mono muted">PIN asignado</span>}
      {error && <span className="error">{error}</span>}
    </span>
  );
}
