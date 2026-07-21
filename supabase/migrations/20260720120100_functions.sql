-- Bolá — funciones: helpers para RLS, alta de cuenta, y las operaciones que
-- deben quedar restringidas al staff (nunca al propio cliente/entrenador).

-- ---------- helpers de sesión (usados en políticas RLS) ----------
-- security definer para poder leer profiles sin recursión de RLS al evaluar
-- las políticas de otras tablas. Nombrados app_* para no chocar con la
-- función incorporada current_role() de Postgres.

create or replace function public.app_role()
returns user_role
language sql security definer stable set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.app_gym_id()
returns uuid
language sql security definer stable set search_path = public as $$
  select gym_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_client_trainer(p_client_user_id uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from public.client_profiles cp
    where cp.user_id = p_client_user_id and cp.trainer_user_id = auth.uid()
  );
$$;

-- ---------- alta de cuenta ----------
-- Se dispara al crear un auth.users (supabase.auth.signUp). El rol viaja en
-- options.data = { role: 'admin' | 'trainer' | 'client', name, phone, ... }
-- pasado desde el cliente al momento del registro.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role user_role := coalesce((new.raw_user_meta_data->>'role')::user_role, 'client');
begin
  insert into public.profiles (id, role, name, email, phone)
  values (
    new.id,
    v_role,
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
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- El rol no cambia jamás después del alta (ni el propio usuario ni un bug en
-- otra parte del código pueden convertir un cliente en admin por accidente).
create or replace function public.prevent_role_change()
returns trigger language plpgsql as $$
begin
  if new.role <> old.role then
    raise exception 'El rol de un usuario no se puede cambiar.';
  end if;
  return new;
end;
$$;

create trigger profiles_role_immutable
  before update on public.profiles
  for each row execute function public.prevent_role_change();

-- ---------- gimnasio: alta y unión ----------

create or replace function public.create_gym(p_name text, p_address text, p_hours text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_gym_id uuid;
begin
  if public.app_role() is distinct from 'admin' then
    raise exception 'Solo una cuenta de administrador puede crear un gimnasio.';
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

-- Entrenador o cliente se suma a un gimnasio ya existente. La app hoy solo
-- maneja un gimnasio de ejemplo, así que esto se llama con ese id fijo; un
-- selector real de gimnasio (buscar/unirse por código) queda para cuando se
-- diseñe esa pantalla — no está resuelto en el prototipo actual.
create or replace function public.join_gym(p_gym_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() is null or public.app_role() not in ('trainer', 'client') then
    raise exception 'Solo entrenadores y clientes se unen a un gimnasio con esta función.';
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
end;
$$;

-- ---------- aprobación de entrenador ----------
-- El propio entrenador puede editar specialty/price (columnas normales,
-- vía RLS). El status SOLO cambia acá — bloqueado también por trigger en
-- 0003_rls.sql para que ni un UPDATE directo con permisos de más lo toque.

create or replace function public.approve_trainer(p_trainer_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() is distinct from 'admin' then
    raise exception 'Solo el administrador del gimnasio aprueba entrenadores.';
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
  if public.app_role() is distinct from 'admin' then
    raise exception 'Solo el administrador del gimnasio rechaza entrenadores.';
  end if;
  update public.trainers
    set status = 'rejected'
    where user_id = p_trainer_user_id and gym_id = public.app_gym_id();
end;
$$;

-- ---------- cobro en efectivo ----------
-- Corrige el bug de la versión solo-frontend: quien confirma que el efectivo
-- entró a caja es SIEMPRE el staff (admin), nunca el propio cliente. Estas
-- tres funciones son el único camino para tocar payments/membership_status —
-- ver el REVOKE de columnas sobre client_profiles en 0003_rls.sql.

create or replace function public.create_cash_charge(p_client_user_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_amount numeric(10,2);
  v_gym_id uuid;
  v_payment_id uuid;
begin
  if public.app_role() is distinct from 'admin' then
    raise exception 'Solo el administrador del gimnasio genera un cobro.';
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
  if public.app_role() is distinct from 'admin' then
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
  if public.app_role() is distinct from 'admin' then
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

grant execute on function public.create_gym(text, text, text) to authenticated;
grant execute on function public.join_gym(uuid) to authenticated;
grant execute on function public.approve_trainer(uuid) to authenticated;
grant execute on function public.reject_trainer(uuid) to authenticated;
grant execute on function public.create_cash_charge(uuid) to authenticated;
grant execute on function public.confirm_cash_payment(uuid) to authenticated;
grant execute on function public.cancel_cash_payment(uuid) to authenticated;
