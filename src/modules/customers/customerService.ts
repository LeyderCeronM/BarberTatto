import type { Collection, Entity } from '@/shared/kernel/collection';
import { hashPin, verifyPin } from '@/shared/kernel/pin';
import { normalizePhone, type Clock } from '@/shared/kernel/time';

/** Cuenta de cliente. id = WhatsApp normalizado, así sus citas se enlazan por teléfono. */
export interface CustomerAccount extends Entity {
  name: string;
  pin: string;
  createdAt: string;
}

export type PublicCustomer = Omit<CustomerAccount, 'pin'>;

const strip = ({ pin: _pin, ...rest }: CustomerAccount): PublicCustomer => rest;

/**
 * El PIN se guarda con hash. Pendiente: el teléfono no se verifica por WhatsApp, así que quien
 * conozca el número de otra persona podría crearle la cuenta antes que ella (verificación por OTP).
 */
export class CustomerService {
  constructor(
    private readonly accounts: Collection<CustomerAccount>,
    private readonly clock: Clock,
  ) {}

  async register(input: { name: string; phone: string; pin: string }): Promise<PublicCustomer> {
    const name = input.name.trim();
    const id = normalizePhone(input.phone);
    if (name.length < 2) throw new Error('Escribe tu nombre');
    if (id.length < 10) throw new Error('Escribe un WhatsApp válido');
    if (!/^\d{4,8}$/.test(input.pin)) throw new Error('El PIN debe tener de 4 a 8 dígitos');
    if (await this.accounts.get(id)) throw new Error('Ya existe una cuenta con ese WhatsApp. Inicia sesión.');
    const account: CustomerAccount = { id, name, pin: await hashPin(input.pin), createdAt: this.clock.now().toISOString() };
    await this.accounts.put(account);
    return strip(account);
  }

  async login(phone: string, pin: string): Promise<PublicCustomer> {
    const account = await this.accounts.get(normalizePhone(phone));
    // Mismo mensaje para "no existe" y "PIN malo": no revela qué números tienen cuenta.
    if (!account || !(await verifyPin(pin, account.pin))) throw new Error('WhatsApp o PIN incorrectos');
    return strip(account);
  }

  async get(id: string): Promise<PublicCustomer | undefined> {
    const a = await this.accounts.get(id);
    return a && strip(a);
  }
}
