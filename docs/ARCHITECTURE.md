# Arquitectura: monolito modular

Una sola aplicación desplegable, dividida en módulos con fronteras claras. Cada módulo tiene su dominio, sus servicios de aplicación y, si aplica, su UI; **solo se comunica con otros por su `index.ts` (API pública) o por eventos de dominio**.

```
src/
  app/            composition root (container.ts), rutas, estilos
  shared/         kernel: EventBus, Collection (puerto de persistencia), tiempo, config
  modules/
    catalog/        servicios y barberos            (no depende de nadie)
    scheduling/     franjas que abre el admin + cálculo de horarios (→ shared)
    booking/        citas, estados, cancelación, ofertas de adelanto (→ catalog, scheduling)
    notifications/  bandeja WhatsApp, plantillas, recordatorios (→ booking)
    admin/          panel (UI que orquesta los demás)
    landing/        página pública
server/           API (RPC) que corre en Vercel/Netlify/Vite: permisos, sesiones y adaptador Supabase
api/              funciones de Vercel ya empaquetadas (generadas con `npm run build:api`)
supabase/         esquema SQL y archivos de la base local de Docker
```

Dependencias permitidas (flecha = "puede importar"): `admin → * ` · `notifications → booking → scheduling, catalog` · `scheduling, catalog → shared`.
`booking` **nunca** importa `notifications`: le avisa con eventos.

## Patrones aplicados

- **Repository / Ports & Adapters** — `Collection<T>` es el puerto; `LocalCollection` y `MemoryCollection` son adaptadores. Es async a propósito para poder enchufar una base de datos real.
- **Domain Events + Event Bus** — `AppointmentBooked`, `AppointmentCancelled`, `SlotFreed`, `AppointmentAdvanced`… (`shared/kernel/events.ts`). Así notifications reacciona sin acoplar booking.
- **Strategy** — `MessageChannel` (`WhatsAppLinkChannel` manual / `WhatsAppCloudChannel` automático).
- **Composition Root** — `app/container.ts` instancia y cablea todo; los servicios reciben dependencias por constructor (testeables con relojes y repos falsos).
- **Servicios de aplicación + funciones puras de dominio** — `scheduling/slots.ts` es lógica pura.

## Flujo clave

```
Cliente reserva ──► booking.book() ──► AppointmentBooked ──► notifications: mensaje de confirmación
                                                         
Tick (cada 15 s)  ──► notifications.runReminderTick(): cita a ≤20 min y sin recordatorio
                      ──► WhatsApp con /cita/:token ──► cliente: "Sí, voy" (confirmed) | "No puedo ir" (cancel)

cancel() ──► AppointmentCancelled ──► offerFreedSlot(): primera cita posterior a la que le quepa
         ──► SlotFreed{offerId} ──► notifications: WhatsApp con /oferta/:token
respondOffer(aceptar) ──► cita adelantada + su hora vieja se ofrece en cascada
respondOffer(rechazar) ──► se ofrece a la siguiente
```

## Siguientes pasos sugeridos (por prioridad)

1. **Backend real**: Supabase (Postgres + Auth + Edge Functions). Implementar `Collection<T>` para cada entidad (`appointments`, `offers`, `availability`, `outbox`) y mover reglas de unicidad (no doble reserva) a una restricción en BD.
2. **Recordatorios en servidor** con cron, para no depender del panel abierto.
3. **WhatsApp Cloud API** con plantillas aprobadas; proteger `/api/whatsapp`.
4. Auth de admin real y multi-barbero (cada barbero ve su agenda).
5. Opción "cualquier barbero", editor de catálogo en el admin, bloqueo de festivos, política de cancelación mínima.
6. Datos de contacto: el sitio original mezcla Bogotá (título, prefijo 601) y Popayán (dirección); y el correo `hola@septimofilo.co` parece residuo de una plantilla. Confirmar los datos reales del negocio.

## Cliente / servidor (RPC)

`src/app/services.ts` arma todos los módulos a partir de una fábrica de colecciones y se usa en dos sitios:

- **Servidor** (`server/rpc.ts`): por cada petición crea los servicios con `SupabaseCollection` (clave `service_role`), comprueba el permiso en `server/policy.ts` y ejecuta el método. Así el mismo código de dominio y los mismos tests sirven en modo demo y en producción.
- **Navegador**: en modo `remote`, `src/app/remote.ts` reemplaza cada servicio por un proxy que envía `{service, method, args}` a `/api/rpc`. En modo `local` usa `LocalCollection` (localStorage).

Para agregar una operación nueva a la interfaz: escribe el método en el servicio y **añádelo a `server/policy.ts`** con la regla de quién puede llamarlo; si no, el servidor lo rechaza.
