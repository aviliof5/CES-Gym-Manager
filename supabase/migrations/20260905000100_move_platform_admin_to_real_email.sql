-- Bolá — Fase 16, seguimiento: el usuario olvidó la contraseña de
-- fernandezavilio5+cestest@gmail.com (la cuenta que había quedado marcada
-- is_platform_admin en 20260905000000_owner_invite_fix_platform_admin_email.sql)
-- y prefirió registrar su email real de una, en vez de resetear esa
-- contraseña. Se registró como cliente (fernandezavilio5@gmail.com, el
-- único alta que no exige invitación) y confirmó el correo — mueve el
-- permiso de plataforma a esa cuenta nueva y se lo saca a la vieja, para
-- que quede una sola cuenta con acceso a la tab "Plataforma".

update public.profiles set is_platform_admin = false where email = 'fernandezavilio5+cestest@gmail.com';
update public.profiles set is_platform_admin = true where email = 'fernandezavilio5@gmail.com';
