-- Bolá — Fase 16: alta de dueño interna + invitación separada por rol.
--
-- Problema real (ver docs/SECURITY_AUDIT.md): signUpOwner() manda
-- options.data.role='owner', un valor 100% controlado por el navegador que
-- llama. handle_new_user() lo acepta sin más chequeo, y create_gym() solo
-- exigía app_role()='owner' + app_gym_id() is null -- ambas condiciones
-- trivialmente satisfechas por cualquiera que se registre mintiendo el rol.
-- Esto NO se cierra ocultando el botón "Soy Dueño" del frontend (regla de
-- siempre acá: "la seguridad nunca vive en el frontend") -- se cierra
-- exigiendo un token de invitación real, consumido atómicamente, dentro de
-- create_gym() en el servidor. Una cuenta 'owner' sin gimnasio no puede
-- hacer nada (no hay panel sin gym_id) -- el gate real es este.
--
-- Además: admin/entrenador dejan de compartir el mismo código de invitación
-- que el cliente (gyms.invite_code) -- cada rol tiene el suyo propio
-- (gym_invites), y de ahora en más su alta es SOLO por ese link -- ya no
-- pueden elegir cualquier gimnasio de la lista pública (viewGymPicker sigue
-- existiendo, pero solo como red de contención para cliente y para
-- reanudar un alta interrumpida, ver docs/MIGRATION_PLAN.md Fase 16).

-- ==================== profiles: administrador de plataforma ====================

alter table public.profiles add column is_platform_admin boolean not null default false;

-- Alta única y manual: la cuenta real de dueño de Fight Club/CES
-- (fernandezavilio5@gmail.com, ver docs/ARCHITECTURE_AUDIT.md §7) es quien
-- genera invitaciones de dueño para clientes nuevos del servicio.
-- Idempotente a propósito (a salvo de reejecutarse sin efecto raro).
update public.profiles set is_platform_admin = true where email = 'fernandezavilio5@gmail.com';

create or replace function public.app_is_platform_admin()
returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false);
$$;

-- ==================== owner_invites: token para crear UN gimnasio ====================
-- Sin ninguna política de RLS a propósito -- a diferencia de gym_invites
-- más abajo, este token sí es un límite de seguridad real (quien lo tiene
-- puede crear un gimnasio de verdad), así que ni siquiera "authenticated"
-- puede leer/escribir esta tabla directo. Igual patrón que
-- payments/checkin_events/trainer_candidate_interest: la única forma de
-- tocarla es a través de las funciones security definer de abajo.

create table public.owner_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, 20),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by_user_id uuid references public.profiles(id)
);

alter table public.owner_invites enable row level security;

-- Callable por "anon": el link se abre ANTES de loguearse/registrarse, así
-- que hay que poder validarlo sin sesión. Solo devuelve un booleano -- no
-- expone la tabla ni permite enumerar tokens válidos.
create or replace function public.check_owner_invite(p_token text)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from public.owner_invites where token = p_token and used_at is null
  );
$$;

grant execute on function public.check_owner_invite(text) to anon, authenticated;

