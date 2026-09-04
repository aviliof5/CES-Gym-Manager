-- Bolá — código de invitación por gimnasio (sección 10 del pedido original
-- de Fight Club: "Invitación de clientes" — link + QR que identifican el
-- gimnasio, el cliente se registra y queda asociado a ese gimnasio).
--
-- El código NO es un secreto de control de acceso: `gyms` ya es
-- públicamente listable para cualquier autenticado ("any authenticated user
-- can browse gyms" en 20260720120200_rls.sql), así que esto es una
-- comodidad de UX (un link/código lindo para compartir), no una barrera de
-- seguridad nueva. join_gym() sigue siendo la única función que une de
-- verdad la cuenta al gimnasio, con sus mismos chequeos de siempre (rol
-- correcto, todavía sin gimnasio asignado) — ver docs/SECURITY_AUDIT.md
-- riesgo 1, que ya señalaba esta distinción de antemano.

alter table public.gyms add column invite_code text;

-- Backfill para gimnasios ya existentes (Fight Club Gym, Gimnasio de
-- Prueba CES, PowerHouse Gym en el seed de mock-client.js aparte).
update public.gyms
  set invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
  where invite_code is null;

alter table public.gyms alter column invite_code set not null;
alter table public.gyms add constraint gyms_invite_code_unique unique (invite_code);

-- create_gym() genera el código del gimnasio nuevo automáticamente — nadie
-- lo "genera" a mano ni hay un botón para eso, ya queda listo para
-- compartir apenas se crea el gimnasio.
create or replace function public.create_gym(p_name text, p_address text, p_hours text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_gym_id uuid;
begin
  if public.app_role() is distinct from 'owner' then
    raise exception 'Solo una cuenta de dueño puede crear un gimnasio.';
  end if;
  if public.app_gym_id() is not null then
    raise exception 'Esta cuenta ya tiene un gimnasio asignado.';
  end if;

  insert into public.gyms (name, address, hours, owner_user_id, invite_code)
  values (p_name, p_address, p_hours, auth.uid(), substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  returning id into v_gym_id;

  update public.profiles set gym_id = v_gym_id where id = auth.uid();

  return v_gym_id;
end;
$$;
