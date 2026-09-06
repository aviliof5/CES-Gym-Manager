/* Bolá — el QR del cobro pasa a ser solo del lado del dueño/admin; el
   cliente lo escanea (no lo muestra) para confirmar su propio pago. Antes
   ambos lados dibujaban el mismo QR decorativo y la única confirmación real
   era un botón manual del staff — ahora el cliente puede confirmar
   escaneando, además del botón manual (que se mantiene por si el cliente no
   tiene cámara a mano). Ver src/qr.js (mecánica de escaneo, ya existía para
   check-in) y ACTIONS.handlePaymentScan en actions.js.

   De paso: confirm_cash_payment() ponía membership_expires_at = +30 días
   siempre, sin importar el plan — un socio con plan diario quedaba "al día"
   por un mes entero con un solo pago de un día. Ahora respeta
   plans.duration del plan actual del cliente. */

create or replace function public.confirm_cash_payment(p_payment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments%rowtype;
  v_duration plan_duration;
  v_interval interval;
begin
  select * into v_payment from public.payments where id = p_payment_id;
  if v_payment.id is null or v_payment.gym_id is distinct from public.app_gym_id() then
    raise exception 'No autorizado para este cobro.';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Este cobro ya fue procesado.';
  end if;

  -- Confirma el staff del gimnasio (como siempre, botón manual) o el propio
  -- cliente de ese cobro (escaneando el QR que le muestra el mostrador) —
  -- nunca un cliente ajeno a este cobro puntual.
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

  update public.client_profiles
    set membership_status = 'al_dia',
        last_payment_at = now(),
        membership_expires_at = current_date + v_interval
    where user_id = v_payment.client_user_id;
end;
$$;
