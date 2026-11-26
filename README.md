# Barber Tattoo — reservas con recordatorio por WhatsApp

Réplica funcional y mejorada de <https://barber-happy-flow-pro.base44.app>, hecha como **monolito modular** en React + TypeScript + Vite, lista para desplegar en Vercel o Netlify.

## Qué hace

- **Cliente**: reserva en 4 pasos (servicio → artesano → horario → datos). Solo ve horarios que el admin abrió y que no están ocupados.
- **Admin** (`/admin`, PIN = `ADMIN_PIN` del servidor):
  - **Disponibilidad**: abre/cierra franjas por barbero y fecha ("horarios que el administrador coloca disponibles").
  - **Equipo**: agrega, edita o elimina a quienes atienden y les asigna un PIN para que entren a `/barbero`.
  - **Agenda**: ve cada cita con su estado (sin confirmar / confirmada / cancelada…) y puede confirmar, cancelar, marcar atendida o "no llegó".
  - **Mensajes WhatsApp**: bandeja de mensajes generados, con botón "Enviar".
- **Inicio**: "Sobre nosotros" (texto en `src/shared/config.ts`), ubicación con enlace "Cómo llegar" a Google Maps, promedio de estrellas y opiniones. **Solo se muestran calificaciones de clientes atendidos**; la página pública no tiene botón para calificar.
- **Calificar después del corte (como InDrive)**: cuando el admin marca la cita como **Atendida**, se genera un WhatsApp con el enlace `/calificar/:token`. Es **obligatorio**: mientras un cliente tenga un servicio atendido sin calificar, no puede reservar de nuevo (se le muestra el enlace). Una calificación por servicio, de 1 a 5 estrellas más comentario opcional, y **no se puede editar**. Solo el admin puede eliminar reseñas (pestaña **Calificaciones**).
- **Cuenta de cliente** (`/cuenta`, enlace "Mi cuenta" en el inicio): se crea con WhatsApp + PIN (el mismo número con el que reserva) y muestra su historial de citas, **servicios y cortes atendidos, total pagado, promedio por visita, cortes por mes (gráfico de 6 meses)**, favoritos (barbero y servicio), próxima cita, calificaciones pendientes, **promociones activas** y progreso del **programa de fidelidad** (cada 10 cortes ganan un corte gratis; configurable en `src/shared/config.ts`). Al reservar con sesión iniciada se precargan sus datos.
- **Cobro real**: al marcar una cita como **Atendida** el admin registra el monto cobrado (sugiere el precio de lista; sirve para descuentos y servicios "Consultar"). Las estadísticas suman lo realmente cobrado.
- **Promociones**: el admin las publica, pausa o elimina en la pestaña **Promociones**.
- **Cada barbero define su horario** (`/barbero`, con el PIN que le da el admin): horario semanal que se repite (días y horas propios) que aplica a las próximas 1–8 semanas, más ajustes por día. Solo ve su propia agenda y horario. El admin puede editar el de cualquiera.
- **Recordatorio a los 20 min**: cuando faltan ≤ 20 min, se genera un WhatsApp con un enlace `/cita/:token` donde el cliente pulsa **"Sí, voy"** o **"No puedo ir"**. El admin lo ve reflejado. Si el cliente reservó con menos de 20 min de anticipación, el recordatorio sale de inmediato.
- **Cancelación → adelantar al siguiente**: si alguien cancela, el hueco se ofrece a la siguiente cita del mismo barbero (enlace `/oferta/:token`). Si acepta, se mueve y **su hora anterior se ofrece en cascada** a la que sigue; si rechaza, pasa a la siguiente.

## Arrancar en tu PC (con base de datos local)

Necesitas Docker Desktop. Una sola vez, y luego siempre igual:

```powershell
docker compose --profile db up -d postgres postgrest gateway dev
```

Abre <http://localhost:5173>. Los datos quedan guardados en un volumen de Docker (sobreviven a reinicios).
El archivo `.env` ya trae la configuración local; el PIN de admin local es `1234`.

```powershell
docker compose --profile db down        # detener (los datos se conservan)
docker compose --profile db down -v     # detener y BORRAR todos los datos locales
npm test                                # 42 pruebas (lógica, permisos y API)
```

