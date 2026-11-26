import type { Collection } from '@/shared/kernel/collection';
import type { EventBus } from '@/shared/kernel/eventBus';
import type { DomainEvents } from '@/shared/kernel/events';
import { newId, newToken } from '@/shared/kernel/ids';
import { minutesOfDay, normalizePhone, overlaps, toISODate, type Clock, type Interval } from '@/shared/kernel/time';
import { config } from '@/shared/config';
import type { CatalogService } from '@/modules/catalog';
import { computeStartTimes, type SchedulingService } from '@/modules/scheduling';
import { intervalOf, isActive, RatingRequiredError, type AdvanceOffer, type Appointment } from './domain';

export interface BookingDeps {
  appointments: Collection<Appointment>;
  offers: Collection<AdvanceOffer>;
  catalog: Pick<CatalogService, 'getService' | 'getBarber'>;
  scheduling: Pick<SchedulingService, 'windowsFor' | 'windowsForDates'>;
  bus: EventBus<DomainEvents>;
  clock: Clock;
}

export interface BookInput {
  serviceId: string;
  barberId: string;
  date: string;
  startMin: number;
  customerName: string;
  customerPhone: string;
  notes?: string;
}

const ceil5 = (n: number) => Math.ceil(n / 5) * 5;

export class BookingService {
  constructor(private readonly d: BookingDeps) {
    // Cuando el cliente califica, la cita queda marcada y deja de bloquear nuevas reservas.
    d.bus.on('ReviewSubmitted', async ({ appointmentId }) => {
      const a = await d.appointments.get(appointmentId);
      if (a) await d.appointments.put({ ...a, reviewedAt: d.clock.now().toISOString() });
    });
  }

  // ---------- Consultas ----------

  async activeFor(barberId: string, date: string): Promise<Appointment[]> {
    return (await this.d.appointments.all())
      .filter((a) => a.barberId === barberId && a.date === date && isActive(a))
      .sort((a, b) => a.startMin - b.startMin);
  }

  async listByDate(date: string, barberId?: string): Promise<Appointment[]> {
    return (await this.d.appointments.all())
      .filter((a) => a.date === date && (!barberId || a.barberId === barberId))
      .sort((a, b) => a.startMin - b.startMin);
  }

  /** Citas activas desde hoy en adelante (para el planificador de recordatorios). */
  async listActiveUpcoming(): Promise<Appointment[]> {
    const today = toISODate(this.d.clock.now());
    return (await this.d.appointments.all()).filter((a) => isActive(a) && a.date >= today);
  }

  /** Todas las citas de un cliente (por WhatsApp), la más reciente primero. */
  async listByPhone(rawPhone: string): Promise<Appointment[]> {
    const phone = normalizePhone(rawPhone);
    return (await this.d.appointments.all())
      .filter((a) => a.customerPhone === phone)
      .sort((a, b) => b.date.localeCompare(a.date) || b.startMin - a.startMin);
  }

  /** Servicios atendidos de este teléfono que aún no se han calificado. */
  async findUnrated(rawPhone: string): Promise<Appointment | undefined> {
    const phone = normalizePhone(rawPhone);
    return (await this.d.appointments.all()).find((a) => a.status === 'completed' && !a.reviewedAt && a.customerPhone === phone);
  }

  getAppointment = (id: string) => this.d.appointments.get(id);
  getOffer = (id: string) => this.d.offers.get(id);

