/* Bolá — rol dedicado de administrador de plataforma.

   Reemplaza el enfoque de la Fase 16 (profiles.is_platform_admin, un
   booleano superpuesto sobre CUALQUIER rol normal — cliente, entrenador,
   dueño o admin — que hacía aparecer una tab "Plataforma" extra dentro de
   ese panel). Acá la limpiamos porque acabamos de vaciar la base de
   producción (2 gimnasios de prueba + sus 5 cuentas, incluida la que tenía
   el flag) y el dueño del proyecto pidió algo más simple y separado: una
   cuenta propia, sin gimnasio, que entra a un panel dedicado y a ningún
   otro lado.

   Esta cuenta NO se crea desde ningún formulario público de la app — no
   hay signUpPlatformAdmin() en supabase-client.js ni pantalla de registro.
   Se crea a mano, una sola vez, desde Supabase Dashboard → Authentication →
   Add user, con User Metadata: {"role":"platform_admin","name":"..."} —
   handle_new_user() ya sabe insertar profiles con el role que venga en la
   metadata (ver 20260903000001_owner_role_2_logic.sql), y como no es
   'trainer'/'client'/'admin' no dispara ningún insert extra en otra tabla.

   profiles.is_platform_admin (columna booleana, Fase 16) queda en la tabla
   sin usarse — no se borra por si algo externo la lee, pero ningún código
   nuevo la consulta: app_is_platform_admin() pasa a chequear el rol. */

alter type public.user_role add value if not exists 'platform_admin';

-- Mismo gate que ya usaban create_owner_invite() y la política de lectura
-- de owner_invites (20260904000400_owner_invite_and_gym_invites.sql) —
-- ambos quedan actualizados gratis al redefinir esta función, sin tocarlos.
create or replace function public.app_is_platform_admin()
returns boolean
language sql security definer stable set search_path = public as $$
  select public.app_role() = 'platform_admin';
$$;

-- Panel de plataforma (src/screens/platform.js): todos los gimnasios que
-- existen hoy + el nombre/correo de su dueño (si ya completó create_gym()).
-- security definer + el chequeo explícito porque esto cruza gimnasios —
-- ninguna política de RLS por gym_id tendría sentido acá.
create or replace function public.platform_list_gyms()
returns table (
  id uuid, name text, address text, currency text, brand_name text,
  created_at timestamptz, owner_name text, owner_email text
)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.app_is_platform_admin() then
    raise exception 'Solo el administrador de la plataforma puede ver esto.';
  end if;
  return query
    select g.id, g.name, g.address, g.currency, g.brand_name, g.created_at,
           p.name, p.email
    from public.gyms g
    left join public.profiles p on p.gym_id = g.id and p.role = 'owner'
    order by g.created_at desc;
end;
$$;

grant execute on function public.platform_list_gyms() to authenticated;
