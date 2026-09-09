-- Bolá — el plan "diario" vence el MISMO día que se paga, no 24hs después.
--
-- Bug real (2026-09-09): confirm_cash_payment() dejaba membership_expires_at
-- en `current_date + 1 día` para un plan diario — si alguien pagaba hoy a
-- las 15:00, quedaba "al día" hasta MAÑANA a esa misma hora en la práctica
-- (el día siguiente entero, no vencía hasta pasado mañana). El diario es
-- "para usar hoy": tiene que vencer hoy mismo, no dar un día extra de
-- regalo. Ahora membership_expires_at para 'diario' = current_date (hoy),
-- sin sumarle nada.
--
-- Eso solo no alcanza: nada en el sistema pasaba membership_status a
-- 'vencido' automáticamente cuando la fecha se cumplía — quedaba 'al_dia'
-- para siempre hasta que un admin lo suspendiera a mano (ver
-- confirm_cash_payment/approve/etc., ninguna toca 'vencido'). Sin cron
-- (no hay pg_cron acá), se resuelve del lado del servidor, en lectura: dos
-- funciones nuevas, security definer, que "sincronizan" el estado real
-- contra membership_expires_at antes de devolver los datos —
--
--   sync_my_membership_status() — el propio cliente, se llama desde
--     clients.getSelf() (cada vez que entra a la app o se refresca su
--     propio estado).
--   sync_gym_memberships_status() — todo el gimnasio del staff, se llama
--     desde clients.listForGym() (cada vez que el dueño/admin abre Socios
--     o Pagos).
--
-- Con eso alcanza para el uso real de la app (el cliente entra, el staff
-- mira Socios) sin depender de una extensión que quizás ni esté
-- habilitada en el plan del proyecto. Nunca "resucita" a nadie: solo pasa
-- 'al_dia' -> 'vencido' cuando ya venció, nunca toca 'pendiente' ni
-- 'suspendido' (esos no son por fecha, son por plata nunca pagada o por
-- decisión manual del staff).

create or replace function public.confirm_cash_payment(p_payment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments%rowtype;
  v_duration plan_duration;
  v_expires date;
  v_client_name text;
  v_collector_name text;
  v_currency text;
  v_title text;
  v_body text;
begin
  select * into v_payment from public.payments where id = p_payment_id;
  if v_payment.id is null or v_payment.gym_id is distinct from public.app_gym_id() then
    raise exception 'No autorizado para este cobro.';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Este cobro ya fue procesado.';
  end if;

  -- Confirma el staff del gimnasio (botón manual) o el propio cliente de
  -- ese cobro (escaneando el QR que le muestra el mostrador) — nunca un
  -- cliente ajeno a este cobro puntual.
  if not (
    public.app_role_is_staff()
    or (public.app_role() = 'client' and v_payment.client_user_id = auth.uid())
  ) then
    raise exception 'No autorizado para confirmar este cobro.';
  end if;

  update public.payments
    set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
    where id = p_payment_id;

  select p.duration into v_duration
    from public.client_profiles cp
    left join public.plans p on p.id = cp.plan_id
    where cp.user_id = v_payment.client_user_id;

  -- 'diario' vence el mismo día — nada de sumarle un día. El resto sigue
  -- igual que antes (mensual/anual sí dan el período completo desde hoy).
  v_expires := case v_duration
    when 'diario' then current_date
    when 'anual' then current_date + interval '1 year'
    else current_date + interval '1 month' -- 'mensual', o sin plan asignado (fallback razonable)
  end;

  update public.client_profiles
    set membership_status = 'al_dia',
        last_payment_at = now(),
        membership_expires_at = v_expires
    where user_id = v_payment.client_user_id;

  -- Aviso al staff SOLO si quien confirmó fue el propio cliente (escaneo) —
  -- si fue el staff a mano, no hace falta avisarle a sí mismo.
  if public.app_role() = 'client' then
    select name into v_client_name from public.profiles where id = v_payment.client_user_id;
    select name into v_collector_name from public.profiles where id = v_payment.created_by;
    select currency into v_currency from public.gyms where id = v_payment.gym_id;

    v_title := coalesce(v_client_name, 'Un socio') || ' confirmó su pago por QR';
    v_body := 'Cobrado por ' || coalesce(v_collector_name, 'el mostrador (sin registrar)')
      || ' · ' || trim(to_char(v_payment.amount, 'FM999999990.00')) || ' ' || coalesce(v_currency, 'USD')
      || ' · Válido hasta ' || to_char(v_expires, 'DD/MM/YYYY');

    insert into public.staff_notifications (gym_id, recipient_user_id, title, body, type, related_id)
    select v_payment.gym_id, s.user_id, v_title, v_body, 'payment_confirmed', p_payment_id
    from (
      select owner_user_id as user_id from public.gyms where id = v_payment.gym_id
      union
      select user_id from public.gym_admins where gym_id = v_payment.gym_id and status = 'approved'
    ) s;
  end if;
end;
$$;

create or replace function public.sync_my_membership_status()
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.client_profiles
    set membership_status = 'vencido'
    where user_id = auth.uid()
      and membership_status = 'al_dia'
      and membership_expires_at < current_date;
end;
$$;

grant execute on function public.sync_my_membership_status() to authenticated;

create or replace function public.sync_gym_memberships_status()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.app_role_is_staff() then
    raise exception 'Solo el administrador o el dueño del gimnasio hacen esto.';
  end if;

  update public.client_profiles
    set membership_status = 'vencido'
    where gym_id = public.app_gym_id()
      and membership_status = 'al_dia'
      and membership_expires_at < current_date;
end;
$$;

grant execute on function public.sync_gym_memberships_status() to authenticated;
