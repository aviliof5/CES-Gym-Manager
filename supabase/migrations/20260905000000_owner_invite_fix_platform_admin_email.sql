-- Bolá — Fase 16, corrección: `20260904000400_owner_invite_and_gym_invites.sql`
-- marcó `is_platform_admin = true` para `fernandezavilio5@gmail.com`, asumiendo
-- que esa era la cuenta real de dueño en producción (ver
-- docs/ARCHITECTURE_AUDIT.md §7) — resultó no existir con ese email exacto.
-- Verificado contra producción (2026-09-05):
--   bf825898@gmail.com                  → role='owner'  (el dueño real del gym)
--   fernandezavilio5+cestest@gmail.com  → role='admin'  (cuenta de prueba con el email real, alias +cestest)
-- Decisión confirmada con el usuario: marcar la cuenta de admin con el
-- email real (fernandezavilio5+cestest@gmail.com), no la de owner.

update public.profiles
  set is_platform_admin = true
  where email = 'fernandezavilio5+cestest@gmail.com';