  async getByToken(token: string) {
    return (await this.d.appointments.all()).find((a) => a.token === token);
  }
  async getOfferByToken(token: string) {
    return (await this.d.offers.all()).find((o) => o.token === token);
  }
  async listOffers(date: string, barberId?: string) {
    return (await this.d.offers.all())
      .filter((o) => o.date === date && (!barberId || o.barberId === barberId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Oferta + la cita a la que va dirigida, a partir del enlace (token) que recibió el cliente. */
  async getOfferView(token: string): Promise<{ offer?: AdvanceOffer; appt?: Appointment }> {
    const offer = await this.getOfferByToken(token);
    const appt = offer && (await this.d.appointments.get(offer.appointmentId));
    return { offer, appt };
  }

  /** Horas de inicio disponibles para un servicio con un barbero en una fecha. */
  async availableTimes(barberId: string, serviceId: string, date: string): Promise<number[]> {
    return (await this.availableTimesByDate(barberId, serviceId, [date]))[date] ?? [];
  }

  /**
   * Horarios de varias fechas con pocas lecturas a la base (el calendario muestra ~14 días a la vez):
   * una para el servicio, una para las franjas y una para las citas.
   */
  async availableTimesByDate(barberId: string, serviceId: string, dates: string[]): Promise<Record<string, number[]>> {
    if (dates.length > 62 || dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) throw new Error('Fechas no válidas');
    const out: Record<string, number[]> = Object.fromEntries(dates.map((d) => [d, []]));
    const service = await this.d.catalog.getService(serviceId);
    if (!service) return out;

    const now = this.d.clock.now();
    const today = toISODate(now);
    const windows = await this.d.scheduling.windowsForDates(barberId, dates);
    const wanted = new Set(dates);
    const busyByDate = new Map<string, Interval[]>();
    for (const a of await this.d.appointments.all()) {
      if (a.barberId !== barberId || !isActive(a) || !wanted.has(a.date)) continue;
      busyByDate.set(a.date, [...(busyByDate.get(a.date) ?? []), intervalOf(a)]);
    }
    for (const date of dates) {
      out[date] = computeStartTimes({
        windows: windows[date] ?? [],
        busy: busyByDate.get(date) ?? [],
        durationMin: service.durationMin,
        stepMin: config.slotStepMin,
        minStartMin: date === today ? minutesOfDay(now) : 0,
      });
    }
    return out;
  }

  // ---------- Comandos ----------

  async book(input: BookInput): Promise<Appointment> {
    const name = input.customerName.trim();
    const phone = normalizePhone(input.customerPhone);
    if (name.length < 2) throw new Error('Escribe tu nombre');
    if (phone.length < 10) throw new Error('Escribe un WhatsApp válido');

    // Calificar es obligatorio: no se puede reservar con un servicio anterior sin calificar.
    const unrated = await this.findUnrated(phone);
    if (unrated) throw new RatingRequiredError(unrated.token);

    const [service, barber] = await Promise.all([this.d.catalog.getService(input.serviceId), this.d.catalog.getBarber(input.barberId)]);
    if (!service || !barber) throw new Error('Servicio o barbero no válido');

    const times = await this.availableTimes(input.barberId, input.serviceId, input.date);
    if (!times.includes(input.startMin)) throw new Error('Ese horario ya no está disponible. Elige otro.');

    const appointment: Appointment = {
      id: newId(),
      token: newToken(),
      serviceId: service.id,
      serviceName: service.name,
      barberId: barber.id,
      barberName: barber.name,
      durationMin: service.durationMin,
      priceCOP: service.priceCOP,
      date: input.date,
      startMin: input.startMin,
      customerName: name,
      customerPhone: phone,
      notes: input.notes?.trim() || undefined,
      status: 'booked',
      createdAt: this.d.clock.now().toISOString(),
    };
    await this.d.appointments.put(appointment);
    await this.d.bus.emit('AppointmentBooked', { appointmentId: appointment.id });
    return appointment;
  }

  async confirmAttendance(id: string): Promise<Appointment> {
    const a = await this.requireActive(id);
    const updated: Appointment = { ...a, status: 'confirmed', confirmedAt: this.d.clock.now().toISOString() };
    await this.d.appointments.put(updated);
    await this.d.bus.emit('AttendanceConfirmed', { appointmentId: id });
    return updated;
  }

  /** El cliente confirma desde su enlace (token) en vez de usar el id interno. */
  async confirmAttendanceByToken(token: string): Promise<Appointment> {
    const a = await this.getByToken(token);
    if (!a) throw new Error('Cita no encontrada');
    return this.confirmAttendance(a.id);
  }

  /** El cliente cancela desde su enlace (token). */
  async cancelByToken(token: string): Promise<Appointment> {
    const a = await this.getByToken(token);
    if (!a) throw new Error('Cita no encontrada');
    return this.cancel(a.id, 'client');
  }

  /** El cliente (o el admin) cancela: se libera el hueco y se ofrece adelantar al siguiente. */
  async cancel(id: string, by: 'client' | 'admin'): Promise<Appointment> {
    const a = await this.requireActive(id);
    const updated: Appointment = { ...a, status: 'cancelled', cancelledAt: this.d.clock.now().toISOString(), cancelledBy: by };
    await this.d.appointments.put(updated);
    await this.d.bus.emit('AppointmentCancelled', { appointmentId: id, by });
    await this.offerFreedSlot(a.barberId, a.date, a.startMin);
    return updated;
  }

  /** `paidCOP`: lo cobrado en el local. Si no se indica, se usa el precio del servicio (o 0 si es "Consultar"). */
  async markCompleted(id: string, paidCOP?: number) {
    const current = await this.requireActive(id);
    if (paidCOP != null && (!Number.isFinite(paidCOP) || paidCOP < 0)) throw new Error('El monto cobrado no es válido');
    await this.d.appointments.put({ ...current, status: 'completed', paidCOP: paidCOP ?? current.priceCOP ?? 0 });
    const a = (await this.d.appointments.get(id))!;
    await this.d.bus.emit('AppointmentCompleted', { appointmentId: id });
    return a;
  }
  async markNoShow(id: string) {
    const a = await this.setStatus(id, 'no_show');
    // Si no llegó, ese tiempo también se puede aprovechar.
    await this.offerFreedSlot(a.barberId, a.date, a.startMin);
    return a;
  }

  async markReminderQueued(id: string) {
    const a = await this.d.appointments.get(id);
    if (a) await this.d.appointments.put({ ...a, reminderQueuedAt: this.d.clock.now().toISOString() });
  }

  /** El siguiente cliente acepta o rechaza adelantar su cita. */
  async respondOffer(token: string, accept: boolean): Promise<{ offer: AdvanceOffer; appointment?: Appointment }> {
    const offer = await this.getOfferByToken(token);
    if (!offer) throw new Error('Oferta no encontrada');
    if (offer.status !== 'pending') throw new Error('Esta oferta ya fue respondida o venció');

    const appt = await this.d.appointments.get(offer.appointmentId);
    if (!appt || !isActive(appt)) return { offer: await this.closeOffer(offer, 'expired') };

    if (!accept) {
      const declined = await this.closeOffer(offer, 'declined');
      // "Lo atiendo al siguiente": se ofrece el mismo hueco a la cita que sigue.
      await this.offerFreedSlot(offer.barberId, offer.date, offer.freedStartMin);
      return { offer: declined, appointment: appt };
    }

    const others = (await this.activeFor(offer.barberId, offer.date)).filter((x) => x.id !== appt.id);
    const proposed = this.proposedStart(offer.date, offer.freedStartMin);
    if (!this.fits(proposed, appt, others) || proposed < this.nowMinFor(offer.date)) {
      await this.closeOffer(offer, 'expired');
      throw new Error('El cupo ya no está disponible');
    }

    const from = appt.startMin;
    const moved: Appointment = {
      ...appt,
      startMin: proposed,
      movedFromStartMin: from,
      status: 'confirmed',
      confirmedAt: this.d.clock.now().toISOString(),
      reminderQueuedAt: undefined,
    };
    await this.d.appointments.put(moved);
    const accepted = await this.closeOffer(offer, 'accepted');
    await this.d.bus.emit('AppointmentAdvanced', { appointmentId: moved.id, fromStartMin: from, toStartMin: proposed });
    // Su hora anterior queda libre: se vuelve a ofrecer en cascada.
    await this.offerFreedSlot(moved.barberId, moved.date, from);
    return { offer: accepted, appointment: moved };
  }

  // ---------- Internos ----------

  private async setStatus(id: string, status: Appointment['status']): Promise<Appointment> {
    const a = await this.d.appointments.get(id);
    if (!a) throw new Error('Cita no encontrada');
    const updated = { ...a, status };
    await this.d.appointments.put(updated);
    return updated;
  }

  private async requireActive(id: string): Promise<Appointment> {
    const a = await this.d.appointments.get(id);
    if (!a) throw new Error('Cita no encontrada');
    if (!isActive(a)) throw new Error('Esta cita ya no está activa');
    return a;
  }

  private async closeOffer(offer: AdvanceOffer, status: AdvanceOffer['status']) {
    const updated = { ...offer, status };
    await this.d.offers.put(updated);
    return updated;
  }

  private nowMinFor(date: string) {
    const now = this.d.clock.now();
    return date === toISODate(now) ? minutesOfDay(now) : 0;
  }

  /** El hueco liberado, pero nunca en el pasado. */
  private proposedStart(date: string, freedStartMin: number) {
    const now = this.d.clock.now();
    return date === toISODate(now) ? Math.max(freedStartMin, ceil5(minutesOfDay(now))) : freedStartMin;
  }

  private fits(proposedStart: number, appt: Appointment, others: Appointment[]) {
    const candidate: Interval = { startMin: proposedStart, endMin: proposedStart + appt.durationMin };
    return proposedStart < appt.startMin && !others.some((o) => overlaps(candidate, intervalOf(o)));
  }

  /**
   * Busca, entre las citas posteriores al hueco, la primera a la que le quepa
   * adelantarse y le crea una oferta. Salta a quien ya rechazó este hueco o
   * ya tiene otra oferta pendiente.
   */
  private async offerFreedSlot(barberId: string, date: string, freedStartMin: number): Promise<void> {
    const offers = (await this.d.offers.all()).filter((o) => o.barberId === barberId && o.date === date);
    const skip = new Set(
      offers.filter((o) => (o.status === 'declined' && o.freedStartMin === freedStartMin) || o.status === 'pending').map((o) => o.appointmentId),
    );

    const active = await this.activeFor(barberId, date);
    const proposed = this.proposedStart(date, freedStartMin);
    const candidate = active
      .filter((a) => a.startMin > freedStartMin && !skip.has(a.id))
      .find((a) => this.fits(proposed, a, active.filter((x) => x.id !== a.id)));

    if (!candidate) {
      await this.d.bus.emit('SlotFreed', { barberId, date, startMin: freedStartMin });
      return;
    }
    const offer: AdvanceOffer = {
      id: newId(),
      token: newToken(),
      appointmentId: candidate.id,
      barberId,
      date,
      freedStartMin,
      proposedStartMin: proposed,
      status: 'pending',
      createdAt: this.d.clock.now().toISOString(),
    };
    await this.d.offers.put(offer);
    await this.d.bus.emit('SlotFreed', { barberId, date, startMin: freedStartMin, offerId: offer.id });
  }
}
