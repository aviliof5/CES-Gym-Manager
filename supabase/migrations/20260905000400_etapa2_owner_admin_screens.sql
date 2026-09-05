-- Bolá — Etapa 2 (pantallas de dueño/administrador): suspender socios,
-- activar/desactivar entrenadores, configuración del gimnasio. Todo lo que
-- agrega esta migración es NUEVO — ninguna tabla existente pierde datos.
--
-- Convención de siempre: cada escritura con una regla real detrás pasa por
-- un RPC security definer que exige app_role_is_staff() en el servidor,
-- nunca un UPDATE directo desde el cliente.

-- ==================== Suspender / reactivar un socio ====================
-- 'suspendido' ya existe en membership_status (migración 20260905000200,
-- que dejó el RPC para después a propósito — un valor de enum nuevo no se
-- puede usar en la misma transacción en que se crea). suspended_at/
-- suspended_reason también ya existen en client_profiles.

create or replace function public.suspend_client(p_client_user_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.app_role_is_staff() then
    raise exception 'Solo el administrador o el dueño del gimnasio suspenden un socio.';
  end if;

  update public.client_profiles
    set membership_status = 'suspendido', suspended_at = now(), suspended_reason = nullif(trim(p_reason), '')
    where user_id = p_client_user_id and gym_id = public.app_gym_id();

  if not found then
    raise exception 'Ese socio no existe en tu gimnasio.';
  end if;
end;
$$;

grant execute on function public.suspend_client(uuid, text) to authenticated;

-- Vuelve a 'pendiente' (no 'al_dia' — el staff confirma el próximo pago
-- como siempre; reactivar no debería regalar días de membresía).
create or replace function public.unsuspend_client(p_client_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.app_role_is_staff() then
    raise exception 'Solo el administrador o el dueño del gimnasio reactivan un socio.';
  end if;

  update public.client_profiles
    set membership_status = 'pendiente', suspended_at = null, suspended_reason = null
    where user_id = p_client_user_id and gym_id = public.app_gym_id() and membership_status = 'suspendido';

  if not found then
    raise exception 'Ese socio no está suspendido en tu gimnasio.';
  end if;
end;
$$;

grant execute on function public.unsuspend_client(uuid) to authenticated;

-- ==================== Activar / desactivar un entrenador ====================
-- Columna nueva en vez de reusar status='rejected': un entrenador
-- "rechazado" nunca llegó a estar activo, es un caso distinto de uno
-- aprobado que el dueño pausa temporalmente (ej. de licencia). Así
-- "Solicitudes pendientes" (status='pending') y "activar/desactivar"
-- (is_active) no se pisan entre sí.

alter table public.trainers add column if not exists is_active boolean not null default true;

create or replace function public.set_trainer_active(p_trainer_user_id uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.app_role_is_staff() then
    raise exception 'Solo el administrador o el dueño del gimnasio activan o desactivan un entrenador.';
  end if;

  update public.trainers
    set is_active = p_active
    where user_id = p_trainer_user_id and gym_id = public.app_gym_id() and status = 'approved';

  if not found then
    raise exception 'Ese entrenador no existe o no está aprobado en tu gimnasio.';
  end if;
end;
$$;

grant execute on function public.set_trainer_active(uuid, boolean) to authenticated;

-- ==================== Configuración del gimnasio ====================
-- La RLS de gyms ("owner updates their gym", 20260720120200) solo deja
-- escribir al dueño (owner_user_id = auth.uid()) — un admin no puede tocar
-- moneda/marca aunque tenga paridad total con el dueño en todo lo demás
-- (ver docs/ROLES_AND_PERMISSIONS.md). Este RPC cierra esa brecha exigiendo
-- app_role_is_staff() en vez de "sos el dueño".

create or replace function public.update_gym_settings(p_currency text, p_brand_name text, p_brand_color text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.app_role_is_staff() then
    raise exception 'Solo el administrador o el dueño del gimnasio configuran el gimnasio.';
  end if;

  update public.gyms
    set currency = coalesce(nullif(trim(p_currency), ''), currency),
        brand_name = nullif(trim(p_brand_name), ''),
        brand_color = nullif(trim(p_brand_color), '')
    where id = public.app_gym_id();
end;
$$;

grant execute on function public.update_gym_settings(text, text, text) to authenticated;
