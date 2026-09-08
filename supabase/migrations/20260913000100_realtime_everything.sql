-- Bolá — extiende Realtime a todo lo que tiene sentido que se actualice
-- solo, sin recargar la página (conversación 2026-09-07: primero solo
-- pagos, después "hazlo para todo"). Mismo criterio de seguridad que
-- `payments` (20260913000000_realtime_payments.sql): agregar una tabla acá
-- no abre nada nuevo — Postgres Realtime sigue respetando la RLS que cada
-- tabla ya tenía, esto solo prende el canal.
--
-- Quedan afuera a propósito las tablas que son catálogo/config y no
-- cambian mientras alguien tiene la app abierta (exercises, plans,
-- program_templates, equipment, achievements, gyms) — suscribirse a esas
-- sería puro gasto sin ningún beneficio real.

alter publication supabase_realtime add table public.notifications;        -- evento nuevo -> bell del cliente
alter publication supabase_realtime add table public.staff_notifications;  -- pago confirmado por QR -> bell del staff
alter publication supabase_realtime add table public.client_profiles;      -- suspender/reactivar, o cualquier cambio de estado
alter publication supabase_realtime add table public.classes;              -- calendario: evento nuevo/borrado
alter publication supabase_realtime add table public.class_sessions;       -- calendario: sesión nueva/borrada
alter publication supabase_realtime add table public.class_bookings;       -- calendario: alguien reservó/canceló
alter publication supabase_realtime add table public.checkin_events;       -- asistencia: alguien entró
alter publication supabase_realtime add table public.messages;             -- chat cliente <-> entrenador
