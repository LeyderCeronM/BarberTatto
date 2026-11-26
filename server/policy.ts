import { normalizePhone } from '../src/shared/kernel/time';
import type { Services } from '../src/app/services';
import type { Principal } from './auth';

export interface RuleCtx {
  principals: Principal[];
  args: unknown[];
  services: Services;
}
export type Rule = (ctx: RuleCtx) => boolean | Promise<boolean>;

const isAdmin = (ps: Principal[]) => ps.some((p) => p.role === 'admin');
const isBarber = (ps: Principal[], id: unknown) => typeof id === 'string' && ps.some((p) => p.role === 'barber' && p.sub === id);

const pub: Rule = () => true;
const admin: Rule = ({ principals }) => isAdmin(principals);
/** Admin, o el barbero cuyo id viene en el argumento `i`. */
const adminOrBarberArg =
  (i: number): Rule =>
  ({ principals, args }) =>
    isAdmin(principals) || isBarber(principals, args[i]);

/** Admin, o el barbero dueño de la cita cuyo id viene en el argumento 0. */
const adminOrAppointmentBarber: Rule = async ({ principals, args, services }) => {
  if (isAdmin(principals)) return true;
  if (typeof args[0] !== 'string') return false;
  const a = await services.booking.getAppointment(args[0]);
  return !!a && isBarber(principals, a.barberId);
};

/**
 * Qué se puede llamar desde el navegador y quién puede hacerlo. TODO lo que no esté aquí
 * se rechaza (por ejemplo findUnrated, getAppointment o isEmpty son solo internos).
 */
export const POLICY: Record<string, Rule> = {
  // catálogo
  'catalog.services': pub,
  'catalog.barbers': pub,
  'catalog.getService': pub,
  'catalog.getBarber': pub,
  'catalog.addBarber': admin,
  'catalog.updateBarber': admin,
  'catalog.removeBarber': admin,

  // horarios
  'scheduling.windowsFor': pub,
  'scheduling.listWindows': pub,
  'scheduling.getWeekly': adminOrBarberArg(0),
  'scheduling.saveWeekly': adminOrBarberArg(0),
  'scheduling.applyWeekly': adminOrBarberArg(0),
  'scheduling.addWindow': adminOrBarberArg(0),
  'scheduling.openDay': adminOrBarberArg(0),
  'scheduling.openBusinessHours': adminOrBarberArg(0),
  'scheduling.clearDay': adminOrBarberArg(0),
  'scheduling.clearBarber': admin,
  'scheduling.removeWindow': async ({ principals, args, services }) => {
    if (isAdmin(principals)) return true;
    const w = typeof args[0] === 'string' ? await services.scheduling.getWindow(args[0]) : undefined;
    return !!w && isBarber(principals, w.barberId);
  },

  // citas (el cliente actúa con el token de su enlace)
  'booking.availableTimes': pub,
  'booking.availableTimesByDate': pub,
  'booking.book': pub,
  'booking.getByToken': pub,
  'booking.getOfferByToken': pub,
  'booking.getOfferView': pub,
  'booking.respondOffer': pub,
  'booking.confirmAttendanceByToken': pub,
  'booking.cancelByToken': pub,
  'booking.listByDate': ({ principals, args }) => isAdmin(principals) || isBarber(principals, args[1]),
  'booking.listOffers': ({ principals, args }) => isAdmin(principals) || isBarber(principals, args[1]),
  'booking.listByPhone': ({ principals, args }) =>
    isAdmin(principals) || (typeof args[0] === 'string' && principals.some((p) => p.role === 'customer' && p.sub === normalizePhone(args[0] as string))),
  'booking.listActiveUpcoming': admin,
  'booking.confirmAttendance': adminOrAppointmentBarber,
  'booking.markCompleted': adminOrAppointmentBarber,
  'booking.markNoShow': adminOrAppointmentBarber,
  // Por RPC solo se puede cancelar "como admin" (el cliente usa cancelByToken).
  'booking.cancel': async (ctx) => ctx.args[1] === 'admin' && (await adminOrAppointmentBarber(ctx)),

  // notificaciones
  'notifications.listOutbox': admin,
  'notifications.deliver': admin,
  'notifications.markSent': admin,
  'notifications.getMode': admin,
  'notifications.runReminderTick': admin,

  // accesos de barberos
  'access.setPin': admin,
  'access.hasPin': admin,
  'access.remove': admin,

  // reseñas
  'reviews.summary': pub,
  'reviews.listPublic': pub,
  'reviews.getForAppointment': pub,
  'reviews.submit': pub,
  'reviews.list': admin,
  'reviews.remove': admin,

  // promociones
  'promotions.listActive': pub,
  'promotions.list': admin,
  'promotions.add': admin,
  'promotions.setActive': admin,
  'promotions.remove': admin,

  // cuentas de cliente (login y registro van por /auth)
  'customers.get': ({ principals, args }) => isAdmin(principals) || principals.some((p) => p.role === 'customer' && p.sub === args[0]),
};
