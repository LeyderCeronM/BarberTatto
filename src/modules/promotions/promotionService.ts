import type { Collection, Entity } from '@/shared/kernel/collection';
import { newId } from '@/shared/kernel/ids';
import { toISODate, type Clock } from '@/shared/kernel/time';

export interface Promotion extends Entity {
  title: string;
  description: string;
  /** Último día de vigencia (YYYY-MM-DD). Vacío = sin vencimiento. */
  validUntil?: string;
  active: boolean;
  createdAt: string;
}

export type PromotionInput = Pick<Promotion, 'title' | 'description' | 'validUntil'>;

/** Promociones que el admin publica; los clientes con cuenta las ven en su panel. */
export class PromotionService {
  constructor(
    private readonly promos: Collection<Promotion>,
    private readonly clock: Clock,
  ) {}

  async list(): Promise<Promotion[]> {
    return (await this.promos.all()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Activas y no vencidas a hoy. */
  async listActive(): Promise<Promotion[]> {
    const today = toISODate(this.clock.now());
    return (await this.list()).filter((p) => p.active && (!p.validUntil || p.validUntil >= today));
  }

  async add(input: PromotionInput): Promise<Promotion> {
    const title = input.title.trim();
    if (title.length < 3) throw new Error('Escribe el título de la promoción');
    const promo: Promotion = {
      id: newId(),
      title,
      description: input.description.trim(),
      validUntil: input.validUntil || undefined,
      active: true,
      createdAt: this.clock.now().toISOString(),
    };
    await this.promos.put(promo);
    return promo;
  }

  async setActive(id: string, active: boolean) {
    const p = await this.promos.get(id);
    if (p) await this.promos.put({ ...p, active });
  }

  remove = (id: string) => this.promos.remove(id);
}
