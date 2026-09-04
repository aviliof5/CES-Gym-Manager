-- Bolá — rol "dueño", parte 2/2: funciones y RLS.
-- Requiere que la parte 1 (20260903000000_owner_role_1_types.sql) ya haya
-- sido ejecutada y CONFIRMADA por separado (ver el comentario ahí).
--
-- El dueño crea el gimnasio (lo que antes hacía "admin") y aprueba a los
-- administradores que se unen a ESE gimnasio ya creado — mismo patrón que
-- ya existía para entrenadores (trainers.status / approve_trainer()), acá
-- espejado con la tabla `gym_admins` de la parte 1.
--
-- El dueño tiene paridad total con el administrador (ve y hace todo lo que
-- el admin ve y hace) además de la aprobación — de ahí `app_role_is_staff()`,
-- que reemplaza los chequeos `app_role() = 'admin'` de políticas/funciones
-- que antes eran exclusivas del admin y ahora las comparte con el dueño.

-- ---------- helper: ¿es staff con acceso de nivel admin (admin u owner)? ----------

create or replace function public.app_role_is_staff()
returns boolean
language sql security definer stable set search_path = public as $$
  select public.app_role() in ('admin', 'owner');
$$;

-- ---------- alta de cuenta: admin ahora también aplica pendiente ----------
-- owner no necesita fila en una tabla aparte — su único dato extra (el
-- gimnasio) ya vive en gyms.owner_user_id, seteado por create_gym().

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role user_role := coalesce((new.raw_user_meta_data->>'role')::user_role, 'client');
begin
  insert into public.profiles (id, role, name, email, phone)
  values (
    new.id, v_role,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.email,
    new.raw_user_meta_data->>'phone'
  );

  if v_role = 'trainer' then
    insert into public.trainers (user_id, specialty, price, status)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'specialty', 'General'),
      coalesce((new.raw_user_meta_data->>'price')::numeric, 0),
      'pending'
    );
  elsif v_role = 'client' then
    insert into public.client_profiles (user_id) values (new.id);
  elsif v_role = 'admin' then
    insert into public.gym_admins (user_id, status) values (new.id, 'pending');
  end if;

  return new;
end;
$$;

-- ---------- create_gym: ahora exclusivo del dueño ----------

