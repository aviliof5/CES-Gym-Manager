-- Confirma a mano la cuenta de entrenador de prueba (mismo motivo que el
-- patch 03: el link de confirmación redirige a la Site URL del proyecto,
-- localhost, no alcanzable desde el celular).

update auth.users
set email_confirmed_at = now()
where email = 'fernandezavilio5+cestrainer@gmail.com'
  and email_confirmed_at is null;

-- Verificación: debería devolver 1 fila con email_confirmed_at ya con fecha.
select id, email, email_confirmed_at from auth.users
where email = 'fernandezavilio5+cestrainer@gmail.com';
