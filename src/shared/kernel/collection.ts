export interface Entity {
  id: string;
}

/**
 * Puerto de persistencia. Es asíncrono a propósito: hoy hay adaptadores en memoria
 * y localStorage; mañana se puede escribir uno para Supabase/Firebase sin tocar
 * ningún servicio de aplicación.
 */
export interface Collection<T extends Entity> {
  all(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  put(item: T): Promise<void>;
  remove(id: string): Promise<void>;
}

export class MemoryCollection<T extends Entity> implements Collection<T> {
  private items = new Map<string, T>();
  async all() {
    return [...this.items.values()].map((x) => structuredClone(x));
  }
  async get(id: string) {
    const x = this.items.get(id);
    return x ? structuredClone(x) : undefined;
  }
  async put(item: T) {
    this.items.set(item.id, structuredClone(item));
  }
  async remove(id: string) {
    this.items.delete(id);
  }
}

const CHANGED = 'bt:changed';

/** Suscripción a cambios del almacén (misma pestaña y otras pestañas). */
export function onStoreChange(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(CHANGED, cb);
    window.removeEventListener('storage', cb);
  };
}

export class LocalCollection<T extends Entity> implements Collection<T> {
  constructor(private readonly name: string) {}

  private get key() {
    return `bt:${this.name}`;
  }
  private read(): T[] {
    try {
      return JSON.parse(localStorage.getItem(this.key) ?? '[]') as T[];
    } catch {
      return [];
    }
  }
  private write(items: T[]) {
    localStorage.setItem(this.key, JSON.stringify(items));
    window.dispatchEvent(new Event(CHANGED));
  }
  async all() {
    return this.read();
  }
  async get(id: string) {
    return this.read().find((x) => x.id === id);
  }
  async put(item: T) {
    const items = this.read();
    const i = items.findIndex((x) => x.id === item.id);
    if (i >= 0) items[i] = item;
    else items.push(item);
    this.write(items);
  }
  async remove(id: string) {
    this.write(this.read().filter((x) => x.id !== id));
  }
}
