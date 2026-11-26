// ARCHIVO GENERADO por `npm run build:api` desde server/entry. No lo edites a mano.

// src/shared/kernel/ids.ts
var newId = () => crypto.randomUUID();
function newToken(len = 12) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

// src/shared/kernel/time.ts
var pad = (n) => String(n).padStart(2, "0");
var toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function fromISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(iso, n) {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}
var minutesOfDay = (d) => d.getHours() * 60 + d.getMinutes();
var fmtMin = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
function startDateTime(date, startMin) {
  const d = fromISODate(date);
  d.setMinutes(startMin);
  return d;
}
function dayLabel(iso, opts = { weekday: "long", day: "numeric", month: "long" }) {
  return fromISODate(iso).toLocaleDateString("es-CO", opts);
}
var overlaps = (a, b) => a.startMin < b.endMin && b.startMin < a.endMin;
function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  return digits;
}

// src/shared/config.ts
var config = {
  businessName: "Barber Tattoo",
  /** Solo modo local (VITE_BACKEND=local). En modo servidor el PIN es ADMIN_PIN y vive en el servidor. */
  adminPin: import.meta.env?.VITE_ADMIN_PIN ?? "1234",
  /** Minutos antes de la cita en que se envía el recordatorio. */
  reminderLeadMin: 20,
  /** Granularidad de los horarios ofrecidos al cliente. */
  slotStepMin: 20,
  /** Cuántos días hacia adelante se puede reservar. */
  bookingHorizonDays: 14,
  address: "Cra. 4c #19C Norte-8, Popay\xE1n, Cauca",
  /** Texto de "Sobre nosotros" del inicio. Edítalo aquí con la historia real del negocio. */
  about: "Barber Tattoo es una barber\xEDa de autor fundada en 2014 en Popay\xE1n. Trabajamos con agenda cerrada para dedicarle a cada cliente el tiempo justo: tijera, m\xE1quina, navaja y un ritual de toalla caliente que empieza con un caf\xE9 y termina en el espejo. Nuestro equipo combina cl\xE1sicos, degradados limpios y dise\xF1o de barba, siempre con atenci\xF3n personalizada.",
  /** Programa de fidelidad: cada N cortes atendidos ganan una recompensa. */
  loyalty: { cutsForReward: 10, reward: "Un corte gratis" },
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Cra. 4c #19C Norte-8, Popay\xE1n, Cauca")
};
function businessHoursFor(isoDate) {
  const dow = fromISODate(isoDate).getDay();
  if (dow === 0) return null;
  return dow === 6 ? { startMin: 9 * 60, endMin: 18 * 60 } : { startMin: 9 * 60, endMin: 20 * 60 };
}

// src/shared/kernel/collection.ts
var MemoryCollection = class {
  items = /* @__PURE__ */ new Map();
  async all() {
    return [...this.items.values()].map((x) => structuredClone(x));
  }
  async get(id) {
    const x = this.items.get(id);
    return x ? structuredClone(x) : void 0;
  }
  async put(item) {
    this.items.set(item.id, structuredClone(item));
  }
  async remove(id) {
    this.items.delete(id);
  }
};

// src/modules/scheduling/slots.ts
function mergeWindows(windows) {
  const sorted = [...windows].sort((a, b) => a.startMin - b.startMin);
  const out = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && w.startMin <= last.endMin) last.endMin = Math.max(last.endMin, w.endMin);
    else out.push({ ...w });
  }
  return out;
}
function computeStartTimes({ windows, durationMin, busy, stepMin, minStartMin = 0 }) {
  const out = [];
  for (const w of mergeWindows(windows)) {
    for (let t = w.startMin; t + durationMin <= w.endMin; t += stepMin) {
      if (t < minStartMin) continue;
      const candidate = { startMin: t, endMin: t + durationMin };
      if (busy.some((b) => overlaps(candidate, b))) continue;
      out.push(t);
    }
  }
  return out;
}

// src/modules/scheduling/schedulingService.ts
var SchedulingService = class {
  constructor(windows, weekly = new MemoryCollection()) {
    this.windows = windows;
    this.weekly = weekly;
  }
  /** Plantilla guardada del barbero; si no tiene, parte del horario comercial base. */
  async getWeekly(barberId) {
    const saved = await this.weekly.get(barberId);
    if (saved) return saved;
    const days = Array.from({ length: 7 }, (_, dow) => {
      const hours = businessHoursFor(addDays("2030-01-06", dow));
      return { enabled: !!hours, startMin: hours?.startMin ?? 9 * 60, endMin: hours?.endMin ?? 18 * 60 };
    });
    return { id: barberId, days };
  }
  async saveWeekly(barberId, days) {
    if (days.length !== 7) throw new Error("La semana debe tener 7 d\xEDas");
    for (const d of days) if (d.enabled && !(d.endMin > d.startMin)) throw new Error("En cada d\xEDa activo, la hora final debe ser posterior a la inicial");
    await this.weekly.put({ id: barberId, days });
  }
  /**
   * Convierte la plantilla semanal en franjas por fecha para los próximos `days` días.
   * Reemplaza lo que hubiera en esas fechas (los días no activos quedan cerrados).
   * No toca citas ya reservadas.
   */
  async applyWeekly(barberId, fromDate, days) {
    const { days: week } = await this.getWeekly(barberId);
    for (let i = 0; i < days; i++) {
      const date = addDays(fromDate, i);
      const d = week[fromISODate(date).getDay()];
      if (d.enabled) await this.openDay(barberId, date, d.startMin, d.endMin);
      else await this.clearDay(barberId, date);
    }
  }
  async listWindows(barberId, date) {
    return (await this.windows.all()).filter((w) => w.barberId === barberId && w.date === date).sort((a, b) => a.startMin - b.startMin);
  }
  /** Ventanas fusionadas, listas para calcular horarios. */
  async windowsFor(barberId, date) {
    const ws = await this.listWindows(barberId, date);
    return mergeWindows(ws.map(({ startMin, endMin }) => ({ startMin, endMin })));
  }
  /** Ventanas fusionadas de varias fechas con UNA sola lectura (para el calendario de reservas). */
  async windowsForDates(barberId, dates) {
    const wanted = new Set(dates);
    const byDate = Object.fromEntries(dates.map((d) => [d, []]));
    for (const w of await this.windows.all()) {
      if (w.barberId === barberId && wanted.has(w.date)) byDate[w.date].push({ startMin: w.startMin, endMin: w.endMin });
    }
    for (const d of dates) byDate[d] = mergeWindows(byDate[d]);
    return byDate;
  }
  async addWindow(barberId, date, startMin, endMin) {
    if (!(endMin > startMin)) throw new Error("La hora final debe ser posterior a la inicial");
    await this.windows.put({ id: newId(), barberId, date, startMin, endMin });
  }
  getWindow = (id) => this.windows.get(id);
  removeWindow = (id) => this.windows.remove(id);
  async clearDay(barberId, date) {
    for (const w of await this.listWindows(barberId, date)) await this.windows.remove(w.id);
  }
  /** Borra todas las franjas de un barbero (al darlo de baja). */
  async clearBarber(barberId) {
    for (const w of (await this.windows.all()).filter((x) => x.barberId === barberId)) await this.windows.remove(w.id);
    await this.weekly.remove(barberId);
  }
  /** Reemplaza el día por una sola ventana. */
  async openDay(barberId, date, startMin, endMin) {
    await this.clearDay(barberId, date);
    await this.addWindow(barberId, date, startMin, endMin);
  }
  /** Aplica el horario comercial base a los próximos `days` días (domingos cerrados). */
  async openBusinessHours(barberId, fromDate, days) {
    for (let i = 0; i < days; i++) {
      const date = addDays(fromDate, i);
      const hours = businessHoursFor(date);
      if (hours) await this.openDay(barberId, date, hours.startMin, hours.endMin);
    }
  }
  async isEmpty() {
    return (await this.windows.all()).length === 0;
  }
};

