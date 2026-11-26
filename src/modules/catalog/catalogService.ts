import { newId } from '@/shared/kernel/ids';
import type { Barber, CatalogRepository, NewBarber, Service } from './domain';

export class CatalogService {
  constructor(private readonly repo: CatalogRepository) {}

  services = () => this.repo.services();
  barbers = () => this.repo.barbers();

  async getService(id: string): Promise<Service | undefined> {
    return (await this.repo.services()).find((s) => s.id === id);
  }
  async getBarber(id: string): Promise<Barber | undefined> {
    return (await this.repo.barbers()).find((b) => b.id === id);
  }

  async addBarber(input: NewBarber): Promise<Barber> {
    const barber = this.clean({ ...input, id: newId() });
    await this.repo.saveBarber(barber);
    return barber;
  }

  async updateBarber(barber: Barber): Promise<void> {
    await this.repo.saveBarber(this.clean(barber));
  }

  /** El módulo admin es quien valida que no tenga citas activas antes de llamar aquí. */
  removeBarber = (id: string) => this.repo.deleteBarber(id);

  private clean(b: Barber): Barber {
    const name = b.name.trim();
    if (name.length < 2) throw new Error('Escribe el nombre');
    return { ...b, name, role: b.role.trim() || 'Barbero', bio: b.bio.trim(), photo: b.photo?.trim() || undefined };
  }
}
