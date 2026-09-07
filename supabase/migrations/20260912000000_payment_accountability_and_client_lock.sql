-- Bolá — rendición de cuentas del cobro en efectivo + cierre real del hueco
-- de "el que no pagó igual usa toda la app" (conversación 2026-09-07:
-- "como funciona el pago diario" / "como se lleva el control para que no
-- entren sin pagar").
--
-- Dos partes:
--
-- 1) `payments.created_by` — quién generó el cobro (el mostrador que le
--    entregó/mostró el QR al cliente), separado de `confirmed_by` (quién lo
--    confirmó: el mismo staff a mano, o el cliente escaneando, ver
--    20260907000000_payment_qr_flip.sql). Antes solo quedaba registrado
--    quien CONFIRMABA — si el cliente confirmaba solo escaneando, nadie
--    quedaba anotado como quien de verdad recibió el efectivo en el
--    mostrador. Se completa en create_cash_charge() (mismo signature, se
--    reemplaza en el lugar).
--
-- 2) `staff_notifications` — cuando el CLIENTE confirma su propio pago
--    escaneando el QR (no cuando el staff lo confirma a mano, que ya lo
--    sabe porque lo hizo él mismo), se le avisa a TODO el staff del
--    gimnasio (dueño + administradores aprobados) quién generó ese cobro y
--    hasta cuándo queda válido — mismo patrón de "una fila por
--    destinatario" que `notifications`/`notify_gym_clients()`
--    (20260910000000), pero en la dirección contraria (cliente -> staff en
--    vez de staff -> clientes). Se arma dentro de confirm_cash_payment()
--    (mismo signature) para que sea imposible confirmarse un pago sin que
--    quede el aviso — no depende de que el frontend se acuerde de llamar
--    algo aparte.
--
-- El bloqueo de pantallas del lado del cliente que no pagó (solo puede usar
-- "Pago" hasta que se ponga al día) es puramente de frontend — el estado ya
-- viaja en client_profiles.membership_status, no hace falta tocar RLS acá.

alter table public.payments add column if not exists created_by uuid references public.profiles(id);

create table public.staff_notifications (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  type text not null default 'payment_confirmed',
  related_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index staff_notifications_recipient_idx on public.staff_notifications(recipient_user_id, created_at desc);

alter table public.staff_notifications enable row level security;

create policy "staff reads own notifications" on public.staff_notifications
  for select to authenticated using (recipient_user_id = auth.uid());

-- Solo para marcar leída (read_at) — igual que `notifications`, las filas
-- nuevas SOLO las inserta confirm_cash_payment() de abajo (security
-- definer), sin política de insert.
create policy "staff marks own notifications read" on public.staff_notifications
  for update to authenticated using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid());

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

  insert into public.payments (client_user_id, gym_id, amount, status, created_by)
  values (p_client_user_id, v_gym_id, v_amount, 'pending', auth.uid())
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

create or replace function public.confirm_cash_payment(p_payment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments%rowtype;
  v_duration plan_duration;
  v_interval interval;
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

  v_interval := case v_duration
    when 'diario' then interval '1 day'
    when 'anual' then interval '1 year'
    else interval '1 month' -- 'mensual', o sin plan asignado (fallback razonable)
  end;
  v_expires := current_date + v_interval;

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
