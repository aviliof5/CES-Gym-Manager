-- Bolá — Etapa 0 del rediseño Fight Club: ajustes de base que desbloquean el
-- resto de las etapas. Tres cosas independientes, todas chicas:
--
--   1. Moneda por gimnasio. Hoy el frontend imprime "$" literal en ~15 lugares
--      y no hay dónde guardar la moneda real del gym (los posters del cliente
--      están en CUP). Se guarda el CÓDIGO ISO; el símbolo lo resuelve el
--      frontend, así no hay que migrar datos si mañana cambia el formato.
--
--   2. Marca por gimnasio (columnas preparadas, todavía sin usar). La decisión
--      confirmada fue "marca global ahora, preparada para separar después":
--      la app se pinta con Fight Club para todos, pero dejar las columnas ya
--      creadas hace que el día que un segundo gimnasio compre el producto, el
--      cambio sea leerlas en el arranque en vez de una migración con datos
--      reales encima.
--
--   3. Se elimina la regla de los 10 clientes interesados para aprobar a un
--      entrenador. La regla se agregó en 20260904000200 (Fase 11), pero el
--      modelo cambió: ahora el entrenador llega por un link que le manda el
--      propio dueño, así que la confianza ya está — el dueño aprueba a mano.
--      `trainer_candidate_interest` NO se borra: el interés de los clientes
--      sigue siendo información útil para el dueño al decidir, solo deja de
--      ser un requisito bloqueante.
--
-- Nota sobre el enum: 'suspendido' se agrega acá pero NINGUNA función de esta
-- migración lo referencia. Postgres no permite usar un valor de enum nuevo en
-- la misma transacción en que se crea, y el SQL Editor corre todo el archivo
-- como una sola transacción — por eso el RPC de suspender socios va en su
-- propia migración más adelante (Etapa 4), no acá.

-- ==================== 1. Moneda y marca por gimnasio ====================

alter table public.gyms add column if not exists currency text not null default 'USD';
alter table public.gyms add column if not exists brand_name text;
alter table public.gyms add column if not exists brand_color text;
alter table public.gyms add column if not exists brand_logo_key text;

comment on column public.gyms.currency is 'Código ISO 4217 (USD, CUP, EUR...). El símbolo lo resuelve el frontend.';
comment on column public.gyms.brand_color is 'Color de acento en hex, ej. #E23744. NULL = usa la marca por defecto de la app.';
comment on column public.gyms.brand_logo_key is 'Ruta en el bucket de Storage. NULL = usa el logo por defecto.';

-- Los pagos guardan la moneda con la que se cobraron: si el gimnasio la cambia
-- más adelante, el historial no se reescribe solo.
alter table public.payments add column if not exists currency text;

-- ==================== 2. Estado suspendido para socios ====================

alter type public.membership_status add value if not exists 'suspendido';

alter table public.client_profiles add column if not exists suspended_at timestamptz;
alter table public.client_profiles add column if not exists suspended_reason text;

-- ==================== 3. Aprobación de entrenador sin el gate de 10 ====================

create or replace function public.approve_trainer(p_trainer_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.app_role_is_staff() then
    raise exception 'Solo el administrador o el dueño del gimnasio aprueban entrenadores.';
  end if;

  update public.trainers
    set status = 'approved'
    where user_id = p_trainer_user_id and gym_id = public.app_gym_id();
end;
$$;
