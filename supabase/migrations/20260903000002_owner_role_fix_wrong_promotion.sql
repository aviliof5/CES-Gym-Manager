-- Bolá — corrección puntual tras aplicar 20260903000001_owner_role_2_logic.sql.
--
-- Esa migración asumía un solo gimnasio en producción (`select owner_user_id
-- from public.gyms limit 1`, sin filtro). En los hechos había DOS gimnasios:
-- uno de prueba ("Gimnasio de Prueba CES", dueño fernandezavilio5+cestest@gmail.com)
-- y uno real de un cliente externo ("Fight Club Gym", dueño bf825898@gmail.com).
-- El `limit 1` sin `order by` agarró el gimnasio de prueba y promovió esa
-- cuenta a 'owner' por error — se revierte acá a 'admin', que es su estado
-- correcto (sigue siendo una cuenta de prueba pendiente de borrado, no un
-- dueño real). Ver docs/MIGRATION_PLAN.md y el bloque ya corregido en
-- 20260903000001_owner_role_2_logic.sql (que ahora promueve a todos los
-- dueños de gimnasio reales, no solo a uno).
--
-- Ya se aplicó a mano en el SQL Editor el 2026-09-03; este archivo solo deja
-- el cambio documentado en el historial de migraciones para que quede
-- trazable.

alter table public.profiles disable trigger profiles_role_immutable;

update public.profiles
  set role = 'admin'
  where email = 'fernandezavilio5+cestest@gmail.com' and role = 'owner';

-- Y el dueño real que el `limit 1` original debió haber promovido:
update public.profiles
  set role = 'owner'
  where email = 'bf825898@gmail.com' and role = 'admin';

alter table public.profiles enable trigger profiles_role_immutable;
