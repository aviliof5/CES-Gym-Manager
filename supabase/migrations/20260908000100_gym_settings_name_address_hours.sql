/* Bolá — el dueño/admin no tenía forma de corregir el nombre, la dirección
   o el horario del gimnasio después de crearlo (solo se cargaban en el
   registro) ni de editar el equipo/máquinas — ambos quedaban fijos para
   siempre salvo que alguien tocara la base a mano. update_gym_settings()
   ya existía para moneda/marca (Etapa 2, "Configuración"). El equipo
   (public.equipment) ya tenía add/remove propios (BolaAPI.equipment.*,
   usados en el registro) — no necesita RPC nuevo, solo se reutilizan en
   la pantalla de Configuración (ver src/screens/owner.js).

   OJO (verificado a mano contra Supabase real, no supuesto): agregar
   parámetros nuevos con default a una función existente y correr CREATE OR
   REPLACE NO reemplaza la función vieja — Postgres identifica una función
   por nombre + lista de tipos de parámetros, así que una lista distinta
   (aunque los nuevos tengan default) crea un OVERLOAD nuevo y deja la
   versión de 3 argumentos huérfana al lado. Por eso acá se hace
   explícito: se borra la firma vieja de 3 argumentos y se otorga el
   permiso de ejecución de nuevo para la firma de 6 — CREATE OR REPLACE
   nunca hereda los grants de una firma distinta. */

drop function if exists public.update_gym_settings(text, text, text);

create or replace function public.update_gym_settings(
  p_currency text, p_brand_name text, p_brand_color text,
  p_name text default null, p_address text default null, p_hours text default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.app_role_is_staff() then
    raise exception 'Solo el administrador o el dueño del gimnasio configuran el gimnasio.';
  end if;

  update public.gyms
    set currency = coalesce(nullif(trim(p_currency), ''), currency),
        brand_name = nullif(trim(p_brand_name), ''),
        brand_color = nullif(trim(p_brand_color), ''),
        name = coalesce(nullif(trim(p_name), ''), name),
        address = coalesce(nullif(trim(p_address), ''), address),
        hours = coalesce(nullif(trim(p_hours), ''), hours)
    where id = public.app_gym_id();
end;
$$;

grant execute on function public.update_gym_settings(text, text, text, text, text, text) to authenticated;