// src/modules/booking/domain.ts
var RatingRequiredError = class extends Error {
  constructor(token) {
    super("Antes de reservar de nuevo, califica tu \xFAltimo servicio.");
    this.token = token;
  }
};
var isActive = (a) => a.status === "booked" || a.status === "confirmed";
var intervalOf = (a) => ({ startMin: a.startMin, endMin: a.startMin + a.durationMin });
var startOf = (a) => startDateTime(a.date, a.startMin);
var minutesUntil = (a, now) => Math.round((startOf(a).getTime() - now.getTime()) / 6e4);

// src/modules/booking/bookingService.ts
var ceil5 = (n) => Math.ceil(n / 5) * 5;
var BookingService = class {
  constructor(d) {
    this.d = d;
    d.bus.on("ReviewSubmitted", async ({ appointmentId }) => {
      const a = await d.appointments.get(appointmentId);
      if (a) await d.appointments.put({ ...a, reviewedAt: d.clock.now().toISOString() });
    });
  }
  // ---------- Consultas ----------
  async activeFor(barberId, date) {
    return (await this.d.appointments.all()).filter((a) => a.barberId === barberId && a.date === date && isActive(a)).sort((a, b) => a.startMin - b.startMin);
  }
  async listByDate(date, barberId) {
    return (await this.d.appointments.all()).filter((a) => a.date === date && (!barberId || a.barberId === barberId)).sort((a, b) => a.startMin - b.startMin);
  }
  /** Citas activas desde hoy en adelante (para el planificador de recordatorios). */
  async listActiveUpcoming() {
    const today = toISODate(this.d.clock.now());
    return (await this.d.appointments.all()).filter((a) => isActive(a) && a.date >= today);
  }
  /** Todas las citas de un cliente (por WhatsApp), la más reciente primero. */
  async listByPhone(rawPhone) {
    const phone = normalizePhone(rawPhone);
    return (await this.d.appointments.all()).filter((a) => a.customerPhone === phone).sort((a, b) => b.date.localeCompare(a.date) || b.startMin - a.startMin);
  }
  /** Servicios atendidos de este teléfono que aún no se han calificado. */
  async findUnrated(rawPhone) {
    const phone = normalizePhone(rawPhone);
    return (await this.d.appointments.all()).find((a) => a.status === "completed" && !a.reviewedAt && a.customerPhone === phone);
  }
  getAppointment = (id) => this.d.appointments.get(id);
  getOffer = (id) => this.d.offers.get(id);
  async getByToken(token) {
    return (await this.d.appointments.all()).find((a) => a.token === token);
  }
  async getOfferByToken(token) {
    return (await this.d.offers.all()).find((o) => o.token === token);
  }
  async listOffers(date, barberId) {
    return (await this.d.offers.all()).filter((o) => o.date === date && (!barberId || o.barberId === barberId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  /** Oferta + la cita a la que va dirigida, a partir del enlace (token) que recibió el cliente. */
  async getOfferView(token) {
    const offer = await this.getOfferByToken(token);
    const appt = offer && await this.d.appointments.get(offer.appointmentId);
    return { offer, appt };
  }
  /** Horas de inicio disponibles para un servicio con un barbero en una fecha. */
  async availableTimes(barberId, serviceId, date) {
    return (await this.availableTimesByDate(barberId, serviceId, [date]))[date] ?? [];
  }
  /**
   * Horarios de varias fechas con pocas lecturas a la base (el calendario muestra ~14 días a la vez):
   * una para el servicio, una para las franjas y una para las citas.
   */
  async availableTimesByDate(barberId, serviceId, dates) {
    if (dates.length > 62 || dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) throw new Error("Fechas no v\xE1lidas");
    const out = Object.fromEntries(dates.map((d) => [d, []]));
    const service = await this.d.catalog.getService(serviceId);
    if (!service) return out;
    const now = this.d.clock.now();
    const today = toISODate(now);
    const windows = await this.d.scheduling.windowsForDates(barberId, dates);
    const wanted = new Set(dates);
    const busyByDate = /* @__PURE__ */ new Map();
    for (const a of await this.d.appointments.all()) {
      if (a.barberId !== barberId || !isActive(a) || !wanted.has(a.date)) continue;
      busyByDate.set(a.date, [...busyByDate.get(a.date) ?? [], intervalOf(a)]);
    }
    for (const date of dates) {
      out[date] = computeStartTimes({
        windows: windows[date] ?? [],
        busy: busyByDate.get(date) ?? [],
        durationMin: service.durationMin,
        stepMin: config.slotStepMin,
        minStartMin: date === today ? minutesOfDay(now) : 0
      });
    }
    return out;
  }
  // ---------- Comandos ----------
  async book(input) {
    const name = input.customerName.trim();
    const phone = normalizePhone(input.customerPhone);
    if (name.length < 2) throw new Error("Escribe tu nombre");
    if (phone.length < 10) throw new Error("Escribe un WhatsApp v\xE1lido");
    const unrated = await this.findUnrated(phone);
    if (unrated) throw new RatingRequiredError(unrated.token);
    const [service, barber] = await Promise.all([this.d.catalog.getService(input.serviceId), this.d.catalog.getBarber(input.barberId)]);
    if (!service || !barber) throw new Error("Servicio o barbero no v\xE1lido");
    const times = await this.availableTimes(input.barberId, input.serviceId, input.date);
    if (!times.includes(input.startMin)) throw new Error("Ese horario ya no est\xE1 disponible. Elige otro.");
    const appointment = {
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
      notes: input.notes?.trim() || void 0,
      status: "booked",
      createdAt: this.d.clock.now().toISOString()
    };
    await this.d.appointments.put(appointment);
    await this.d.bus.emit("AppointmentBooked", { appointmentId: appointment.id });
    return appointment;
  }
  async confirmAttendance(id) {
    const a = await this.requireActive(id);
    const updated = { ...a, status: "confirmed", confirmedAt: this.d.clock.now().toISOString() };
    await this.d.appointments.put(updated);
    await this.d.bus.emit("AttendanceConfirmed", { appointmentId: id });
    return updated;
  }
  /** El cliente confirma desde su enlace (token) en vez de usar el id interno. */
  async confirmAttendanceByToken(token) {
    const a = await this.getByToken(token);
    if (!a) throw new Error("Cita no encontrada");
    return this.confirmAttendance(a.id);
  }
  /** El cliente cancela desde su enlace (token). */
  async cancelByToken(token) {
    const a = await this.getByToken(token);
    if (!a) throw new Error("Cita no encontrada");
    return this.cancel(a.id, "client");
  }
  /** El cliente (o el admin) cancela: se libera el hueco y se ofrece adelantar al siguiente. */
  async cancel(id, by) {
    const a = await this.requireActive(id);
    const updated = { ...a, status: "cancelled", cancelledAt: this.d.clock.now().toISOString(), cancelledBy: by };
    await this.d.appointments.put(updated);
    await this.d.bus.emit("AppointmentCancelled", { appointmentId: id, by });
    await this.offerFreedSlot(a.barberId, a.date, a.startMin);
    return updated;
  }
  /** `paidCOP`: lo cobrado en el local. Si no se indica, se usa el precio del servicio (o 0 si es "Consultar"). */
  async markCompleted(id, paidCOP) {
    const current = await this.requireActive(id);
    if (paidCOP != null && (!Number.isFinite(paidCOP) || paidCOP < 0)) throw new Error("El monto cobrado no es v\xE1lido");
    await this.d.appointments.put({ ...current, status: "completed", paidCOP: paidCOP ?? current.priceCOP ?? 0 });
    const a = await this.d.appointments.get(id);
    await this.d.bus.emit("AppointmentCompleted", { appointmentId: id });
    return a;
  }
  async markNoShow(id) {
    const a = await this.setStatus(id, "no_show");
    await this.offerFreedSlot(a.barberId, a.date, a.startMin);
    return a;
  }
  async markReminderQueued(id) {
    const a = await this.d.appointments.get(id);
    if (a) await this.d.appointments.put({ ...a, reminderQueuedAt: this.d.clock.now().toISOString() });
  }
  /** El siguiente cliente acepta o rechaza adelantar su cita. */
  async respondOffer(token, accept) {
    const offer = await this.getOfferByToken(token);
    if (!offer) throw new Error("Oferta no encontrada");
    if (offer.status !== "pending") throw new Error("Esta oferta ya fue respondida o venci\xF3");
    const appt = await this.d.appointments.get(offer.appointmentId);
    if (!appt || !isActive(appt)) return { offer: await this.closeOffer(offer, "expired") };
    if (!accept) {
      const declined = await this.closeOffer(offer, "declined");
      await this.offerFreedSlot(offer.barberId, offer.date, offer.freedStartMin);
      return { offer: declined, appointment: appt };
    }
    const others = (await this.activeFor(offer.barberId, offer.date)).filter((x) => x.id !== appt.id);
    const proposed = this.proposedStart(offer.date, offer.freedStartMin);
    if (!this.fits(proposed, appt, others) || proposed < this.nowMinFor(offer.date)) {
      await this.closeOffer(offer, "expired");
      throw new Error("El cupo ya no est\xE1 disponible");
    }
    const from = appt.startMin;
    const moved = {
      ...appt,
      startMin: proposed,
      movedFromStartMin: from,
      status: "confirmed",
      confirmedAt: this.d.clock.now().toISOString(),
      reminderQueuedAt: void 0
    };
    await this.d.appointments.put(moved);
    const accepted = await this.closeOffer(offer, "accepted");
    await this.d.bus.emit("AppointmentAdvanced", { appointmentId: moved.id, fromStartMin: from, toStartMin: proposed });
    await this.offerFreedSlot(moved.barberId, moved.date, from);
    return { offer: accepted, appointment: moved };
  }
  // ---------- Internos ----------
  async setStatus(id, status) {
    const a = await this.d.appointments.get(id);
    if (!a) throw new Error("Cita no encontrada");
    const updated = { ...a, status };
    await this.d.appointments.put(updated);
    return updated;
  }
  async requireActive(id) {
    const a = await this.d.appointments.get(id);
    if (!a) throw new Error("Cita no encontrada");
    if (!isActive(a)) throw new Error("Esta cita ya no est\xE1 activa");
    return a;
  }
  async closeOffer(offer, status) {
    const updated = { ...offer, status };
    await this.d.offers.put(updated);
    return updated;
  }
  nowMinFor(date) {
    const now = this.d.clock.now();
    return date === toISODate(now) ? minutesOfDay(now) : 0;
  }
  /** El hueco liberado, pero nunca en el pasado. */
  proposedStart(date, freedStartMin) {
    const now = this.d.clock.now();
    return date === toISODate(now) ? Math.max(freedStartMin, ceil5(minutesOfDay(now))) : freedStartMin;
  }
  fits(proposedStart, appt, others) {
    const candidate = { startMin: proposedStart, endMin: proposedStart + appt.durationMin };
    return proposedStart < appt.startMin && !others.some((o) => overlaps(candidate, intervalOf(o)));
  }
  /**
   * Busca, entre las citas posteriores al hueco, la primera a la que le quepa
   * adelantarse y le crea una oferta. Salta a quien ya rechazó este hueco o
   * ya tiene otra oferta pendiente.
   */
  async offerFreedSlot(barberId, date, freedStartMin) {
    const offers = (await this.d.offers.all()).filter((o) => o.barberId === barberId && o.date === date);
    const skip = new Set(
      offers.filter((o) => o.status === "declined" && o.freedStartMin === freedStartMin || o.status === "pending").map((o) => o.appointmentId)
    );
    const active = await this.activeFor(barberId, date);
    const proposed = this.proposedStart(date, freedStartMin);
    const candidate = active.filter((a) => a.startMin > freedStartMin && !skip.has(a.id)).find((a) => this.fits(proposed, a, active.filter((x) => x.id !== a.id)));
    if (!candidate) {
      await this.d.bus.emit("SlotFreed", { barberId, date, startMin: freedStartMin });
      return;
    }
    const offer = {
      id: newId(),
      token: newToken(),
      appointmentId: candidate.id,
      barberId,
      date,
      freedStartMin,
      proposedStartMin: proposed,
      status: "pending",
      createdAt: this.d.clock.now().toISOString()
    };
    await this.d.offers.put(offer);
    await this.d.bus.emit("SlotFreed", { barberId, date, startMin: freedStartMin, offerId: offer.id });
  }
};

// src/modules/notifications/templates.ts
var when = (a, startMin = a.startMin) => `${dayLabel(a.date, { weekday: "long", day: "numeric", month: "long" })} a las ${fmtMin(startMin)}`;
var templates = {
  booking: (a, link) => `Hola ${a.customerName} \u{1F44B} Tu cita en Barber Tattoo qued\xF3 reservada:
\u2022 ${a.serviceName} con ${a.barberName}
\u2022 ${when(a)}

Te escribiremos unos minutos antes para confirmar. Puedes ver o cancelar tu cita aqu\xED: ${link}`,
  reminder: (a, minutesLeft, link) => `\u23F0 Hola ${a.customerName}, tu cita de ${a.serviceName} con ${a.barberName} es ${minutesLeft <= 1 ? "ya mismo" : `en ${minutesLeft} min`} (${fmtMin(a.startMin)}).

\xBFVas a venir? Conf\xEDrmalo o av\xEDsanos si no puedes: ${link}`,
  advanceOffer: (a, o, link) => `Hola ${a.customerName} \u{1F44B} Se liber\xF3 un espacio antes de tu cita. \xBFQuieres que te atendamos a las ${fmtMin(o.proposedStartMin)} en vez de a las ${fmtMin(a.startMin)}?

Responde aqu\xED: ${link}`,
  ratingRequest: (a, link) => `Gracias por visitarnos, ${a.customerName} \u2702\uFE0F \xBFC\xF3mo estuvo tu servicio? Califica a Barber Tattoo, toma 10 segundos (es necesario para tu pr\xF3xima reserva): ${link}`,
  advanced: (a, link) => `\u2705 Listo ${a.customerName}, tu cita qued\xF3 para ${when(a)}. Detalle: ${link}`
};

// src/modules/notifications/notificationService.ts
var NotificationService = class {
  constructor(d) {
    this.d = d;
    this.subscribe();
  }
  get mode() {
    return this.d.channel.mode;
  }
  /** Para el panel admin (por RPC no se pueden leer getters). */
  async getMode() {
    return this.d.channel.mode;
  }
  /** Modo manual: la persona ya abrió WhatsApp con el texto; se registra como enviado. */
  async markSent(id) {
    const m = await this.d.outbox.get(id);
    if (m) await this.d.outbox.put({ ...m, status: "sent", sentAt: this.d.clock.now().toISOString(), error: void 0 });
  }
  async listOutbox() {
    return (await this.d.outbox.all()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  /** Envía (o reintenta) un mensaje por el canal activo y lo marca. */
  async deliver(id) {
    const m = await this.d.outbox.get(id);
    if (!m) return;
    try {
      await this.d.channel.send(m);
      await this.d.outbox.put({ ...m, status: "sent", sentAt: this.d.clock.now().toISOString(), error: void 0 });
    } catch (e) {
      await this.d.outbox.put({ ...m, status: "failed", error: e instanceof Error ? e.message : "Error desconocido" });
    }
  }
  /**
   * Revisa las citas activas: a las que les faltan <= reminderLeadMin minutos y aún no
   * tienen recordatorio, se les encola uno. Cubre también el caso "agendó con menos de
   * 20 min de anticipación": el recordatorio sale en el siguiente tick.
   */
  async runReminderTick() {
    const now = this.d.clock.now();
    let queued = 0;
    for (const a of await this.d.booking.listActiveUpcoming()) {
      if (a.reminderQueuedAt) continue;
      const left = minutesUntil(a, now);
      if (left > config.reminderLeadMin || left < -5) continue;
      await this.enqueue("reminder", a.customerPhone, templates.reminder(a, Math.max(left, 0), this.link("cita", a.token)), a.id);
      await this.d.booking.markReminderQueued(a.id);
      queued++;
    }
    return queued;
  }
  // ---------- Internos ----------
  link(kind, token) {
    return `${this.d.baseUrl()}/${kind}/${token}`;
  }
  async enqueue(kind, to, text, appointmentId) {
    const message = { id: newId(), kind, to, text, appointmentId, createdAt: this.d.clock.now().toISOString(), status: "queued" };
    await this.d.outbox.put(message);
    if (this.d.channel.mode === "auto") await this.deliver(message.id);
  }
  subscribe() {
    const { bus, booking } = this.d;
    bus.on("AppointmentBooked", async ({ appointmentId }) => {
      const a = await booking.getAppointment(appointmentId);
      if (a) await this.enqueue("booking", a.customerPhone, templates.booking(a, this.link("cita", a.token)), a.id);
    });
    bus.on("SlotFreed", async ({ offerId }) => {
      if (!offerId) return;
      const offer = await booking.getOffer(offerId);
      const a = offer && await booking.getAppointment(offer.appointmentId);
      if (offer && a) await this.enqueue("advance_offer", a.customerPhone, templates.advanceOffer(a, offer, this.link("oferta", offer.token)), a.id);
    });
    bus.on("AppointmentCompleted", async ({ appointmentId }) => {
      const a = await booking.getAppointment(appointmentId);
      if (a) await this.enqueue("rating_request", a.customerPhone, templates.ratingRequest(a, this.link("calificar", a.token)), a.id);
    });
    bus.on("AppointmentAdvanced", async ({ appointmentId }) => {
      const a = await booking.getAppointment(appointmentId);
      if (a) await this.enqueue("advanced", a.customerPhone, templates.advanced(a, this.link("cita", a.token)), a.id);
    });
  }
};

// src/modules/notifications/channels.ts
var ManualChannel = class {
  mode = "manual";
  async send() {
  }
};
var WhatsAppCloudChannel = class {
  constructor(cfg) {
    this.cfg = cfg;
  }
  mode = "auto";
  async send(message) {
    const res = await fetch(`https://graph.facebook.com/v21.0/${this.cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: message.to, type: "text", text: { body: message.text } })
    });
    if (!res.ok) throw new Error(`WhatsApp API respondi\xF3 ${res.status}`);
  }
};

// src/shared/kernel/eventBus.ts
var EventBus = class {
  handlers = {};
  on(type, handler) {
    const list = this.handlers[type] ??= [];
    list.push(handler);
    return () => {
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    };
  }
  async emit(type, payload) {
    for (const h of this.handlers[type] ?? []) await h(payload);
  }
};

// src/modules/catalog/catalogService.ts
var CatalogService = class {
  constructor(repo) {
    this.repo = repo;
  }
  services = () => this.repo.services();
  barbers = () => this.repo.barbers();
  async getService(id) {
    return (await this.repo.services()).find((s) => s.id === id);
  }
  async getBarber(id) {
    return (await this.repo.barbers()).find((b) => b.id === id);
  }
  async addBarber(input) {
    const barber = this.clean({ ...input, id: newId() });
    await this.repo.saveBarber(barber);
    return barber;
  }
  async updateBarber(barber) {
    await this.repo.saveBarber(this.clean(barber));
  }
  /** El módulo admin es quien valida que no tenga citas activas antes de llamar aquí. */
  removeBarber = (id) => this.repo.deleteBarber(id);
  clean(b) {
    const name = b.name.trim();
    if (name.length < 2) throw new Error("Escribe el nombre");
    return { ...b, name, role: b.role.trim() || "Barbero", bio: b.bio.trim(), photo: b.photo?.trim() || void 0 };
  }
};

// src/modules/catalog/seed.ts
var IMG = "https://media.base44.com/images/public/6b0507a155abc5e7dfd2c0b1";
var SERVICES = [
  { id: "corte", name: "Corte de cabello", description: "Tijera, m\xE1quina y acabado a navaja.", category: "Corte", durationMin: 40, priceCOP: 22e3 },
  { id: "corte-barba", name: "Corte + Barba", description: "Corte y perfilado de barba en una sola sesi\xF3n.", category: "Corte", durationMin: 60, priceCOP: 3e4 },
  { id: "barba", name: "Barba perfilada", description: "Contorno y dise\xF1o a navaja con aceite.", category: "Barba", durationMin: 25, priceCOP: 1e4 },
  { id: "rasurado", name: "Rasurado de barba", description: "Rasurado tradicional con toalla caliente.", category: "Barba", durationMin: 15, priceCOP: 4e3 },
  { id: "cejas", name: "Cejas", description: "Dise\xF1o y perfilado de cejas.", category: "Barba", durationMin: 10, priceCOP: 4e3 },
  { id: "color", name: "Colorimetr\xEDa", description: "Color a medida para cubrir o cambiar el tono. Valor seg\xFAn diagn\xF3stico.", category: "Color", durationMin: 60, priceCOP: null },
  { id: "ondulados", name: "Ondulados permanentes", description: "Permanente y textura. Valor seg\xFAn diagn\xF3stico.", category: "Color", durationMin: 90, priceCOP: null },
  { id: "minoxidil", name: "Tratamiento de Minoxidil", description: "Cuidado del cuero cabelludo. Valor seg\xFAn diagn\xF3stico.", category: "Tratamiento", durationMin: 30, priceCOP: null }
];
var SEED_BARBERS = [
  {
    id: "mateo",
    name: "Mateo R\xEDos",
    role: "Fundador \xB7 Navaja y cl\xE1sicos",
    bio: "Aprendi\xF3 el oficio en una barber\xEDa de barrio y lo refin\xF3 en Madrid. Corta con tijera y termina a navaja.",
    photo: `${IMG}/3970bd79be0b5bd3ee88d65c271d6c03_generated_627a0e45.png`
  },
  {
    id: "julian",
    name: "Juli\xE1n V\xE9lez",
    role: "Barbero \xB7 Fades y m\xE1quina",
    bio: "Especialista en degradados limpios, l\xEDneas rectas y acabados que aguantan la semana.",
    photo: `${IMG}/0e4c624ce1ff6d088ca1b6eda49b7c04_generated_4810f580.png`
  },
  {
    id: "samuel",
    name: "Samuel Ortiz",
    role: "Barbero \xB7 Barba y rituales",
    bio: "Dise\xF1a barbas seg\xFAn la forma del rostro y dirige el ritual de toalla caliente.",
    photo: `${IMG}/c1ed93e2f94d8b0d408a150e9e00aa80_generated_fac7b646.png`
  }
];
var HERO_IMAGE = `${IMG}/1e959b079604ac0dafad99bd8dce8fe0_generated_3204b4fd.png`;
var GALLERY_IMAGES = [
  `${IMG}/81f3076e850ec402dd77c50c20fe7238_generated_ccf62eb0.png`,
  `${IMG}/ef2818838d7d967d3a469086ba9c5c11_generated_a44083c9.png`
];
var CollectionCatalogRepository = class {
  constructor(team, meta) {
    this.team = team;
    this.meta = meta;
  }
  async services() {
    return SERVICES;
  }
  /** Siembra el equipo inicial una sola vez y SIEMPRE antes de cualquier lectura o escritura. */
  async ensureSeeded() {
    if (await this.meta.get("barbers-seeded")) return;
    await this.meta.put({ id: "barbers-seeded" });
    if ((await this.team.all()).length === 0) for (const b of SEED_BARBERS) await this.team.put(b);
  }
  async barbers() {
    await this.ensureSeeded();
    return this.team.all();
  }
  async saveBarber(barber) {
    await this.ensureSeeded();
    await this.team.put(barber);
  }
  async deleteBarber(id) {
    await this.ensureSeeded();
    await this.team.remove(id);
  }
};

// src/modules/reviews/reviewService.ts
var ReviewService = class {
  constructor(d) {
    this.d = d;
  }
  async list() {
    return (await this.d.reviews.all()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  /** Versión pública: solo estrellas, comentario y primer nombre (sin ids, teléfonos ni barbero). */
  async listPublic() {
    return (await this.list()).map((r) => ({
      rating: r.rating,
      comment: r.comment,
      firstName: r.customerName.split(" ")[0],
      createdAt: r.createdAt
    }));
  }
  /** Reseña ya hecha para una cita (null si aún no califica). */
  getForAppointment = (appointmentId) => this.d.reviews.get(appointmentId);
  /** Solo el admin elimina (moderación). Los clientes no pueden editar ni borrar. */
  remove = (id) => this.d.reviews.remove(id);
  async submit(input) {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new Error("Elige de 1 a 5 estrellas");
    const appt = await this.d.booking.getByToken(input.appointmentToken);
    if (!appt) throw new Error("No encontramos tu cita");
    if (appt.status !== "completed") throw new Error("Podr\xE1s calificar cuando termine tu servicio");
    if (await this.d.reviews.get(appt.id)) throw new Error("Ya calificaste este servicio");
    const review = {
      id: appt.id,
      appointmentId: appt.id,
      customerName: appt.customerName,
      barberId: appt.barberId,
      barberName: appt.barberName,
      serviceName: appt.serviceName,
      rating: input.rating,
      comment: input.comment?.trim().slice(0, 500) || void 0,
      createdAt: this.d.clock.now().toISOString()
    };
    await this.d.reviews.put(review);
    await this.d.bus.emit("ReviewSubmitted", { appointmentId: appt.id });
    return review;
  }
  async summary() {
    const all = await this.d.reviews.all();
    const distribution = [0, 0, 0, 0, 0];
    for (const r of all) distribution[r.rating - 1]++;
    const count = all.length;
    const average = count ? all.reduce((s, r) => s + r.rating, 0) / count : 0;
    return { average, count, distribution };
  }
};

// src/modules/promotions/promotionService.ts
var PromotionService = class {
  constructor(promos, clock) {
    this.promos = promos;
    this.clock = clock;
  }
  async list() {
    return (await this.promos.all()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  /** Activas y no vencidas a hoy. */
  async listActive() {
    const today = toISODate(this.clock.now());
    return (await this.list()).filter((p) => p.active && (!p.validUntil || p.validUntil >= today));
  }
  async add(input) {
    const title = input.title.trim();
    if (title.length < 3) throw new Error("Escribe el t\xEDtulo de la promoci\xF3n");
    const promo = {
      id: newId(),
      title,
      description: input.description.trim(),
      validUntil: input.validUntil || void 0,
      active: true,
      createdAt: this.clock.now().toISOString()
    };
    await this.promos.put(promo);
    return promo;
  }
  async setActive(id, active) {
    const p = await this.promos.get(id);
    if (p) await this.promos.put({ ...p, active });
  }
  remove = (id) => this.promos.remove(id);
};

// src/shared/kernel/pin.ts
var ITER = 1e5;
var b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
var unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function derive(pin, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}
async function hashPin(pin) {
  if (!globalThis.crypto?.subtle) return `plain$${pin}`;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await derive(pin, salt, ITER))}`;
}
async function verifyPin(pin, stored) {
  if (stored.startsWith("pbkdf2$")) {
    if (!globalThis.crypto?.subtle) return false;
    const [, iter, salt, hash] = stored.split("$");
    const got = new Uint8Array(await derive(pin, unb64(salt), Number(iter)));
    const want = unb64(hash);
    let diff = got.length ^ want.length;
    for (let i = 0; i < got.length; i++) diff |= got[i] ^ (want[i] ?? 0);
    return diff === 0;
  }
  if (stored.startsWith("plain$")) return stored.slice(6) === pin;
  return stored === pin;
}

// src/modules/customers/customerService.ts
var strip = ({ pin: _pin, ...rest }) => rest;
var CustomerService = class {
  constructor(accounts, clock) {
    this.accounts = accounts;
    this.clock = clock;
  }
  async register(input) {
    const name = input.name.trim();
    const id = normalizePhone(input.phone);
    if (name.length < 2) throw new Error("Escribe tu nombre");
    if (id.length < 10) throw new Error("Escribe un WhatsApp v\xE1lido");
    if (!/^\d{4,8}$/.test(input.pin)) throw new Error("El PIN debe tener de 4 a 8 d\xEDgitos");
    if (await this.accounts.get(id)) throw new Error("Ya existe una cuenta con ese WhatsApp. Inicia sesi\xF3n.");
    const account = { id, name, pin: await hashPin(input.pin), createdAt: this.clock.now().toISOString() };
    await this.accounts.put(account);
    return strip(account);
  }
  async login(phone, pin) {
    const account = await this.accounts.get(normalizePhone(phone));
    if (!account || !await verifyPin(pin, account.pin)) throw new Error("WhatsApp o PIN incorrectos");
    return strip(account);
  }
  async get(id) {
    const a = await this.accounts.get(id);
    return a && strip(a);
  }
};

// src/modules/admin/access.ts
var BarberAccess = class {
  constructor(creds) {
    this.creds = creds;
  }
  async setPin(barberId, pin) {
    if (!/^\d{4,8}$/.test(pin)) throw new Error("El PIN debe tener de 4 a 8 d\xEDgitos");
    await this.creds.put({ id: barberId, pin: await hashPin(pin) });
  }
  async hasPin(barberId) {
    return !!await this.creds.get(barberId);
  }
  async verify(barberId, pin) {
    const c = await this.creds.get(barberId);
    return !!c && await verifyPin(pin, c.pin);
  }
  remove = (barberId) => this.creds.remove(barberId);
};

// src/app/services.ts
function createServices({ collection, clock, channel, baseUrl }) {
  const bus = new EventBus();
  const catalog = new CatalogService(new CollectionCatalogRepository(collection("barbers"), collection("meta")));
  const scheduling = new SchedulingService(collection("availability"), collection("weekly"));
  const booking = new BookingService({
    appointments: collection("appointments"),
    offers: collection("offers"),
    catalog,
    scheduling,
    bus,
    clock
  });
  const notifications = new NotificationService({ outbox: collection("outbox"), channel, booking, bus, clock, baseUrl });
  const access = new BarberAccess(collection("barber-access"));
  const reviews = new ReviewService({ reviews: collection("reviews"), booking, bus, clock });
  const promotions = new PromotionService(collection("promotions"), clock);
  const customers = new CustomerService(collection("customers"), clock);
  return { bus, clock, catalog, scheduling, booking, notifications, access, reviews, promotions, customers };
}

// server/auth.ts
import { createHmac, timingSafeEqual } from "node:crypto";
var b64u = (b) => Buffer.from(b).toString("base64url");
var sign = (data, secret) => createHmac("sha256", secret).update(data).digest();
function signToken(p, secret, ttlSec, nowMs = Date.now()) {
  const body = b64u(JSON.stringify({ ...p, exp: Math.floor(nowMs / 1e3) + ttlSec }));
  return `${body}.${b64u(sign(body, secret))}`;
}
function verifyToken(token, secret, nowMs = Date.now()) {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = sign(body, secret);
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const { role, sub, exp } = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!["admin", "barber", "customer"].includes(role) || typeof sub !== "string" || exp * 1e3 < nowMs) return null;
    return { role, sub };
  } catch {
    return null;
  }
}
var TOKEN_TTL = { admin: 12 * 3600, barber: 12 * 3600, customer: 7 * 24 * 3600 };
var MAX_FAILS = 5;
var LOCK_MS = 15 * 60 * 1e3;
var LoginGuard = class {
  constructor(store, now = Date.now) {
    this.store = store;
    this.now = now;
  }
  async assertOpen(key) {
    const a = await this.store.get(key);
    if (a?.lockedUntil && a.lockedUntil > this.now()) {
      const min = Math.ceil((a.lockedUntil - this.now()) / 6e4);
      throw new Error(`Demasiados intentos. Vuelve a intentar en ${min} min.`);
    }
  }
  async fail(key) {
    const prev = await this.store.get(key);
    const expired = prev?.lockedUntil && prev.lockedUntil <= this.now();
    const count = (expired ? 0 : prev?.count ?? 0) + 1;
    await this.store.put({ id: key, count: count >= MAX_FAILS ? 0 : count, lockedUntil: count >= MAX_FAILS ? this.now() + LOCK_MS : void 0 });
  }
  async ok(key) {
    if (await this.store.get(key)) await this.store.remove(key);
  }
};
function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// server/policy.ts
var isAdmin = (ps) => ps.some((p) => p.role === "admin");
var isBarber = (ps, id) => typeof id === "string" && ps.some((p) => p.role === "barber" && p.sub === id);
var pub = () => true;
var admin = ({ principals }) => isAdmin(principals);
var adminOrBarberArg = (i) => ({ principals, args }) => isAdmin(principals) || isBarber(principals, args[i]);
var adminOrAppointmentBarber = async ({ principals, args, services }) => {
  if (isAdmin(principals)) return true;
  if (typeof args[0] !== "string") return false;
  const a = await services.booking.getAppointment(args[0]);
  return !!a && isBarber(principals, a.barberId);
};
var POLICY = {
  // catálogo
  "catalog.services": pub,
  "catalog.barbers": pub,
  "catalog.getService": pub,
  "catalog.getBarber": pub,
  "catalog.addBarber": admin,
  "catalog.updateBarber": admin,
  "catalog.removeBarber": admin,
  // horarios
  "scheduling.windowsFor": pub,
  "scheduling.listWindows": pub,
  "scheduling.getWeekly": adminOrBarberArg(0),
  "scheduling.saveWeekly": adminOrBarberArg(0),
  "scheduling.applyWeekly": adminOrBarberArg(0),
  "scheduling.addWindow": adminOrBarberArg(0),
  "scheduling.openDay": adminOrBarberArg(0),
  "scheduling.openBusinessHours": adminOrBarberArg(0),
  "scheduling.clearDay": adminOrBarberArg(0),
  "scheduling.clearBarber": admin,
  "scheduling.removeWindow": async ({ principals, args, services }) => {
    if (isAdmin(principals)) return true;
    const w = typeof args[0] === "string" ? await services.scheduling.getWindow(args[0]) : void 0;
    return !!w && isBarber(principals, w.barberId);
  },
  // citas (el cliente actúa con el token de su enlace)
  "booking.availableTimes": pub,
  "booking.availableTimesByDate": pub,
  "booking.book": pub,
  "booking.getByToken": pub,
  "booking.getOfferByToken": pub,
  "booking.getOfferView": pub,
  "booking.respondOffer": pub,
  "booking.confirmAttendanceByToken": pub,
  "booking.cancelByToken": pub,
  "booking.listByDate": ({ principals, args }) => isAdmin(principals) || isBarber(principals, args[1]),
  "booking.listOffers": ({ principals, args }) => isAdmin(principals) || isBarber(principals, args[1]),
  "booking.listByPhone": ({ principals, args }) => isAdmin(principals) || typeof args[0] === "string" && principals.some((p) => p.role === "customer" && p.sub === normalizePhone(args[0])),
  "booking.listActiveUpcoming": admin,
  "booking.confirmAttendance": adminOrAppointmentBarber,
  "booking.markCompleted": adminOrAppointmentBarber,
  "booking.markNoShow": adminOrAppointmentBarber,
  // Por RPC solo se puede cancelar "como admin" (el cliente usa cancelByToken).
  "booking.cancel": async (ctx) => ctx.args[1] === "admin" && await adminOrAppointmentBarber(ctx),
  // notificaciones
  "notifications.listOutbox": admin,
  "notifications.deliver": admin,
  "notifications.markSent": admin,
  "notifications.getMode": admin,
  "notifications.runReminderTick": admin,
  // accesos de barberos
  "access.setPin": admin,
  "access.hasPin": admin,
  "access.remove": admin,
  // reseñas
  "reviews.summary": pub,
  "reviews.listPublic": pub,
  "reviews.getForAppointment": pub,
  "reviews.submit": pub,
  "reviews.list": admin,
  "reviews.remove": admin,
  // promociones
  "promotions.listActive": pub,
  "promotions.list": admin,
  "promotions.add": admin,
  "promotions.setActive": admin,
  "promotions.remove": admin,
  // cuentas de cliente (login y registro van por /auth)
  "customers.get": ({ principals, args }) => isAdmin(principals) || principals.some((p) => p.role === "customer" && p.sub === args[0])
};

// server/supabase.ts
var ConflictError = class extends Error {
};
var InfraError = class extends Error {
};
var PAGE = 1e3;
var SupabaseCollection = class {
  constructor(cfg, name) {
    this.cfg = cfg;
    this.name = name;
  }
  get endpoint() {
    return `${this.cfg.url.replace(/\/$/, "")}/rest/v1/documents`;
  }
  headers(extra = {}) {
    return { apikey: this.cfg.key, Authorization: `Bearer ${this.cfg.key}`, "content-type": "application/json", ...extra };
  }
  async fail(res, action) {
    const text = await res.text().catch(() => "");
    if (res.status === 409 && text.includes("23505")) throw new ConflictError("Ese horario ya no est\xE1 disponible. Elige otro.");
    throw new InfraError(`Supabase ${action} fall\xF3 (${res.status}): ${text.slice(0, 200)}`);
  }
  async all() {
    const out = [];
    for (let offset = 0; ; offset += PAGE) {
      const url = `${this.endpoint}?collection=eq.${encodeURIComponent(this.name)}&select=data&order=created_at,id&limit=${PAGE}&offset=${offset}`;
      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) await this.fail(res, "leer");
      const rows = await res.json();
      out.push(...rows.map((r) => r.data));
      if (rows.length < PAGE) return out;
    }
  }
  async get(id) {
    const url = `${this.endpoint}?collection=eq.${encodeURIComponent(this.name)}&id=eq.${encodeURIComponent(id)}&select=data&limit=1`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) await this.fail(res, "leer");
    const rows = await res.json();
    return rows[0]?.data;
  }
  async put(item) {
    const res = await fetch(`${this.endpoint}?on_conflict=collection,id`, {
      method: "POST",
      headers: this.headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ collection: this.name, id: item.id, data: item })
    });
    if (!res.ok) await this.fail(res, "guardar");
  }
  async remove(id) {
    const url = `${this.endpoint}?collection=eq.${encodeURIComponent(this.name)}&id=eq.${encodeURIComponent(id)}`;
    const res = await fetch(url, { method: "DELETE", headers: this.headers() });
    if (!res.ok) await this.fail(res, "borrar");
  }
};

// server/rpc.ts
var fail = (status, error, extra = {}) => ({ status, body: { ok: false, error, ...extra } });
var ok = (result) => ({ status: 200, body: { ok: true, result } });
var isDomainError = (e) => e instanceof ConflictError || e instanceof Error && e.constructor === Error;
function createRpc(opts) {
  const clock = opts.clock ?? { now: () => /* @__PURE__ */ new Date() };
  const services = (headers) => createServices({ collection: opts.collection, clock, channel: opts.channel(), baseUrl: () => opts.baseUrl(headers) });
  const principalsOf = (headers) => (headers["x-auth"] ?? "").split(",").map((t) => t.trim()).filter(Boolean).map((t) => verifyToken(t, opts.secret, clock.now().getTime())).filter((p) => !!p);
  async function auth(s, method, args) {
    const guard = new LoginGuard(opts.collection("auth-attempts"), () => clock.now().getTime());
    const issue = (role, sub, extra = {}) => ok({ token: signToken({ role, sub }, opts.secret, TOKEN_TTL[role], clock.now().getTime()), ...extra });
    const attempt = async (key, check, message) => {
      await guard.assertOpen(key);
      if (!await check()) {
        await guard.fail(key);
        throw new Error(message);
      }
      await guard.ok(key);
    };
    switch (method) {
      case "adminLogin": {
        if (!opts.adminPin) throw new Error("El servidor no tiene ADMIN_PIN configurado");
        await attempt("admin", async () => safeEqual(String(args[0] ?? ""), opts.adminPin), "PIN incorrecto");
        return issue("admin", "admin");
      }
      case "barberLogin": {
        const [barberId, pin] = [String(args[0] ?? ""), String(args[1] ?? "")];
        await attempt(`barber:${barberId}`, async () => !!await s.catalog.getBarber(barberId) && await s.access.verify(barberId, pin), "PIN incorrecto o sin PIN asignado");
        return issue("barber", barberId);
      }
      case "customerLogin": {
        const [phone, pin] = [String(args[0] ?? ""), String(args[1] ?? "")];
        const key = `customer:${phone.replace(/\D/g, "")}`;
        let customer;
        await attempt(
          key,
          async () => {
            try {
              customer = await s.customers.login(phone, pin);
              return true;
            } catch {
              return false;
            }
          },
          "WhatsApp o PIN incorrectos"
        );
        return issue("customer", customer.id, { customer });
      }
      case "customerRegister": {
        const customer = await s.customers.register(args[0]);
        return issue("customer", customer.id, { customer });
      }
      default:
        return fail(404, "M\xE9todo de autenticaci\xF3n desconocido");
    }
  }
  async function handleRpc(req) {
    if (req.method !== "POST") return fail(405, "M\xE9todo no permitido");
    const b = req.body;
    if (!b || typeof b.service !== "string" || typeof b.method !== "string") return fail(400, "Solicitud inv\xE1lida");
    const args = Array.isArray(b.args) ? b.args : [];
    try {
      const s = services(req.headers);
      if (b.service === "auth") return await auth(s, b.method, args);
      const key = `${b.service}.${b.method}`;
      const rule = Object.hasOwn(POLICY, key) ? POLICY[key] : void 0;
      if (!rule) return fail(403, "Operaci\xF3n no permitida");
      const principals = principalsOf(req.headers);
      if (!await rule({ principals, args, services: s })) {
        return principals.length ? fail(403, "No tienes permiso para esto") : fail(401, "Inicia sesi\xF3n para continuar");
      }
      const target = s[b.service];
      const fn = target?.[b.method];
      if (typeof fn !== "function") return fail(404, "Operaci\xF3n desconocida");
      return ok(await fn.apply(target, args));
    } catch (e) {
      if (e instanceof RatingRequiredError) return fail(409, e.message, { code: "RATING_REQUIRED", token: e.token });
      if (isDomainError(e)) return fail(400, e.message);
      console.error("[rpc]", b.service, b.method, e);
      return fail(500, "Error interno del servidor");
    }
  }
  async function handleCron(req) {
    if (!opts.cronSecret) return fail(503, "CRON_SECRET no configurado");
    const given = (req.headers["authorization"] ?? "").replace(/^Bearer\s+/i, "");
    if (!safeEqual(given, opts.cronSecret)) return fail(401, "No autorizado");
    try {
      const queued = await services(req.headers).notifications.runReminderTick();
      return ok({ queued });
    } catch (e) {
      console.error("[cron]", e);
      return fail(500, "Error interno del servidor");
    }
  }
  return { handleRpc, handleCron };
}

// server/env.ts
var REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "AUTH_SECRET", "ADMIN_PIN"];
function createRpcFromEnv(env) {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) {
    const msg = `Servidor sin configurar: faltan ${missing.join(", ")}`;
    const fail2 = async () => ({ status: 503, body: { ok: false, error: msg } });
    return { handleRpc: fail2, handleCron: fail2 };
  }
  if (env.AUTH_SECRET.length < 24) {
    const fail2 = async () => ({ status: 503, body: { ok: false, error: "AUTH_SECRET debe tener al menos 24 caracteres" } });
    return { handleRpc: fail2, handleCron: fail2 };
  }
  let origin;
  try {
    origin = new URL(env.SUPABASE_URL.trim()).origin;
  } catch {
    const fail2 = async () => ({ status: 503, body: { ok: false, error: "SUPABASE_URL no es una URL v\xE1lida" } });
    return { handleRpc: fail2, handleCron: fail2 };
  }
  const cfg = { url: origin, key: env.SUPABASE_SERVICE_KEY.trim() };
  return createRpc({
    collection: (name) => new SupabaseCollection(cfg, name),
    secret: env.AUTH_SECRET,
    adminPin: env.ADMIN_PIN,
    cronSecret: env.CRON_SECRET,
    channel: () => env.WHATSAPP_MODE === "cloud" && env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID ? new WhatsAppCloudChannel({ token: env.WHATSAPP_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID }) : new ManualChannel(),
    baseUrl: (h) => {
      if (env.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL.replace(/\/$/, "");
      const host = h["x-forwarded-host"] ?? h["host"] ?? "localhost";
      const proto = h["x-forwarded-proto"] ?? (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  });
}

// server/node.ts
var MAX_BODY = 1e5;
async function readBody(req) {
  const pre = req.body;
  if (pre !== void 0) return typeof pre === "string" ? safeParse(pre) : pre;
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
    size += buf.length;
    if (size > MAX_BODY) throw new Error("Cuerpo demasiado grande");
    chunks.push(buf);
  }
  return safeParse(Buffer.concat(chunks).toString("utf8"));
}
var safeParse = (s) => {
  try {
    return s ? JSON.parse(s) : void 0;
  } catch {
    return void 0;
  }
};
function nodeHandler(fn) {
  return async (req, res) => {
    let out;
    try {
      const headers = {};
      for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v.join(",") : v;
      out = await fn({ method: req.method ?? "GET", headers, body: await readBody(req) });
    } catch (e) {
      out = { status: 400, body: { ok: false, error: e instanceof Error ? e.message : "Solicitud inv\xE1lida" } };
    }
    res.statusCode = out.status;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify(out.body));
  };
}

// server/entry/vercel-cron.ts
var rpc = createRpcFromEnv(process.env);
var vercel_cron_default = nodeHandler((r) => rpc.handleCron(r));
export {
  vercel_cron_default as default
};
