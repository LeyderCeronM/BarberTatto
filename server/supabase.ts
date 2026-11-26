import type { Collection, Entity } from '../src/shared/kernel/collection';

/** Error de dominio que se puede mostrar tal cual al usuario. */
export class ConflictError extends Error {}

/** Fallo de infraestructura (red, permisos, base caída): no se muestra el detalle al usuario. */
export class InfraError extends Error {}

export interface SupabaseConfig {
  /** https://<proyecto>.supabase.co */
  url: string;
  /** service_role key: SOLO en el servidor, da acceso total saltándose RLS. */
  key: string;
}

const PAGE = 1000;

/**
 * Implementa `Collection<T>` sobre la tabla `documents` de Supabase (PostgREST):
 * cada entidad es una fila (collection, id, data jsonb). Ver supabase/schema.sql.
 */
export class SupabaseCollection<T extends Entity> implements Collection<T> {
  constructor(
    private readonly cfg: SupabaseConfig,
    private readonly name: string,
  ) {}

  private get endpoint() {
    return `${this.cfg.url.replace(/\/$/, '')}/rest/v1/documents`;
  }

  private headers(extra: Record<string, string> = {}) {
    return { apikey: this.cfg.key, Authorization: `Bearer ${this.cfg.key}`, 'content-type': 'application/json', ...extra };
  }

  private async fail(res: Response, action: string): Promise<never> {
    const text = await res.text().catch(() => '');
    // 23505 = unique_violation: el índice que impide dos citas activas en la misma hora.
    if (res.status === 409 && text.includes('23505')) throw new ConflictError('Ese horario ya no está disponible. Elige otro.');
    throw new InfraError(`Supabase ${action} falló (${res.status}): ${text.slice(0, 200)}`);
  }

  async all(): Promise<T[]> {
    const out: T[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const url = `${this.endpoint}?collection=eq.${encodeURIComponent(this.name)}&select=data&order=created_at,id&limit=${PAGE}&offset=${offset}`;
      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) await this.fail(res, 'leer');
      const rows = (await res.json()) as { data: T }[];
      out.push(...rows.map((r) => r.data));
      if (rows.length < PAGE) return out;
    }
  }

  async get(id: string): Promise<T | undefined> {
    const url = `${this.endpoint}?collection=eq.${encodeURIComponent(this.name)}&id=eq.${encodeURIComponent(id)}&select=data&limit=1`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) await this.fail(res, 'leer');
    const rows = (await res.json()) as { data: T }[];
    return rows[0]?.data;
  }

  async put(item: T): Promise<void> {
    const res = await fetch(`${this.endpoint}?on_conflict=collection,id`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ collection: this.name, id: item.id, data: item }),
    });
    if (!res.ok) await this.fail(res, 'guardar');
  }

  async remove(id: string): Promise<void> {
    const url = `${this.endpoint}?collection=eq.${encodeURIComponent(this.name)}&id=eq.${encodeURIComponent(id)}`;
    const res = await fetch(url, { method: 'DELETE', headers: this.headers() });
    if (!res.ok) await this.fail(res, 'borrar');
  }
}
