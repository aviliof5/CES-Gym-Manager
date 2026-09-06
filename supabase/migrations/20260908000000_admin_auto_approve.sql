/* Bolá — un administrador que se une con el link de invitación de SU dueño
   ya está aprobado por el simple hecho de haber usado ese código (el dueño
   lo generó y se lo mandó a propósito, ver gym_invites/resolve_gym_invite)
   — no hay ningún otro camino para que una cuenta 'admin' llegue a
   join_gym() con un gym_id real. El paso extra de "pendiente de aprobación
   del dueño" que quedaba después (gym_admins.status) era vestigial de un
   diseño anterior sin invitación — ahora solo duplicaba un chequeo que el
   propio link/código ya hizo, y dejaba al administrador esperando una
   confirmación que nadie tenía que dar.

   No se toca el flujo de entrenadores (trainers.status) — ahí "pendiente"
   sigue siendo intencional: el dueño/admin puede querer revisar la
   especialidad/precio antes de que el entrenador quede visible para los
   clientes, algo que un administrador no tiene. */

create or replace function public.join_gym(p_gym_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() is null or public.app_role() not in ('trainer', 'client', 'admin') then
    raise exception 'Solo entrenadores, clientes y administradores se unen a un gimnasio con esta función.';
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
  -- El único camino hasta acá para un 'admin' es un código de invitación de
  -- administrador válido de ESTE gimnasio (ver resolve_gym_invite) — usarlo
  -- ES la aprobación del dueño, así que queda aprobado de una.
  update public.gym_admins set gym_id = p_gym_id, status = 'approved' where user_id = auth.uid();
end;
$$;