Sin Docker también puedes usar el modo demo solo en el navegador (`VITE_BACKEND=local` en `.env`, `npm run dev`): todo se guarda en `localStorage` de ese navegador.

## Poner la base de datos en la nube (Supabase)

Esto lo haces tú (necesita tu cuenta); el código ya está listo.

1. Crea una cuenta y un proyecto en <https://supabase.com> (plan gratis). Guarda la contraseña de la base.
2. En el proyecto: **SQL Editor → New query**, pega todo el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**. Crea la tabla `documents` con acceso cerrado al público.
3. En **Project Settings → API** copia dos valores:
   - **Project URL** → `SUPABASE_URL`
   - clave **service_role** (¡secreta!) → `SUPABASE_SERVICE_KEY`
4. Genera un secreto para las sesiones: `node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"` → `AUTH_SECRET`.
5. Elige un `ADMIN_PIN` que no sea obvio y un `CRON_SECRET` aleatorio.
6. Para probar desde tu PC contra Supabase: pon esos valores en `.env` y arranca con `npm run dev` (o `docker compose up dev`).

> **Nunca** pongas `SUPABASE_SERVICE_KEY`, `AUTH_SECRET` ni `ADMIN_PIN` con prefijo `VITE_` ni los subas a git: darían acceso total a los datos.

## Desplegar

Las variables del paso anterior (más `VITE_BACKEND=remote`) se configuran en el panel del hosting.

- **Vercel**: importa el repo. Las funciones `api/rpc.js` y `api/cron.js` ya están empaquetadas; si cambias algo en `server/` ejecuta `npm run build:api` y sube los archivos generados (`npm run build` también los regenera).
- **Netlify**: `netlify/functions/rpc.ts` y `cron.ts` sirven `/api/rpc` y `/api/cron`.

> Pendiente de probar: el despliegue real en Vercel/Netlify (el código de servidor se probó con tests, con el bundle de Vercel ejecutado en Node y contra Postgres real, pero no en esas plataformas).

### Recordatorios a los 20 minutos (cron)

Un cron externo debe llamar cada minuto a `GET https://TU-SITIO/api/cron` con el encabezado `Authorization: Bearer <CRON_SECRET>` (por ejemplo, <https://cron-job.org>, gratis). El plan gratis de Vercel solo permite crons diarios, por eso se recomienda uno externo. Mientras el panel admin esté abierto, también revisa solo cada 15 s.

## Cómo se protegen los datos

- El navegador **nunca** habla con la base de datos: llama a `/api/rpc` y el servidor decide (lista de operaciones permitidas y quién puede hacerlas en [`server/policy.ts`](server/policy.ts); todo lo no listado se rechaza).
- La tabla tiene RLS activado sin políticas: la clave pública de Supabase no puede leer ni escribir nada (hay una prueba que lo verifica).
- Sesiones firmadas con vencimiento (admin y barbero 12 h, cliente 7 días). Tras 5 PIN incorrectos seguidos, 15 minutos de bloqueo.
- Los PIN se guardan con hash (PBKDF2). Los clientes actúan con el enlace/token de su cita; nadie puede listar las citas de otros.
- Un índice único en la base impide dos citas activas a la misma hora aunque reserven en el mismo instante.

## Lo que falta para producción

| Tema | Estado | Qué falta |
|---|---|---|
| Verificar el WhatsApp del cliente | Al crear cuenta no se comprueba que el número sea suyo: alguien que conozca el número de otra persona podría crearle la cuenta antes | Código de verificación (OTP) por WhatsApp/SMS |
| WhatsApp automático | Modo manual: el admin pulsa "Enviar" y se abre WhatsApp con el texto listo | `WHATSAPP_MODE=cloud` con WhatsApp Cloud API; para mensajes iniciados por el negocio Meta exige **plantillas aprobadas** |
| Admin | PIN único | Cuentas de admin individuales (Supabase Auth) |
| Rendimiento | Cada operación lee colecciones completas | Consultas filtradas en la base si el volumen crece (miles de citas) |

Ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para la estructura y los patrones.
