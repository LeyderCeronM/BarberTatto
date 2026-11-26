import type { Collection, Entity } from '@/shared/kernel/collection';
import { hashPin, verifyPin } from '@/shared/kernel/pin';

/** Credencial de un barbero para entrar a su propio panel. id = barberId. `pin` es un hash. */
export interface BarberCredential extends Entity {
  pin: string;
}

export class BarberAccess {
  constructor(private readonly creds: Collection<BarberCredential>) {}

  async setPin(barberId: string, pin: string) {
    if (!/^\d{4,8}$/.test(pin)) throw new Error('El PIN debe tener de 4 a 8 dígitos');
    await this.creds.put({ id: barberId, pin: await hashPin(pin) });
  }
  async hasPin(barberId: string) {
    return !!(await this.creds.get(barberId));
  }
  async verify(barberId: string, pin: string) {
    const c = await this.creds.get(barberId);
    return !!c && (await verifyPin(pin, c.pin));
  }
  remove = (barberId: string) => this.creds.remove(barberId);
}
