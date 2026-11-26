import { useCallback, useEffect, useState } from 'react';
import { onStoreChange } from '@/shared/kernel/collection';

/** Ejecuta una consulta async y la repite cuando cambia el almacén (también desde otras pestañas). */
export function useLiveQuery<T>(query: () => Promise<T>, deps: unknown[], pollMs?: number): T | undefined {
  const [data, setData] = useState<T>();
  const [tick, setTick] = useState(0);

  useEffect(() => onStoreChange(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    if (!pollMs) return;
    const id = setInterval(() => setTick((n) => n + 1), pollMs);
    return () => clearInterval(id);
  }, [pollMs]);

  useEffect(() => {
    let alive = true;
    query()
      .then((r) => alive && setData(r))
      .catch((e) => console.error('[consulta]', e));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return data;
}

/** Envuelve una acción async con estado de "ocupado" y error. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = useCallback(async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
    setBusy(true);
    setError(undefined);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo salió mal');
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}
