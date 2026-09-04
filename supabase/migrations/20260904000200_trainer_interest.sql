-- Bolá — regla de "10 clientes interesados" para aprobar un entrenador
-- (sección 11 del pedido original de Fight Club). Decisión confirmada
-- 2026-09-03: verificable, no auto-declarada — necesita una relación real
-- cliente→candidato, contada del lado servidor, nunca un número que mande
-- el frontend (ver docs/DATABASE_MAP.md gap 3 / docs/SECURITY_AUDIT.md
-- riesgo 3, que ya señalaban esta distinción de antemano).
--
-- El candidato ya existe en `trainers` con status='pending' apenas termina
-- su alta (signUpTrainer + join_gym, sin cambios) — este interés se junta
-- DURANTE ese período pendiente, antes de que el dueño/admin pueda
-- aprobarlo.

create table public.trainer_candidate_interest (
  candidate_user_id uuid not null references public.trainers(user_id) on delete cascade,
  client_user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (candidate_user_id, client_user_id)
);

create index trainer_candidate_interest_candidate_idx on public.trainer_candidate_interest(candidate_user_id);
create index trainer_candidate_interest_gym_idx on public.trainer_candidate_interest(gym_id);

alter table public.trainer_candidate_interest enable row level security;

-- Sin política de insert/delete: igual que payments/checkin_events, la
-- única forma de escribir es a través de las funciones de abajo
-- (security definer), nunca un INSERT/DELETE directo del cliente.
create policy "gym members read trainer interest in their gym" on public.trainer_candidate_interest
  for select to authenticated
  using (gym_id = public.app_gym_id());

create or replace function public.mark_trainer_interest(p_candidate_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_candidate_gym_id uuid;
begin
  if public.app_role() is distinct from 'client' then
    raise exception 'Solo un cliente puede marcar interés en un entrenador candidato.';
  end if;

  select gym_id into v_candidate_gym_id from public.trainers where user_id = p_candidate_user_id;
  if v_candidate_gym_id is null or v_candidate_gym_id is distinct from public.app_gym_id() then
    raise exception 'Ese candidato no pertenece a tu gimnasio.';
  end if;

  insert into public.trainer_candidate_interest (candidate_user_id, client_user_id, gym_id)
  values (p_candidate_user_id, auth.uid(), v_candidate_gym_id)
  on conflict (candidate_user_id, client_user_id) do nothing;
end;
$$;

create or replace function public.unmark_trainer_interest(p_candidate_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.trainer_candidate_interest
    where candidate_user_id = p_candidate_user_id and client_user_id = auth.uid();
end;
$$;

grant execute on function public.mark_trainer_interest(uuid) to authenticated;
grant execute on function public.unmark_trainer_interest(uuid) to authenticated;

-- El cambio que de verdad importa: approve_trainer() ahora cuenta el
-- interés real antes de aprobar — un owner/admin que intente aprobar a un
-- candidato con menos de 10 se encuentra con un error del servidor, sin
-- importar qué muestre o deje de mostrar la UI.
create or replace function public.approve_trainer(p_trainer_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_interest_count integer;
begin
  if not public.app_role_is_staff() then
    raise exception 'Solo el administrador o el dueño del gimnasio aprueban entrenadores.';
  end if;

  select count(*) into v_interest_count
    from public.trainer_candidate_interest
    where candidate_user_id = p_trainer_user_id;

  if v_interest_count < 10 then
    raise exception 'Este candidato todavía no llega a los 10 clientes interesados mínimos (tiene %).', v_interest_count;
  end if;

  update public.trainers
    set status = 'approved'
    where user_id = p_trainer_user_id and gym_id = public.app_gym_id();
end;
$$;
