-- Confirma a mano la cuenta de cliente de prueba. El link de confirmación
-- por correo redirige a la Site URL del proyecto (localhost, hoy no
-- alcanzable desde un celular), así que la confirmación no llega a
-- completarse al probar desde el teléfono. Esto NO desactiva el requisito
-- de confirmación para el resto de usuarios — solo marca esta cuenta
-- puntual como ya confirmada.

update auth.users
set email_confirmed_at = now()
where email = 'fernandezavilio5+cesclient@gmail.com'
  and email_confirmed_at is null;

-- Verificación: debería devolver 1 fila con email_confirmed_at ya con fecha.
select id, email, email_confirmed_at from auth.users
where email = 'fernandezavilio5+cesclient@gmail.com';
