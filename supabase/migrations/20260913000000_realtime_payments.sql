-- Bolá — el cliente se entera solo cuando le confirman el pago, sin tener
-- que recargar la página (conversación 2026-09-07: "la pagina de cliente
-- hay que estarla recargando para que se actualice... un administrador
-- confirma un pago del cliente y al cliente automaticamente le llega").
--
-- `payments` entra a la publicación `supabase_realtime` (hoy vacía — 0
-- tablas, verificado antes de escribir esto) para que
-- BolaAPI.payments.subscribeToClient() (ver supabase-client.js) reciba los
-- cambios por Postgres Realtime en vez de que el cliente tenga que
-- refrescar a mano. La política "self reads own payments" (migración
-- 20260720120200_rls.sql) ya filtra esto por RLS del lado del servidor —
-- agregar la tabla acá no abre nada nuevo, solo prende el canal.

alter publication supabase_realtime add table public.payments;
