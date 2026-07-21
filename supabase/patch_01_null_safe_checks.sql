-- Bolá / CES Gym Manager — parche: comparaciones NULL-inseguras en los
-- chequeos de rol/gimnasio.
--
-- El bug: `if public.app_role() <> 'admin' then raise exception ...` no
-- dispara la excepción cuando app_role() es NULL (sin sesión válida),
-- porque en SQL `NULL <> 'admin'` da NULL, no TRUE, y `IF NULL THEN` se
-- trata como falso. Mismo problema con `NOT IN (...)` y con las
-- comparaciones de gym_id. La corrección usa `IS DISTINCT FROM`, que sí
-- trata NULL como "distinto" de cualquier valor.
--
-- Solo `create or replace function` — seguro de correr aunque las tablas
-- y políticas ya existan. Pegar en SQL Editor → Run.

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
