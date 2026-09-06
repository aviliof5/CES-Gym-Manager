/* Bolá — arregla que un link de invitación de gimnasio (?invite=CODE, para
   administrador/entrenador/cliente) nunca resolvía nada para alguien
   todavía sin cuenta.

   getByInviteCode() (supabase-client.js) hace select de gym_invites con un
   embed !inner a gyms — pero gyms solo tiene política de lectura para
   "authenticated" (ver 20260720120200_rls.sql: "any authenticated user
   can browse gyms"), nunca para "anon". Con !inner, si la fila embebida no
   es visible por RLS, PostgREST descarta la fila entera del resultado —
   así que para alguien que todavía no inició sesión (el caso normal al
   abrir un link de invitación por primera vez) la consulta siempre
   devolvía [] aunque el código fuera válido. Nunca se detectó porque
   mock-client.js no aplica RLS y todas las pruebas anteriores corrieron
   contra el mock.

   Mismo patrón que ya usa create_owner_invite/check_owner_invite: una
   función security definer, no abrir la tabla entera a "anon". */

create or replace function public.resolve_gym_invite(p_code text)
returns table (gym_id uuid, gym_name text, gym_address text, gym_hours text, role text)
language sql security definer stable set search_path = public as $$
  select g.id, g.name, g.address, g.hours, gi.role
  from public.gym_invites gi
  join public.gyms g on g.id = gi.gym_id
  where gi.code = p_code;
$$;

grant execute on function public.resolve_gym_invite(text) to anon, authenticated;
