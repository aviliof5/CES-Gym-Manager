-- Bolá — datos de ejemplo para desarrollo local (supabase db reset).
-- Espejo de los datos de muestra del prototipo (app.js) para poder comparar
-- uno a uno. No usar este script contra un proyecto real.
--
-- Cuentas de prueba (contraseña entre paréntesis):
--   admin@bola.app  (admin123)   — dueño de PowerHouse Gym
--   marco@bola.app  (coach123)   — entrenador, aprobado
--   laura@bola.app  (coach123)   — entrenador, aprobado
--   diego@bola.app  (coach123)   — entrenador, aprobado
--   carla@bola.app  (cliente123) — Plan Premium + Marco
--   jorge@bola.app  (cliente123) — Plan Básico + Laura, pendiente
--   ana@bola.app    (cliente123) — Plan Básico + Laura, vencido
--   luis@bola.app   (cliente123) — Plan Premium + Marco
--   sofia@bola.app  (cliente123) — Plan Básico + Diego

do $$
declare
  v_instance_id uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values
    (v_instance_id, 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin@bola.app', crypt('admin123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"admin","name":"Avilio Fernández","phone":"555-0100"}', now(), now(), '', '', '', ''),
    (v_instance_id, 'b0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'marco@bola.app', crypt('coach123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"trainer","name":"Marco Díaz","phone":"555-0201","specialty":"Fuerza e hipertrofia","price":20}', now(), now(), '', '', '', ''),
    (v_instance_id, 'b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'laura@bola.app', crypt('coach123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"trainer","name":"Laura Gómez","phone":"555-0202","specialty":"Pérdida de peso y cardio","price":15}', now(), now(), '', '', '', ''),
    (v_instance_id, 'b0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'diego@bola.app', crypt('coach123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"trainer","name":"Diego Ruiz","phone":"555-0203","specialty":"Funcional y movilidad","price":10}', now(), now(), '', '', '', ''),
    (v_instance_id, 'c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'carla@bola.app', crypt('cliente123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"client","name":"Carla Méndez","phone":"555-0301"}', now(), now(), '', '', '', ''),
    (v_instance_id, 'c0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'jorge@bola.app', crypt('cliente123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"client","name":"Jorge Salinas","phone":"555-0302"}', now(), now(), '', '', '', ''),
    (v_instance_id, 'c0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'ana@bola.app', crypt('cliente123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"client","name":"Ana Torres","phone":"555-0303"}', now(), now(), '', '', '', ''),
    (v_instance_id, 'c0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'luis@bola.app', crypt('cliente123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"client","name":"Luis Rivas","phone":"555-0304"}', now(), now(), '', '', '', ''),
    (v_instance_id, 'c0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'sofia@bola.app', crypt('cliente123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"client","name":"Sofía Paredes","phone":"555-0305"}', now(), now(), '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now()
  from auth.users
  where id in (
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000005'
  );
end $$;

-- Cada auth.users insertado arriba disparó handle_new_user(), que ya creó
-- profiles (+ trainers/client_profiles según el rol) con gym_id en null.
-- Ahora se completa la asignación al gimnasio, tal como haría create_gym()
-- / join_gym() — acá se hace con UPDATE directo porque el seed corre sin
-- sesión autenticada (auth.uid() no existe fuera de una request real).

insert into public.gyms (id, name, address, hours, owner_user_id) values
  ('11111111-1111-1111-1111-111111111111', 'PowerHouse Gym', 'Av. Central 123', '6:00 - 22:00', 'a0000000-0000-0000-0000-000000000001');

update public.profiles set gym_id = '11111111-1111-1111-1111-111111111111'
  where id in (
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000005'
  );

insert into public.equipment (gym_id, name)
select '11111111-1111-1111-1111-111111111111', unnest(array[
  'Caminadora', 'Bicicleta estática', 'Rack de sentadillas', 'Banco de press', 'Mancuernas', 'Máquina de poleas', 'Remo'
]);

