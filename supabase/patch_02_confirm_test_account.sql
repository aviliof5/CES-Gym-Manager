-- Confirma a mano la cuenta de prueba, sin depender del correo (el servicio
-- de email gratis/compartido de Supabase es poco confiable para esto).
-- Esto NO desactiva el requisito de confirmación para el resto de usuarios
-- — solo marca esta cuenta puntual como ya confirmada.

update auth.users
set email_confirmed_at = now()
where email = 'fernandezavilio5+cestest@gmail.com'
  and email_confirmed_at is null;

-- Verificación: debería devolver 1 fila con email_confirmed_at ya con fecha.
select id, email, email_confirmed_at from auth.users
where email = 'fernandezavilio5+cestest@gmail.com';
