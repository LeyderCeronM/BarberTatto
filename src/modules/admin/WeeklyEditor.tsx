import { useEffect, useState } from 'react';
import { container } from '@/app/container';
import { useAction } from '@/shared/hooks';
import { fmtMin, parseHHMM, toISODate } from '@/shared/kernel/time';
import type { WeeklyDay } from '@/modules/scheduling';

// Orden de pantalla Lun→Dom; el índice es el de Date.getDay() (0 = domingo).
const ROWS = [
  { dow: 1, label: 'Lunes' }, { dow: 2, label: 'Martes' }, { dow: 3, label: 'Miércoles' },
  { dow: 4, label: 'Jueves' }, { dow: 5, label: 'Viernes' }, { dow: 6, label: 'Sábado' }, { dow: 0, label: 'Domingo' },
];

/** Horario semanal que se repite: se guarda una vez y se aplica a las próximas semanas. */
export function WeeklyEditor({ barberId }: { barberId: string }) {
  const [days, setDays] = useState<WeeklyDay[]>();
  const [weeks, setWeeks] = useState(4);
  const [msg, setMsg] = useState<string>();
  const { busy, error, run } = useAction();

  useEffect(() => {
    setDays(undefined);
    setMsg(undefined);
    if (barberId) container.scheduling.getWeekly(barberId).then((w) => setDays(w.days));
  }, [barberId]);

  if (!days) return null;
  const patch = (dow: number, p: Partial<WeeklyDay>) => setDays(days.map((d, i) => (i === dow ? { ...d, ...p } : d)));

  const save = (apply: boolean) =>
    run(async () => {
      await container.scheduling.saveWeekly(barberId, days);
      if (apply) await container.scheduling.applyWeekly(barberId, toISODate(container.clock.now()), weeks * 7);
      setMsg(apply ? `Horario guardado y aplicado a las próximas ${weeks} semanas.` : 'Horario semanal guardado.');
    });

  return (
    <section className="weekly">
      <h2 className="eyebrow gold">Horario semanal</h2>
      <p className="muted">Marca los días que atiende y su horario. Al aplicarlo se abren esas franjas para las próximas semanas (reemplaza lo que hubiera en esas fechas; las citas ya reservadas no se tocan).</p>
      {ROWS.map(({ dow, label }) => {
        const d = days[dow];
        return (
          <div key={dow} className={`wk-row ${d.enabled ? '' : 'off'}`}>
            <label className="check">
              <input type="checkbox" checked={d.enabled} onChange={(e) => patch(dow, { enabled: e.target.checked })} />
              {label}
            </label>
            {d.enabled ? (
              <div className="row">
                <input type="time" step={1200} value={fmtMin(d.startMin)} onChange={(e) => e.target.value && patch(dow, { startMin: parseHHMM(e.target.value) })} />
                <span className="muted">a</span>
                <input type="time" step={1200} value={fmtMin(d.endMin)} onChange={(e) => e.target.value && patch(dow, { endMin: parseHHMM(e.target.value) })} />
              </div>
            ) : (
              <span className="muted">No atiende</span>
            )}
          </div>
        );
      })}
      <div className="toolbar">
        <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
          {[1, 2, 4, 8].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'semana' : 'semanas'}</option>)}
        </select>
        <button className="btn small" disabled={busy} onClick={() => save(true)}>Guardar y aplicar</button>
        <button className="btn ghost small" disabled={busy} onClick={() => save(false)}>Solo guardar</button>
      </div>
      {error && <p className="error">{error}</p>}
      {msg && <p className="ok">{msg}</p>}
    </section>
  );
}
