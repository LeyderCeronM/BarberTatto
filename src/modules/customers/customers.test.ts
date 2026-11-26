import { describe, expect, it } from 'vitest';
import { MemoryCollection } from '@/shared/kernel/collection';
import type { Appointment } from '@/modules/booking';
import { CustomerService, computeStats, type CustomerAccount } from './index';

const clock = { now: () => new Date(2030, 5, 15, 12, 0) };

describe('cuentas de cliente', () => {
  const make = () => new CustomerService(new MemoryCollection<CustomerAccount>(), clock);

  it('registra, normaliza el teléfono y permite entrar con el PIN', async () => {
    const s = make();
    const c = await s.register({ name: 'Ana', phone: '300 123 4567', pin: '1234' });
    expect(c.id).toBe('573001234567');
    expect('pin' in c).toBe(false); // el PIN nunca sale del servicio
    await expect(s.login('3001234567', '1234')).resolves.toMatchObject({ name: 'Ana' });
  });

  it('PIN malo o cuenta inexistente dan el mismo error', async () => {
    const s = make();
    await s.register({ name: 'Ana', phone: '3001234567', pin: '1234' });
    await expect(s.login('3001234567', '9999')).rejects.toThrow('WhatsApp o PIN incorrectos');
    await expect(s.login('3109999999', '1234')).rejects.toThrow('WhatsApp o PIN incorrectos');
  });

  it('no permite duplicar cuenta ni PIN inválido', async () => {
    const s = make();
    await s.register({ name: 'Ana', phone: '3001234567', pin: '1234' });
    await expect(s.register({ name: 'Otra', phone: '300-123-4567', pin: '4321' })).rejects.toThrow(/Ya existe/);
    await expect(s.register({ name: 'Beto', phone: '3109999999', pin: '12' })).rejects.toThrow(/PIN/);
  });
});

let n = 0;
const appt = (p: Partial<Appointment>): Appointment => ({
  id: `a${n++}`,
  token: `t${n}`,
  serviceId: 'corte',
  serviceName: 'Corte de cabello',
  barberId: 'mateo',
  barberName: 'Mateo Ríos',
  durationMin: 40,
  priceCOP: 22000,
  date: '2030-06-10',
  startMin: 600,
  customerName: 'Ana',
  customerPhone: '573001234567',
  status: 'completed',
  createdAt: '2030-06-01T00:00:00.000Z',
  ...p,
});
const cut = new Set(['corte', 'corte-barba']);

describe('estadísticas del cliente', () => {
  it('sin citas todo es cero y la fidelidad parte de 0', () => {
    const s = computeStats({ appointments: [], cutServiceIds: cut, now: clock.now(), cutsForReward: 10 });
    expect(s).toMatchObject({ totalServices: 0, totalCuts: 0, totalPaidCOP: 0, averageTicketCOP: 0 });
    expect(s.loyalty).toEqual({ cutsForReward: 10, cutsInCycle: 0, remaining: 10, rewardsEarned: 0 });
    expect(s.monthly).toHaveLength(6);
  });

  it('suma lo realmente pagado (no el precio de lista) y separa cortes de otros servicios', () => {
    const s = computeStats({
      cutsForReward: 10,
      cutServiceIds: cut,
      now: clock.now(),
      appointments: [
        appt({ date: '2030-06-10', paidCOP: 20000 }), // descuento
        appt({ date: '2030-06-02', serviceId: 'barba', serviceName: 'Barba perfilada', priceCOP: 10000, paidCOP: 10000 }),
        appt({ date: '2030-05-20', serviceId: 'color', serviceName: 'Colorimetría', priceCOP: null, paidCOP: 80000 }),
        appt({ date: '2030-06-12', status: 'cancelled', paidCOP: undefined }),
        appt({ date: '2030-06-13', status: 'no_show' }),
      ],
    });
    expect(s.totalServices).toBe(3);
    expect(s.totalCuts).toBe(1);
    expect(s.totalPaidCOP).toBe(110000);
    expect(s.averageTicketCOP).toBe(36667);
    expect(s.thisMonth).toMatchObject({ key: '2030-06', services: 2, cuts: 1, paidCOP: 30000 });
    expect(s.monthly[4]).toMatchObject({ key: '2030-05', services: 1, cuts: 0, paidCOP: 80000 });
    expect(s).toMatchObject({ cancelled: 1, noShows: 1, firstVisit: '2030-05-20' });
  });

  it('fidelidad: cada N cortes gana recompensa y reinicia el ciclo', () => {
    const appointments = Array.from({ length: 12 }, (_, i) => appt({ date: `2030-0${(i % 5) + 1}-10` }));
    const { loyalty } = computeStats({ appointments, cutServiceIds: cut, now: clock.now(), cutsForReward: 10 });
    expect(loyalty).toEqual({ cutsForReward: 10, cutsInCycle: 2, remaining: 8, rewardsEarned: 1 });
  });

  it('favoritos, próxima cita y calificación pendiente', () => {
    const s = computeStats({
      cutsForReward: 10,
      cutServiceIds: cut,
      now: clock.now(),
      appointments: [
        appt({ barberName: 'Julián', reviewedAt: 'x' }),
        appt({ barberName: 'Julián', reviewedAt: 'x' }),
        appt({ barberName: 'Mateo Ríos' }), // sin calificar
        appt({ status: 'confirmed', date: '2030-06-20', startMin: 900 }),
        appt({ status: 'booked', date: '2030-06-18', startMin: 600 }),
      ],
    });
    expect(s.favoriteBarber).toEqual({ name: 'Julián', count: 2 });
    expect(s.upcoming?.date).toBe('2030-06-18');
    expect(s.pendingRating?.barberName).toBe('Mateo Ríos');
  });
});
