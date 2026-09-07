-- Bolá — precio por evento + notificaciones a los clientes cuando dueño/
-- admin crea un evento del calendario (ver src/screens/owner.js
-- "Calendario", PR anterior: 20260908... no, este es el de calendario de
-- eventos — createEvent en actions.js).
--
-- Notificación = fila por cliente (no una tabla "broadcast" + lectura por
-- separado): con la cantidad de socios que tiene un gimnasio, insertar una
-- fila por cliente es liviano y deja el estado leído/no leído como una sola
-- columna en la misma fila, sin tabla aparte ni JOIN para saber si ya la
-- vio. Se crean con notify_gym_clients() (security definer, solo staff),
-- nunca con un INSERT directo desde el frontend — evita que cualquiera
-- pueda mandarle notificaciones a los clientes de un gimnasio ajeno.

alter table public.classes add column if not exists price numeric(10,2);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  client_user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  title text not null,
  body text,
  type text not null default 'event_created',
  related_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_client_idx on public.notifications(client_user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "self reads own notifications" on public.notifications
  for select to authenticated using (client_user_id = auth.uid());

-- Solo para marcar leída (read_at) — sin política de INSERT: las filas
-- nuevas SOLO las crea notify_gym_clients() de abajo.
create policy "self marks own notifications read" on public.notifications
  for update to authenticated using (client_user_id = auth.uid()) with check (client_user_id = auth.uid());

create or replace function public.notify_gym_clients(p_title text, p_body text, p_type text, p_related_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_gym_id uuid;
  v_count integer;
begin
  if not public.app_role_is_staff() then
    raise exception 'Solo el dueño o administrador puede enviar notificaciones.';
  end if;
  v_gym_id := public.app_gym_id();

  insert into public.notifications (gym_id, client_user_id, title, body, type, related_id)
  select v_gym_id, cp.user_id, p_title, p_body, p_type, p_related_id
  from public.client_profiles cp
  where cp.gym_id = v_gym_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.notify_gym_clients(text, text, text, uuid) to authenticated;