insert into public.plans (id, gym_id, name, price, duration) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Plan Básico', 25, 'mensual'),
  ('d0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Plan Premium', 60, 'mensual');

-- specialty/price de los entrenadores ya quedaron cargados por el trigger de
-- alta (venían en raw_user_meta_data); acá falta gym_id y aprobarlos. El
-- trigger que protege trainers.status se desactiva solo para este bloque.

update public.trainers set gym_id = '11111111-1111-1111-1111-111111111111', status = 'approved'
  where user_id in (
    'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003'
  );

update public.client_profiles set
  gym_id = '11111111-1111-1111-1111-111111111111', plan_id = 'd0000000-0000-0000-0000-000000000002',
  trainer_user_id = 'b0000000-0000-0000-0000-000000000001', goal = 'ganar_musculo',
  membership_status = 'al_dia', membership_expires_at = current_date + interval '20 days',
  last_payment_at = '2026-07-05'
  where user_id = 'c0000000-0000-0000-0000-000000000001'; -- Carla

update public.client_profiles set
  gym_id = '11111111-1111-1111-1111-111111111111', plan_id = 'd0000000-0000-0000-0000-000000000001',
  trainer_user_id = 'b0000000-0000-0000-0000-000000000002',
  membership_status = 'pendiente', membership_expires_at = current_date + interval '20 days',
  last_payment_at = '2026-06-10'
  where user_id = 'c0000000-0000-0000-0000-000000000002'; -- Jorge

update public.client_profiles set
  gym_id = '11111111-1111-1111-1111-111111111111', plan_id = 'd0000000-0000-0000-0000-000000000001',
  trainer_user_id = 'b0000000-0000-0000-0000-000000000002',
  membership_status = 'vencido', membership_expires_at = current_date - interval '5 days',
  last_payment_at = '2026-05-02'
  where user_id = 'c0000000-0000-0000-0000-000000000003'; -- Ana

update public.client_profiles set
  gym_id = '11111111-1111-1111-1111-111111111111', plan_id = 'd0000000-0000-0000-0000-000000000002',
  trainer_user_id = 'b0000000-0000-0000-0000-000000000001',
  membership_status = 'al_dia', membership_expires_at = current_date + interval '20 days',
  last_payment_at = '2026-01-15'
  where user_id = 'c0000000-0000-0000-0000-000000000004'; -- Luis

update public.client_profiles set
  gym_id = '11111111-1111-1111-1111-111111111111', plan_id = 'd0000000-0000-0000-0000-000000000001',
  trainer_user_id = 'b0000000-0000-0000-0000-000000000003',
  membership_status = 'al_dia', membership_expires_at = current_date + interval '20 days',
  last_payment_at = '2026-07-18'
  where user_id = 'c0000000-0000-0000-0000-000000000005'; -- Sofía

-- Historial de cobros: monto = precio del plan + precio del entrenador,
-- igual que amount en finishClientReg() del frontend.
insert into public.payments (client_user_id, gym_id, amount, status, confirmed_by, confirmed_at) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 80, 'confirmed', 'a0000000-0000-0000-0000-000000000001', '2026-07-05'),
  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 40, 'confirmed', 'a0000000-0000-0000-0000-000000000001', '2026-06-10'),
  ('c0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 40, 'confirmed', 'a0000000-0000-0000-0000-000000000001', '2026-05-02'),
  ('c0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 80, 'confirmed', 'a0000000-0000-0000-0000-000000000001', '2026-01-15'),
  ('c0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 35, 'confirmed', 'a0000000-0000-0000-0000-000000000001', '2026-07-18');

insert into public.reviews (gym_id, client_user_id, rating, text, created_at) values
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 5, 'Excelente atención y máquinas nuevas.', '2026-07-10'),
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002', 4, 'Falta más espacio en horario pico.', '2026-07-08');
