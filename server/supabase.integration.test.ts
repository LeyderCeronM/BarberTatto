/**
 * Prueba contra una base REAL (Postgres + PostgREST, local o Supabase). Se omite si no hay variables:
 *   SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_KEY, SUPABASE_TEST_ANON_KEY
 * Local:  docker compose --profile db up -d postgres postgrest   (ver README)
 * ¡Cuidado!: borra los documentos de las colecciones "it-*" que crea; no toca las demás.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { ConflictError, SupabaseCollection } from './supabase';

const url = process.env.SUPABASE_TEST_URL;
const service = process.env.SUPABASE_TEST_SERVICE_KEY;
const anon = process.env.SUPABASE_TEST_ANON_KEY;

describe.skipIf(!url || !service || !anon)('SupabaseCollection contra una base real', () => {
  const cfg = { url: url!, key: service! };
  const names = ['it-docs', 'it-big'];
  const docs = new SupabaseCollection<{ id: string; n: number; tags?: string[] }>(cfg, 'it-docs');

  afterAll(async () => {
    for (const name of [...names, 'appointments']) {
      await fetch(`${url}/rest/v1/documents?collection=eq.${name}&id=like.it-*`, {
        method: 'DELETE',
        headers: { apikey: service!, Authorization: `Bearer ${service}` },
      });
    }
  });

  it('put / get / all / remove', async () => {
    await docs.put({ id: 'it-a', n: 1 });
    await docs.put({ id: 'it-b', n: 2, tags: ['ñ', 'á'] });
    expect(await docs.get('it-a')).toEqual({ id: 'it-a', n: 1 });
    expect((await docs.get('it-b'))?.tags).toEqual(['ñ', 'á']);
    expect(await docs.get('no-existe')).toBeUndefined();
    expect((await docs.all()).map((d) => d.id).sort()).toEqual(['it-a', 'it-b']);
    await docs.remove('it-a');
    expect(await docs.get('it-a')).toBeUndefined();
  });

  it('put sobre un id existente actualiza (upsert), no duplica', async () => {
    await docs.put({ id: 'it-b', n: 99 });
    const all = await docs.all();
    expect(all.filter((d) => d.id === 'it-b')).toEqual([{ id: 'it-b', n: 99 }]);
  });

  it('ids con caracteres raros se escapan bien', async () => {
    const id = 'it-a b/c?d&e=f';
    await docs.put({ id, n: 7 });
    expect(await docs.get(id)).toEqual({ id, n: 7 });
    await docs.remove(id);
    expect(await docs.get(id)).toBeUndefined();
  });

  it('all() pagina: devuelve más de 1000 documentos', async () => {
    const big = new SupabaseCollection<{ id: string }>(cfg, 'it-big');
    const rows = Array.from({ length: 1105 }, (_, i) => ({ collection: 'it-big', id: `it-${String(i).padStart(4, '0')}`, data: { id: `it-${i}` } }));
    for (let i = 0; i < rows.length; i += 500) {
      const res = await fetch(`${url}/rest/v1/documents`, {
        method: 'POST',
        headers: { apikey: service!, Authorization: `Bearer ${service}`, 'content-type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(rows.slice(i, i + 500)),
      });
      expect(res.ok).toBe(true);
    }
    expect(await big.all()).toHaveLength(1105);
  });

  it('el índice único impide dos citas ACTIVAS a la misma hora (aunque lleguen a la vez)', async () => {
    const appts = new SupabaseCollection<{ id: string; barberId: string; date: string; startMin: number; status: string }>(cfg, 'appointments');
    const base = { barberId: 'it-barber', date: '2099-01-01', startMin: 600 };
    const results = await Promise.allSettled([
      appts.put({ id: 'it-1', ...base, status: 'booked' }),
      appts.put({ id: 'it-2', ...base, status: 'booked' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictError);

    // Una cancelada no bloquea el horario
    const winner = (await appts.get('it-1')) ? 'it-1' : 'it-2';
    await appts.put({ id: winner, ...base, status: 'cancelled' });
    await expect(appts.put({ id: 'it-3', ...base, status: 'booked' })).resolves.toBeUndefined();
  });

  it('SEGURIDAD: la clave pública (anon) no puede leer ni escribir nada', async () => {
    await docs.put({ id: 'it-secret', n: 1 });
    const headers = { apikey: anon!, Authorization: `Bearer ${anon}`, 'content-type': 'application/json' };
    const read = await fetch(`${url}/rest/v1/documents?select=*`, { headers });
    const body = await read.text();
    expect(read.ok ? JSON.parse(body) : []).toEqual([]);
    expect(read.status).not.toBe(200); // sin permiso de lectura
    const write = await fetch(`${url}/rest/v1/documents`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ collection: 'it-docs', id: 'it-hack', data: { id: 'it-hack' } }),
    });
    expect(write.ok).toBe(false);
    expect(await docs.get('it-hack')).toBeUndefined();
  });
});