create or replace function public.create_gym(p_name text, p_address text, p_hours text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_gym_id uuid;
begin
  if public.app_role() is distinct from 'owner' then
    raise exception 'Solo una cuenta de dueño puede crear un gimnasio.';
  end if;
  if public.app_gym_id() is not null then
    raise exception 'Esta cuenta ya tiene un gimnasio asignado.';
  end if;

  insert into public.gyms (name, address, hours, owner_user_id)
  values (p_name, p_address, p_hours, auth.uid())
  returning id into v_gym_id;

  update public.profiles set gym_id = v_gym_id where id = auth.uid();

  return v_gym_id;
end;
$$;

-- ---------- join_gym: ahora también el administrador se une así ----------

create or replace function public.join_gym(p_gym_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() is null or public.app_role() not in ('trainer', 'client', 'admin') then
    raise exception 'Solo entrenadores, clientes y administradores se unen a un gimnasio con esta función.';
  end if;
  if public.app_gym_id() is not null then
    raise exception 'Esta cuenta ya pertenece a un gimnasio.';
  end if;
  if not exists (select 1 from public.gyms where id = p_gym_id) then
    raise exception 'Ese gimnasio no existe.';
  end if;

  update public.profiles set gym_id = p_gym_id where id = auth.uid();
  update public.trainers set gym_id = p_gym_id where user_id = auth.uid();
  update public.client_profiles set gym_id = p_gym_id where user_id = auth.uid();
  update public.gym_admins set gym_id = p_gym_id where user_id = auth.uid();
end;
$$;

-- ---------- aprobación de administrador (solo el dueño) ----------

create or replace function public.approve_admin(p_admin_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() is distinct from 'owner' then
    raise exception 'Solo el dueño del gimnasio aprueba administradores.';
  end if;
  update public.gym_admins
    set status = 'approved'
    where user_id = p_admin_user_id and gym_id = public.app_gym_id();
end;
$$;

create or replace function public.reject_admin(p_admin_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() is distinct from 'owner' then
    raise exception 'Solo el dueño del gimnasio rechaza administradores.';
  end if;
  update public.gym_admins
    set status = 'rejected'
    where user_id = p_admin_user_id and gym_id = public.app_gym_id();
end;
$$;

grant execute on function public.approve_admin(uuid) to authenticated;
grant execute on function public.reject_admin(uuid) to authenticated;

-- ---------- aprobación de entrenador y cobros: ahora también el dueño ----------

create or replace function public.approve_trainer(p_trainer_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.app_role_is_staff() then
    raise exception 'Solo el administrador o el dueño del gimnasio aprueban entrenadores.';
  end if;
  update public.trainers
    set status = 'approved'
    where user_id = p_trainer_user_id and gym_id = public.app_gym_id();
end;
$$;

create or replace function public.reject_trainer(p_trainer_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.app_role_is_staff() then
    raise exception 'Solo el administrador o el dueño del gimnasio rechazan entrenadores.';
  end if;
  update public.trainers
    set status = 'rejected'
    where user_id = p_trainer_user_id and gym_id = public.app_gym_id();
end;
$$;

create or replace function public.create_cash_charge(p_client_user_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_amount numeric(10,2);
  v_gym_id uuid;
  v_payment_id uuid;
begin
  if not public.app_role_is_staff() then
    raise exception 'Solo el administrador o el dueño del gimnasio generan un cobro.';
  end if;

  select coalesce(p.price, 0) + coalesce(t.price, 0), cp.gym_id
    into v_amount, v_gym_id
    from public.client_profiles cp
    left join public.plans p on p.id = cp.plan_id
    left join public.trainers t on t.user_id = cp.trainer_user_id
    where cp.user_id = p_client_user_id;

  if v_gym_id is null or v_gym_id is distinct from public.app_gym_id() then
    raise exception 'Ese cliente no pertenece a tu gimnasio.';
  end if;

  insert into public.payments (client_user_id, gym_id, amount, status)
  values (p_client_user_id, v_gym_id, v_amount, 'pending')
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

create or replace function public.confirm_cash_payment(p_payment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments%rowtype;
begin
  if not public.app_role_is_staff() then
    raise exception 'Solo el staff del gimnasio puede confirmar un cobro.';
  end if;

  select * into v_payment from public.payments where id = p_payment_id;
  if v_payment.id is null or v_payment.gym_id is distinct from public.app_gym_id() then
    raise exception 'No autorizado para este cobro.';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Este cobro ya fue procesado.';
  end if;

  update public.payments
    set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
    where id = p_payment_id;

  update public.client_profiles
    set membership_status = 'al_dia',
        last_payment_at = now(),
        membership_expires_at = current_date + interval '30 days'
    where user_id = v_payment.client_user_id;
end;
$$;

create or replace function public.cancel_cash_payment(p_payment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_gym_id uuid;
  v_status payment_status;
begin
  if not public.app_role_is_staff() then
    raise exception 'Solo el staff del gimnasio puede cancelar un cobro.';
  end if;

  select gym_id, status into v_gym_id, v_status from public.payments where id = p_payment_id;
  if v_gym_id is null or v_gym_id is distinct from public.app_gym_id() then
    raise exception 'No autorizado para este cobro.';
  end if;
  if v_status <> 'pending' then
    raise exception 'Este cobro ya fue procesado.';
  end if;

  update public.payments set status = 'cancelled' where id = p_payment_id;
end;
$$;

-- ---------- migración de datos ----------
-- CORREGIDO 2026-09-03 tras aplicar esta migración por primera vez: la
-- versión original de este bloque hacía `select owner_user_id from
-- public.gyms limit 1` sin ningún criterio — asumía (incorrectamente) que
-- solo existía un gimnasio real en producción. En los hechos había DOS
-- gimnasios (uno de prueba, uno real de un cliente externo) y ese `limit 1`
-- sin `order by` agarró uno arbitrario — promovió a 'owner' una cuenta de
-- prueba en vez del dueño real. Se corrigió a mano en el SQL Editor
-- (revertida esa cuenta a 'admin') y se reescribe acá el bloque para que
-- promueva a TODOS los dueños de gimnasio existentes, no solo a uno — así
-- funciona igual de bien con 1 gimnasio que con varios (correcto para un
-- sistema multi-tenant real). El rol es inmutable por trigger
-- (profiles_role_immutable), así que se desactiva puntualmente para este
-- UPDATE.

do $$
begin
  alter table public.profiles disable trigger profiles_role_immutable;
  update public.profiles p
    set role = 'owner'
    from public.gyms g
    where g.owner_user_id = p.id and p.role = 'admin';
  alter table public.profiles enable trigger profiles_role_immutable;
end $$;

-- ---------- RLS: gym_admins ----------

create policy "owner reads admins in their gym" on public.gym_admins
  for select to authenticated
  using (
    (gym_id = public.app_gym_id() and public.app_role() = 'owner')
    or user_id = auth.uid()
  );

create policy "admin creates own application" on public.gym_admins
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

create policy "owner edits admins in their gym" on public.gym_admins
  for update to authenticated
  using (public.app_role() = 'owner' and gym_id = public.app_gym_id());

-- ---------- RLS: gyms — insert ahora exige rol dueño ----------

drop policy "admin creates their own gym" on public.gyms;
create policy "owner creates their own gym" on public.gyms
  for insert to authenticated
  with check (owner_user_id = auth.uid() and public.app_role() = 'owner');

-- ---------- RLS: equipment/plans/client_profiles/trainers/payments/checkins ----------
-- Mismas políticas de antes, solo que el chequeo de rol pasa de
-- "= 'admin'" a "app_role_is_staff()" (admin U owner).

drop policy "admin manages equipment" on public.equipment;
create policy "staff manages equipment" on public.equipment
  for all to authenticated
  using (gym_id = public.app_gym_id() and public.app_role_is_staff())
  with check (gym_id = public.app_gym_id() and public.app_role_is_staff());

drop policy "admin manages plans" on public.plans;
create policy "staff manages plans" on public.plans
  for all to authenticated
  using (gym_id = public.app_gym_id() and public.app_role_is_staff())
  with check (gym_id = public.app_gym_id() and public.app_role_is_staff());

drop policy "gym members read approved trainers" on public.trainers;
create policy "gym members read approved trainers" on public.trainers
  for select to authenticated
  using (
    (gym_id = public.app_gym_id() and status = 'approved')
    or user_id = auth.uid()
    or (public.app_role_is_staff() and gym_id = public.app_gym_id())
  );

drop policy "admin edits trainers in their gym" on public.trainers;
create policy "staff edits trainers in their gym" on public.trainers
  for update to authenticated
  using (public.app_role_is_staff() and gym_id = public.app_gym_id());

drop policy "admin reads clients in their gym" on public.client_profiles;
create policy "staff reads clients in their gym" on public.client_profiles
  for select to authenticated
  using (public.app_role_is_staff() and gym_id = public.app_gym_id());

drop policy "admin reads payments in their gym" on public.payments;
create policy "staff reads payments in their gym" on public.payments
  for select to authenticated
  using (public.app_role_is_staff() and gym_id = public.app_gym_id());

drop policy "admin writes checkins" on public.checkins;
create policy "staff writes checkins" on public.checkins
  for all to authenticated
  using (gym_id = public.app_gym_id() and public.app_role_is_staff())
  with check (gym_id = public.app_gym_id() and public.app_role_is_staff());
