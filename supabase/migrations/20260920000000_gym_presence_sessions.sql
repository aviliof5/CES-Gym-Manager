-- Bolá — presencia en el gym en tiempo real (pedido: "una pantalla... que
-- muestre quién está en el gym en ese momento", con un QR único del
-- gimnasio: el encargado de turno lo escanea para quedar de encargado, los
-- clientes lo escanean al llegar y arrancan un temporizador de 2 horas).
--
-- DECISIÓN DE SEGURIDAD A PROPÓSITO — leer antes de tocar esto:
-- Hasta ahora el check-in por QR (20260904000100_checkin_events.sql) seguía
-- un principio estricto: "el QR nunca es una credencial, un cliente jamás
-- registra su propio check-in escaneando su propio código, siempre lo hace
-- el staff" — porque un QR es texto plano fabricable/fotografiable por
-- cualquiera, y dejar que el que lo escanea sea quien se acredita a sí
-- mismo no prueba presencia física real.
--
-- Esta feature invierte esa regla A PROPÓSITO para el cliente: acá el
-- cliente SÍ se auto-registra escaneando el QR fijo del gimnasio. Esto
-- reintroduce el mismo riesgo que antes se evitaba: alguien podría
-- fotografiar el cartel una sola vez y "marcarse presente" desde su casa
-- sin estar ahí. Se acepta ese riesgo tal como se pidió porque lo único que
-- está en juego es un contador de ocupación en pantalla y un recordatorio
-- personal de 2 horas — no hay cobro ni acceso físico real de por medio, y
-- si alguien se "hace trampa" a sí mismo no afecta a nadie más. Ver
-- docs/SECURITY_AUDIT.md Fase 17 para el detalle completo de esta decisión.
--
-- Un solo QR físico, un solo RPC (scan_gym_qr) que ramifica server-side
-- según app_role() de quien escanea — mismo criterio que confirm_cash_payment()
-- (un RPC, dos ramas por rol). El payload del QR es SOLO
-- {t:'gym_presence', gym: gymId} — igual que el resto de los QR de esta
-- app, es texto plano no firmado, usado del lado del cliente únicamente
-- para el mensaje de "ese código es de otro gimnasio"; el RPC siempre
-- deriva el gimnasio real de app_gym_id(), nunca del texto leído.

-- "Quién está de turno ahora" — un solo encargado a la vez por gimnasio,
-- se reemplaza solo con el siguiente que escanee (no hace falta que el
-- anterior cierre turno a mano, aunque puede con end_encargado_shift()).
alter table public.gyms add column if not exists current_encargado_user_id uuid references public.profiles(id);
alter table public.gyms add column if not exists current_encargado_since timestamptz;

-- Presencia + ciclo de vida de 2 horas de CADA cliente — separada de
-- checkin_events (que sigue siendo el registro histórico de "Asistencia",
-- sin tocar) porque esa tabla no tiene columnas de vencimiento/estado.
create table public.gym_sessions (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  client_user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'expired')),
  -- Guarda contra mandar el aviso de "se te acabó el tiempo" dos veces si
  -- el propio cliente y el encargado disparan el recomputo (ver
  -- sync_gym_sessions() más abajo) casi al mismo tiempo.
  notified_expired boolean not null default false,
  created_at timestamptz not null default now()
);

create index gym_sessions_gym_active_idx on public.gym_sessions(gym_id, status);
create index gym_sessions_client_idx on public.gym_sessions(client_user_id, started_at desc);

alter table public.gym_sessions enable row level security;

create policy "self reads own gym sessions" on public.gym_sessions
  for select to authenticated
  using (client_user_id = auth.uid());

-- Entrenadores SÍ entran acá (a diferencia de app_role_is_staff(), que es
-- solo owner/admin) porque un entrenador puede ser encargado de turno y
-- necesita ver la lista de clientes activos del gimnasio.
create policy "staff or approved trainer reads gym sessions" on public.gym_sessions
  for select to authenticated
  using (
    gym_id = public.app_gym_id()
    and (
      public.app_role_is_staff()
      or exists (
        select 1 from public.trainers
        where user_id = auth.uid() and gym_id = public.app_gym_id() and status = 'approved'
      )
    )
  );

-- Sin política de insert/update: todo pasa por scan_gym_qr()/
-- sync_gym_sessions() (security definer), mismo patrón que checkin_events/payments.

-- Punto de entrada único del QR del gimnasio. Ramifica según app_role():
-- owner/admin siempre puede quedar de encargado; un entrenador solo si
-- está aprobado en ESTE gimnasio; un cliente arranca su sesión de 2h SOLO
-- si su plan está al día (cierra el hueco que dejaba viewClientHome: el
-- candado de "App bloqueada" era puramente de frontend — ver el comentario
-- en src/screens/client.js, "el check-in físico... es un tema aparte").
create or replace function public.scan_gym_qr()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_gym_id uuid := public.app_gym_id();
  v_role public.user_role := public.app_role();
  v_status text;
  v_session public.gym_sessions%rowtype;
  v_is_approved_trainer boolean;