create or replace function public.create_owner_invite(p_note text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_token text;
begin
  if not public.app_is_platform_admin() then
    raise exception 'Solo un administrador de la plataforma puede generar invitaciones de dueño.';
  end if;

  insert into public.owner_invites (note, created_by)
  values (nullif(trim(p_note), ''), auth.uid())
  returning token into v_token;

  return v_token;
end;
$$;

grant execute on function public.create_owner_invite(text) to authenticated;

-- Lista de invitaciones ya generadas -- la lee la tab "Plataforma" del
-- dueño (ver src/screens/owner.js viewOwnerPlatform). RLS en vez de un RPC
-- de lectura aparte: más simple, y el chequeo es el mismo helper de arriba.
create policy "platform admin reads owner invites" on public.owner_invites
  for select to authenticated
  using (public.app_is_platform_admin());

-- ==================== gym_invites: un código por (gimnasio, rol) ====================
-- Reemplaza gyms.invite_code como fuente de verdad de los links que se
-- comparten. gyms.invite_code se deja intacta (columna todavía not null,
-- create_gym() la sigue completando) por si algo externo la lee -- ningún
-- código de la app la usa desde esta migración en adelante.
--
-- Público a "anon" (no solo "authenticated"): el rol de un link (?invite=)
-- tiene que poder resolverse ANTES de loguearse/registrarse, para habilitar
-- o no el modo "Registrarme" en viewAdminAuth/viewTrainerAuth/viewClientAuth
-- desde el arranque (ver router.js). Igual que con gyms, esto no es un
-- chequeo de seguridad -- join_gym() sigue siendo la única función que de
-- verdad une la cuenta al gimnasio, con sus mismos chequeos de rol de
-- siempre.

create table public.gym_invites (
  gym_id uuid not null references public.gyms(id) on delete cascade,
  role text not null check (role in ('admin', 'trainer', 'client')),
  code text not null,
  created_at timestamptz not null default now(),
  primary key (gym_id, role)
);

create unique index gym_invites_code_unique on public.gym_invites(code);

alter table public.gym_invites enable row level security;

create policy "anyone can resolve a gym invite code" on public.gym_invites
  for select to anon, authenticated
  using (true);

-- ==================== create_gym: ahora exige un owner_invite y crea los 3 códigos ====================
-- DROP explícito de la versión de 3 parámetros: un CREATE OR REPLACE con
-- una lista de argumentos distinta NO reemplaza la función vieja, crea un
-- OVERLOAD nuevo -- sin este drop quedarían dos create_gym() coexistiendo,
-- y a cuál de las dos resuelve client.rpc('create_gym', {...}) queda
-- ambiguo. Ver docs/MIGRATION_PLAN.md Fase 16.

drop function if exists public.create_gym(text, text, text);

create or replace function public.create_gym(
  p_name text, p_address text, p_hours text, p_owner_invite_token text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_gym_id uuid;
  v_invite_id uuid;
begin
  if public.app_role() is distinct from 'owner' then
    raise exception 'Solo una cuenta de dueño puede crear un gimnasio.';
  end if;
  if public.app_gym_id() is not null then
    raise exception 'Esta cuenta ya tiene un gimnasio asignado.';
  end if;

  -- Consumo atómico del token -- el "for update" evita que dos intentos
  -- concurrentes con el mismo token pasen ambos el chequeo antes de que
  -- ninguno haya marcado used_at todavía.
  select id into v_invite_id
    from public.owner_invites
    where token = p_owner_invite_token and used_at is null
    for update;

  if v_invite_id is null then
    raise exception 'El link de invitación de dueño no es válido o ya fue usado.';
  end if;

  insert into public.gyms (name, address, hours, owner_user_id, invite_code)
  values (p_name, p_address, p_hours, auth.uid(), substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  returning id into v_gym_id;

  update public.profiles set gym_id = v_gym_id where id = auth.uid();

  update public.owner_invites
    set used_at = now(), used_by_user_id = auth.uid()
    where id = v_invite_id;

  insert into public.gym_invites (gym_id, role, code) values
    (v_gym_id, 'client', substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    (v_gym_id, 'admin', substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    (v_gym_id, 'trainer', substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  return v_gym_id;
end;
$$;

grant execute on function public.create_gym(text, text, text, text) to authenticated;

-- ==================== regenerate_gym_invite: rotar un código filtrado ====================

create or replace function public.regenerate_gym_invite(p_role text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_new_code text;
begin
  if not public.app_role_is_staff() then
    raise exception 'Solo el administrador o el dueño del gimnasio regeneran un link de invitación.';
  end if;
  if p_role not in ('admin', 'trainer', 'client') then
    raise exception 'Rol de invitación inválido.';
  end if;

  v_new_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  update public.gym_invites
    set code = v_new_code
    where gym_id = public.app_gym_id() and role = p_role;

  if not found then
    raise exception 'Este gimnasio todavía no tiene un link de invitación para ese rol.';
  end if;

  return v_new_code;
end;
$$;

grant execute on function public.regenerate_gym_invite(text) to authenticated;

-- ==================== backfill: gimnasios ya existentes ====================
-- El código de cliente YA compartido sigue funcionando (se copia tal cual);
-- admin/entrenador son códigos nuevos, nadie los tenía compartidos todavía.

insert into public.gym_invites (gym_id, role, code)
  select id, 'client', invite_code from public.gyms
  on conflict (gym_id, role) do nothing;

insert into public.gym_invites (gym_id, role, code)
  select id, 'admin', substr(replace(gen_random_uuid()::text, '-', ''), 1, 8) from public.gyms
  on conflict (gym_id, role) do nothing;

insert into public.gym_invites (gym_id, role, code)
  select id, 'trainer', substr(replace(gen_random_uuid()::text, '-', ''), 1, 8) from public.gyms
  on conflict (gym_id, role) do nothing;
