-- ============================================================================
-- Barber Tattoo — esquema de base de datos (Supabase / Postgres)
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO este archivo → Run.
-- Es seguro ejecutarlo más de una vez.
--
-- Modelo: una sola tabla `documents` donde cada fila es una entidad de la app
-- (cita, cliente, reseña…) identificada por (collection, id). Los datos viven en `data` (jsonb).
-- ============================================================================

create table if not exists public.documents (
  collection text        not null,
  id         text        not null,
  data       jsonb       not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

-- Bases creadas con una versión anterior del esquema
alter table public.documents add column if not exists created_at timestamptz not null default now();

-- SEGURIDAD: RLS activado y SIN políticas = el navegador (clave anon) no puede leer ni escribir
-- nada. Solo el servidor, con la clave service_role (que se salta RLS), accede a los datos.
alter table public.documents enable row level security;
revoke all on public.documents from anon, authenticated;
grant all on public.documents to service_role;

create or replace function public.documents_touch() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists documents_touch on public.documents;
create trigger documents_touch before update on public.documents
  for each row execute function public.documents_touch();

-- Evita doble reserva: no puede haber dos citas ACTIVAS del mismo barbero, fecha y hora de inicio,
-- aunque dos clientes reserven en el mismo instante. (El solape parcial lo valida la aplicación.)
create unique index if not exists documents_active_slot
  on public.documents ((data->>'barberId'), (data->>'date'), (data->>'startMin'))
  where collection = 'appointments' and (data->>'status') in ('booked', 'confirmed');