begin
  if v_gym_id is null then
    raise exception 'Tu cuenta no está asociada a ningún gimnasio.';
  end if;

  if v_role in ('owner', 'admin') then
    update public.gyms set current_encargado_user_id = auth.uid(), current_encargado_since = now() where id = v_gym_id;
    return jsonb_build_object('kind', 'encargado');
  end if;

  if v_role = 'trainer' then
    select exists(
      select 1 from public.trainers where user_id = auth.uid() and gym_id = v_gym_id and status = 'approved'
    ) into v_is_approved_trainer;
    if not v_is_approved_trainer then
      raise exception 'Solo un entrenador aprobado de este gimnasio puede ser encargado.';
    end if;
    update public.gyms set current_encargado_user_id = auth.uid(), current_encargado_since = now() where id = v_gym_id;
    return jsonb_build_object('kind', 'encargado');
  end if;

  if v_role = 'client' then
    select membership_status into v_status from public.client_profiles where user_id = auth.uid() and gym_id = v_gym_id;
    if v_status is null then
      raise exception 'Tu cuenta no pertenece a este gimnasio.';
    end if;
    if v_status is distinct from 'al_dia' then
      raise exception 'Tu membresía no está al día — pagá para poder ingresar.';
    end if;

    insert into public.gym_sessions (gym_id, client_user_id, expires_at)
    values (v_gym_id, auth.uid(), now() + interval '2 hours')
    returning * into v_session;

    -- Deja el check-in real de siempre (ver Asistencia, checkin_events) sin
    -- tocar su semántica — checked_in_by es el encargado de turno si hay
    -- uno, o el propio cliente si nadie tomó turno todavía.
    insert into public.checkin_events (gym_id, client_user_id, checked_in_by)
    select v_gym_id, auth.uid(), coalesce(g.current_encargado_user_id, auth.uid())
    from public.gyms g where g.id = v_gym_id;

    return jsonb_build_object('kind', 'session', 'sessionId', v_session.id, 'expiresAt', v_session.expires_at);
  end if;

  raise exception 'Tu rol no puede escanear este código.';
end;
$$;

grant execute on function public.scan_gym_qr() to authenticated;

-- Clock-out explícito — solo el propio encargado actual, o el dueño (puede
-- forzarlo si el encargado se fue sin cerrar turno).
create or replace function public.end_encargado_shift()
returns void
language plpgsql security definer set search_path = public as $$
declare v_gym_id uuid := public.app_gym_id();
begin
  if not (
    public.app_role() = 'owner'
    or exists(select 1 from public.gyms where id = v_gym_id and current_encargado_user_id = auth.uid())
  ) then
    raise exception 'Solo el encargado actual o el dueño del gimnasio pueden cerrar el turno.';
  end if;
  update public.gyms set current_encargado_user_id = null, current_encargado_since = null where id = v_gym_id;
end;
$$;

grant execute on function public.end_encargado_shift() to authenticated;

-- Recomputo perezoso del vencimiento — no hay cron en este proyecto (mismo
-- criterio que sync_my_membership_status()/sync_gym_memberships_status(),
-- ver 20260914000000_daily_plan_same_day_expiry.sql): se llama cada vez que
-- alguien lee la lista de sesiones activas (ver gymPresence.listActiveForGym
-- en supabase-client.js/mock-client.js), tanto del lado del cliente como
-- del encargado. Un cliente solo puede vencer las suyas; el
-- encargado/staff/entrenador-aprobado vence las de todo el gimnasio.
create or replace function public.sync_gym_sessions()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_gym_id uuid := public.app_gym_id();
  v_is_staffish boolean;
begin
  if v_gym_id is null then return; end if;
  v_is_staffish := public.app_role_is_staff() or exists(
    select 1 from public.trainers where user_id = auth.uid() and gym_id = v_gym_id and status = 'approved'
  );

  with flipped as (
    update public.gym_sessions
    set status = 'expired'
    where gym_id = v_gym_id
      and status = 'active'
      and expires_at < now()
      and notified_expired = false
      and (v_is_staffish or client_user_id = auth.uid())
    returning id, gym_id, client_user_id
  ), marked as (
    update public.gym_sessions gs set notified_expired = true
    from flipped f where gs.id = f.id
    returning gs.id, gs.gym_id, gs.client_user_id
  ), notif_client as (
    insert into public.notifications (gym_id, client_user_id, title, body, type, related_id)
    select gym_id, client_user_id,
      'Tu tiempo en el gimnasio terminó',
      'Tu sesión de 2 horas venció — si seguís en el gimnasio, avisale al encargado.',
      'gym_session_expired', id
    from marked
  )
  insert into public.staff_notifications (gym_id, recipient_user_id, title, body, type, related_id)
  select m.gym_id, g.current_encargado_user_id,
    coalesce(p.name, 'Un socio') || ' — se le acabó el tiempo',
    'Su sesión de 2 horas venció.',
    'gym_session_expired', m.id
  from marked m
  join public.gyms g on g.id = m.gym_id and g.current_encargado_user_id is not null
  left join public.profiles p on p.id = m.client_user_id;
end;
$$;

grant execute on function public.sync_gym_sessions() to authenticated;
