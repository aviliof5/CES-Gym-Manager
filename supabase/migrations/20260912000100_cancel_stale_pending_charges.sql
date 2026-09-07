-- Bolá — un cliente solo puede tener UN cobro "pending" a la vez.
--
-- Bug real encontrado en producción (2026-09-07, José Alejandro Castillo):
-- create_cash_charge() nunca invalidaba un cobro pendiente anterior al
-- generar uno nuevo (p.ej. el dueño tocó "Cobrar / QR" dos veces seguidas,
-- o generó uno nuevo el mes siguiente sin que el viejo se hubiera
-- cancelado). Esos cobros "pending" viejos se quedaban dando vueltas en la
-- tabla para siempre. payments.getPendingForClient() trae "el pending más
-- reciente" — pero si el cliente después SÍ pagó con un cobro más nuevo
-- (que quedó 'confirmed'), esa consulta seguía encontrando el viejo
-- 'pending' abandonado (más reciente que otros pending, aunque no que los
-- confirmed) y se lo mostraba como si siguiera esperando confirmación. Con
-- el bloqueo de app nuevo (20260912000000) esto pasó de ser una molestia
-- cosmética a dejar a un cliente que YA pagó viendo "Esperando
-- confirmación..." para siempre en vez de "Estás al día".
--
-- Dos partes: 1) create_cash_charge() cancela cualquier pending anterior
-- del mismo cliente antes de crear el nuevo (mismo signature, se reemplaza
-- en el lugar). 2) limpieza puntual de los pending ya abandonados en
-- producción (identificados como: existe OTRO pago del mismo cliente más
-- nuevo que ellos — si no hay nada más nuevo, es el pending activo de
-- verdad y no se toca).

update public.payments p
set status = 'cancelled'
where p.status = 'pending'
  and exists (
    select 1 from public.payments p2
    where p2.client_user_id = p.client_user_id and p2.created_at > p.created_at
  );

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

  update public.payments set status = 'cancelled'
    where client_user_id = p_client_user_id and status = 'pending';

  insert into public.payments (client_user_id, gym_id, amount, status, created_by)
  values (p_client_user_id, v_gym_id, v_amount, 'pending', auth.uid())
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;
