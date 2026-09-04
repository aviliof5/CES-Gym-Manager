-- Bolá — check-in real (sección 13 del pedido original de Fight Club).
--
-- `public.checkins` (de la migración base) es un agregado por hora
-- (gym_id, day_of_week, hour, count) — sirve para un mapa de calor, no para
-- "hoy a las 14:32 entró Fulano". Esta tabla nueva es el registro por
-- evento individual; `checkins` queda intacta, sin tocar.
--
-- Igual que confirm_cash_payment(): la única forma de escribir acá es la
-- función check_in_client(), que exige app_role_is_staff() en el servidor
-- — el cliente nunca puede registrar su propio check-in escaneando "su"
-- código, el QR es solo un identificador visual, nunca una credencial de
-- escritura (ver docs/SECURITY_AUDIT.md riesgo 2, que ya señalaba esto).

create table public.checkin_events (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  client_user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  checked_in_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index checkin_events_client_idx on public.checkin_events(client_user_id, created_at desc);
create index checkin_events_gym_idx on public.checkin_events(gym_id, created_at desc);

alter table public.checkin_events enable row level security;

create policy "self reads own checkins" on public.checkin_events
  for select to authenticated
  using (client_user_id = auth.uid());

create policy "staff reads checkins in their gym" on public.checkin_events
  for select to authenticated
  using (public.app_role_is_staff() and gym_id = public.app_gym_id());

-- Sin política de insert/update/delete: check_in_client() corre como el
-- dueño de la función y no está sujeta a este RLS, igual que
-- create_cash_charge()/confirm_cash_payment() con `payments`.

create or replace function public.check_in_client(p_client_user_id uuid)
returns public.checkin_events
language plpgsql security definer set search_path = public as $$
declare
  v_client_gym_id uuid;
  v_row public.checkin_events;
begin
  if not public.app_role_is_staff() then
    raise exception 'Solo el administrador o el dueño del gimnasio registran un check-in.';
  end if;

  select gym_id into v_client_gym_id from public.client_profiles where user_id = p_client_user_id;
  if v_client_gym_id is null or v_client_gym_id is distinct from public.app_gym_id() then
    raise exception 'Ese cliente no pertenece a tu gimnasio.';
  end if;

  insert into public.checkin_events (gym_id, client_user_id, checked_in_by)
  values (v_client_gym_id, p_client_user_id, auth.uid())
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.check_in_client(uuid) to authenticated;
