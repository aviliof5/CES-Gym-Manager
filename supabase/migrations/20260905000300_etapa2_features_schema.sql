-- Bolá — Etapas 2-4 del rediseño Fight Club: esquema para las funciones
-- nuevas de los mockups (reservas, logros, biblioteca de ejercicios,
-- mensajes, récords personales, medidas corporales, rating de entrenadores)
-- + estructurar las rutinas (hoy un solo campo de texto libre, sin peso ni
-- descanso por ejercicio). Todo lo que agrega esta migración es NUEVO —
-- ninguna tabla existente pierde datos ni cambia de forma para lo que ya
-- usa el frontend actual.
--
-- Convención seguida en todo el archivo (la misma de las migraciones
-- anteriores): las tablas "catálogo" que solo el staff administra (clases,
-- ejercicios) usan RLS directo para INSERT/UPDATE/DELETE, igual que
-- equipment/plans. Las escrituras con una regla real detrás (reservar un
-- cupo limitado, sumar un mensaje) son RPC security definer, nunca un
-- INSERT directo desde el cliente.

-- ==================== Biblioteca de ejercicios ====================
-- gym_id NULL = catálogo global (compartido por todos los gimnasios,
-- sembrado a mano — ver seed más abajo). Con gym_id = catálogo propio de
-- ESE gimnasio, para cuando un dueño quiera agregar ejercicios que no
-- existen en el global. media_key queda NULL hasta que el dueño suba las
-- fotos reales (Etapa de estilo, pendiente) — se muestra un espacio
-- reservado (.thumb--pending, ver styles.css) mientras tanto, nunca una
-- imagen inventada.
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid references public.gyms(id) on delete cascade,
  name text not null,
  muscle_group text not null default 'General',
  equipment_name text,
  media_key text,
  description text,
  created_at timestamptz not null default now()
);

create index exercises_gym_idx on public.exercises(gym_id);

alter table public.exercises enable row level security;

create policy "anyone can read the exercise library" on public.exercises
  for select to authenticated
  using (gym_id is null or gym_id = public.app_gym_id());

create policy "staff manages their gym's exercises" on public.exercises
  for all to authenticated
  using (gym_id is not null and gym_id = public.app_gym_id() and public.app_role_is_staff())
  with check (gym_id is not null and gym_id = public.app_gym_id() and public.app_role_is_staff());

-- Seed mínimo del catálogo global — los mismos 8 que ya sugería
-- EQUIPMENT_SUGGESTIONS del lado del cliente, para que la biblioteca no
-- arranque vacía. El dueño puede agregar los suyos propios encima.
insert into public.exercises (gym_id, name, muscle_group, equipment_name) values
  (null, 'Press de banca', 'Pecho', 'Banco de press'),
  (null, 'Sentadilla con barra', 'Piernas', 'Rack de sentadillas'),
  (null, 'Peso muerto', 'Espalda', null),
  (null, 'Press militar', 'Hombros', null),
  (null, 'Curl con barra', 'Brazos', 'Mancuernas'),
  (null, 'Sprint en cinta', 'Cardio', 'Caminadora'),
  (null, 'Remo con mancuerna', 'Espalda', 'Mancuernas'),
  (null, 'Circuito funcional', 'Cuerpo completo', null);

-- ==================== Rutinas estructuradas ====================
-- Todas opcionales y agregadas encima de la columna `text` existente (se
-- deja intacta como resumen de respaldo) — las filas viejas, solo texto
-- libre, siguen funcionando igual que hoy.

alter table public.routine_exercises add column if not exists exercise_id uuid references public.exercises(id) on delete set null;
alter table public.routine_exercises add column if not exists sets smallint;
alter table public.routine_exercises add column if not exists reps text;
alter table public.routine_exercises add column if not exists weight_kg numeric(6,2);
alter table public.routine_exercises add column if not exists rest_seconds smallint not null default 60;

comment on column public.routine_exercises.reps is 'Texto, no número — admite series en pirámide como "10-8-6-6", no solo un valor fijo.';

-- ==================== Perfil enriquecido de entrenador y cliente ====================

alter table public.trainers add column if not exists bio text;
alter table public.trainers add column if not exists photo_key text;
alter table public.client_profiles add column if not exists avatar_key text;

-- ==================== Rating de entrenador ====================
-- Reseña del ENTRENADOR (distinta de public.reviews, que es del gimnasio).
-- Un cliente reseña a un entrenador una sola vez (unique) — si quiere
-- corregir su nota, actualiza esa misma fila, no se acumulan duplicados.

create table public.trainer_reviews (
  id uuid primary key default gen_random_uuid(),
  trainer_user_id uuid not null references public.trainers(user_id) on delete cascade,
  client_user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  text text,
  created_at timestamptz not null default now(),
  unique (trainer_user_id, client_user_id)
);

alter table public.trainer_reviews enable row level security;

create policy "gym members read trainer reviews" on public.trainer_reviews
  for select to authenticated
  using (exists (select 1 from public.trainers t where t.user_id = trainer_reviews.trainer_user_id and t.gym_id = public.app_gym_id()));

create or replace function public.rate_trainer(p_trainer_user_id uuid, p_rating smallint, p_text text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() is distinct from 'client' then
    raise exception 'Solo un cliente puede calificar a su entrenador.';
  end if;
  if not public.is_client_trainer(p_trainer_user_id) then
    raise exception 'Solo podés calificar a tu propio entrenador asignado.';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'La calificación tiene que ser entre 1 y 5.';
  end if;

  insert into public.trainer_reviews (trainer_user_id, client_user_id, rating, text)
  values (p_trainer_user_id, auth.uid(), p_rating, nullif(trim(p_text), ''))
  on conflict (trainer_user_id, client_user_id)
    do update set rating = excluded.rating, text = excluded.text, created_at = now();
end;
$$;

grant execute on function public.rate_trainer(uuid, smallint, text) to authenticated;

-- ==================== Medidas corporales (serie histórica) ====================
-- client_profiles.weight/height ya existían pero eran un solo valor
-- pisable — esto es una serie temporal de verdad, una fila por día, para
-- poder graficar evolución real (no inventada) en la tab Progreso.

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  taken_at date not null default current_date,
  weight_kg numeric(5,2),
  body_fat_pct numeric(4,1),
  waist_cm numeric(5,1),
  chest_cm numeric(5,1),
  arm_cm numeric(5,1),
  thigh_cm numeric(5,1),
  created_at timestamptz not null default now(),
  unique (client_user_id, taken_at)
);

alter table public.body_measurements enable row level security;

create policy "self reads own measurements" on public.body_measurements
  for select to authenticated
  using (client_user_id = auth.uid());

create policy "trainer reads assigned client measurements" on public.body_measurements
  for select to authenticated
  using (public.is_client_trainer(client_user_id));

create policy "self writes own measurements" on public.body_measurements
  for insert to authenticated
  with check (client_user_id = auth.uid());

create policy "self updates today's measurement" on public.body_measurements
  for update to authenticated
  using (client_user_id = auth.uid())
  with check (client_user_id = auth.uid());

-- ==================== Sesiones de entrenamiento + récords personales ====================
-- Hasta acá el modo entrenamiento vivía SOLO en memoria (ver
-- docs/ARCHITECTURE_AUDIT.md) — nada de lo que entrenabas quedaba
-- guardado, así que "récords personales" y "entrenamientos este mes" eran
-- imposibles de mostrar sin inventar el dato. Esto lo hace real.

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  source routine_source not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  client_user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  exercise_name text not null,
  set_number smallint,
  reps smallint,
  weight_kg numeric(6,2),
  created_at timestamptz not null default now()
);

create index exercise_logs_client_name_idx on public.exercise_logs(client_user_id, exercise_name);

alter table public.workout_sessions enable row level security;
alter table public.exercise_logs enable row level security;

create policy "self manages own workout sessions" on public.workout_sessions
  for all to authenticated
  using (client_user_id = auth.uid())
  with check (client_user_id = auth.uid());

create policy "trainer reads assigned client sessions" on public.workout_sessions
  for select to authenticated
  using (public.is_client_trainer(client_user_id));

create policy "self manages own exercise logs" on public.exercise_logs
  for all to authenticated
  using (client_user_id = auth.uid())
  with check (client_user_id = auth.uid());

create policy "trainer reads assigned client logs" on public.exercise_logs
  for select to authenticated
  using (public.is_client_trainer(client_user_id));

-- El PR (récord personal) es simplemente el peso máximo registrado para
-- ese nombre de ejercicio — no hace falta una tabla aparte, se calcula con
-- una consulta agregada; se expone como función para no repetir el SQL en
-- cada cliente.
create or replace function public.get_personal_records(p_client_user_id uuid)
returns table (exercise_name text, max_weight_kg numeric, achieved_at timestamptz)
language sql security definer stable set search_path = public as $$
  select distinct on (el.exercise_name)
    el.exercise_name, el.weight_kg, el.created_at
  from public.exercise_logs el
  where el.client_user_id = p_client_user_id
    and el.weight_kg is not null
    and (el.client_user_id = auth.uid() or public.is_client_trainer(el.client_user_id) or public.app_role_is_staff())
  order by el.exercise_name, el.weight_kg desc, el.created_at asc;
$$;

grant execute on function public.get_personal_records(uuid) to authenticated;

-- ==================== Logros / medallas ====================
-- Catálogo global (no por gimnasio, son logros de la app) + progreso por
-- cliente. El progreso se recalcula en base a datos reales (check-ins,
-- sesiones de entrenamiento) con evaluate_achievements(), nunca se marca
-- "a mano" desde el frontend.

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  icon text not null default 'crown',
  target integer not null default 1,
  metric text not null check (metric in ('checkins', 'workouts', 'streak_days')),
  created_at timestamptz not null default now()
);

create table public.client_achievements (
  client_user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  progress integer not null default 0,
  earned_at timestamptz,
  primary key (client_user_id, achievement_id)
);

alter table public.achievements enable row level security;
alter table public.client_achievements enable row level security;

create policy "anyone reads the achievement catalog" on public.achievements
  for select to authenticated using (true);

create policy "self reads own achievement progress" on public.client_achievements
  for select to authenticated using (client_user_id = auth.uid());

create policy "trainer reads assigned client achievements" on public.client_achievements
  for select to authenticated using (public.is_client_trainer(client_user_id));

insert into public.achievements (code, name, description, icon, target, metric) values
  ('first_workout', 'Primer entrenamiento', 'Completaste tu primera sesión.', 'zap', 1, 'workouts'),
  ('ten_workouts', '10 entrenamientos', 'Completaste 10 sesiones de entrenamiento.', 'dumbbell', 10, 'workouts'),
  ('hundred_workouts', '100 entrenamientos', 'Completaste 100 sesiones de entrenamiento.', 'crown', 100, 'workouts'),
  ('streak_30', '30 días consecutivos', 'Te registraste 30 días seguidos.', 'clock', 30, 'streak_days');

-- Recalcula el progreso de logros de UN cliente contra datos reales — se
-- llama después de terminar un entrenamiento o registrar un check-in (ver
-- finish_workout_session() más abajo y check_in_client() ya existente).
-- security definer porque client_achievements no tiene política de INSERT
-- para el cliente (el progreso no lo escribe él, lo calcula el servidor).
create or replace function public.evaluate_achievements(p_client_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_workouts integer;
  v_checkins integer;
  a record;
begin
  select count(*) into v_workouts from public.workout_sessions where client_user_id = p_client_user_id and finished_at is not null;
  select count(*) into v_checkins from public.checkin_events where client_user_id = p_client_user_id;

  for a in select * from public.achievements loop
    insert into public.client_achievements (client_user_id, achievement_id, progress, earned_at)
    values (
      p_client_user_id, a.id,
      case a.metric when 'workouts' then v_workouts when 'checkins' then v_checkins else 0 end,
      case when (case a.metric when 'workouts' then v_workouts when 'checkins' then v_checkins else 0 end) >= a.target then now() else null end
    )
    on conflict (client_user_id, achievement_id) do update set
      progress = excluded.progress,
      earned_at = coalesce(public.client_achievements.earned_at, excluded.earned_at);
  end loop;
end;
$$;

-- ==================== Cierre real de una sesión de entrenamiento ====================
-- Reemplaza el "no se persiste nada" de antes: el cliente abre una sesión
-- al entrar al modo entrenamiento, registra sus series (insert directo en
-- exercise_logs, ya cubierto por la política de arriba) y la cierra acá.

create or replace function public.finish_workout_session(p_session_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.workout_sessions
    set finished_at = now()
    where id = p_session_id and client_user_id = auth.uid() and finished_at is null;

  if not found then
    raise exception 'Esa sesión no existe, no es tuya, o ya estaba cerrada.';
  end if;

  perform public.evaluate_achievements(auth.uid());
end;
$$;

grant execute on function public.finish_workout_session(uuid) to authenticated;

-- ==================== Clases y reservas ====================
-- classes/class_sessions son catálogo administrado por staff (mismo patrón
-- que equipment/plans, RLS directo). class_bookings SÍ necesita un RPC:
-- reservar contra un cupo limitado tiene una condición de carrera real si
-- se dejara como INSERT directo (dos clientes reservando el último cupo al
-- mismo tiempo), así que book_class() valida el cupo con un lock.

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null,
  description text,
  trainer_user_id uuid references public.trainers(user_id) on delete set null,
  duration_minutes smallint not null default 60,
  capacity smallint not null default 20,
  created_at timestamptz not null default now()
);

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  starts_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.class_bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  client_user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  status text not null default 'reservado' check (status in ('reservado', 'cancelado', 'asistio')),
  created_at timestamptz not null default now(),
  unique (session_id, client_user_id)
);

create index class_sessions_class_idx on public.class_sessions(class_id);
create index class_bookings_session_idx on public.class_bookings(session_id);

alter table public.classes enable row level security;
alter table public.class_sessions enable row level security;
alter table public.class_bookings enable row level security;

create policy "gym members read classes" on public.classes
  for select to authenticated using (gym_id = public.app_gym_id());
create policy "staff manages classes" on public.classes
  for all to authenticated
  using (gym_id = public.app_gym_id() and public.app_role_is_staff())
  with check (gym_id = public.app_gym_id() and public.app_role_is_staff());

create policy "gym members read class sessions" on public.class_sessions
  for select to authenticated using (gym_id = public.app_gym_id());
create policy "staff manages class sessions" on public.class_sessions
  for all to authenticated
  using (gym_id = public.app_gym_id() and public.app_role_is_staff())
  with check (gym_id = public.app_gym_id() and public.app_role_is_staff());

create policy "self reads own bookings" on public.class_bookings
  for select to authenticated using (client_user_id = auth.uid());
create policy "staff reads bookings in their gym" on public.class_bookings
  for select to authenticated using (gym_id = public.app_gym_id() and public.app_role_is_staff());

create or replace function public.book_class(p_session_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_gym_id uuid;
  v_capacity smallint;
  v_booked integer;
  v_booking_id uuid;
begin
  if public.app_role() is distinct from 'client' then
    raise exception 'Solo un cliente puede reservar una clase.';
  end if;

  select cs.gym_id, c.capacity into v_gym_id, v_capacity
    from public.class_sessions cs join public.classes c on c.id = cs.class_id
    where cs.id = p_session_id
    for update of cs;

  if v_gym_id is null then
    raise exception 'Esa clase no existe.';
  end if;
  if v_gym_id is distinct from public.app_gym_id() then
    raise exception 'Esa clase es de otro gimnasio.';
  end if;

  select count(*) into v_booked from public.class_bookings
    where session_id = p_session_id and status = 'reservado';

  if v_booked >= v_capacity then
    raise exception 'Esta clase ya no tiene cupo.';
  end if;

  insert into public.class_bookings (session_id, client_user_id, gym_id)
  values (p_session_id, auth.uid(), v_gym_id)
  on conflict (session_id, client_user_id) do update set status = 'reservado'
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

grant execute on function public.book_class(uuid) to authenticated;

create or replace function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.class_bookings
    set status = 'cancelado'
    where id = p_booking_id and client_user_id = auth.uid();

  if not found then
    raise exception 'Esa reserva no existe o no es tuya.';
  end if;
end;
$$;

grant execute on function public.cancel_booking(uuid) to authenticated;

-- ==================== Mensajes entrenador ↔ cliente ====================
-- Una conversación por par entrenador-cliente asignado. Las escrituras son
-- INSERT directo (no un RPC) porque la única regla real es "sos parte de
-- esta conversación", y eso ya lo resuelve la política de RLS —no hay
-- condición de carrera ni cálculo server-side detrás de mandar un mensaje.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  trainer_user_id uuid not null references public.trainers(user_id) on delete cascade,
  client_user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (trainer_user_id, client_user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index messages_conversation_idx on public.messages(conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "participants read their conversation" on public.conversations
  for select to authenticated
  using (trainer_user_id = auth.uid() or client_user_id = auth.uid());

create policy "participants read their messages" on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.trainer_user_id = auth.uid() or c.client_user_id = auth.uid())
  ));

create policy "participants send messages in their conversation" on public.messages
  for insert to authenticated
  with check (
    sender_user_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.trainer_user_id = auth.uid() or c.client_user_id = auth.uid())
    )
  );

-- Encuentra o crea la conversación entre el cliente/entrenador que llama y
-- el otro lado — evita que el frontend tenga que adivinar si ya existe.
-- Exige que sean efectivamente entrenador↔cliente ASIGNADO uno del otro
-- (is_client_trainer), no cualquier par de cuentas del mismo gimnasio.
create or replace function public.get_or_create_conversation(p_other_user_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_trainer_id uuid;
  v_client_id uuid;
  v_conv_id uuid;
begin
  if public.app_role() = 'client' then
    v_client_id := auth.uid();
    v_trainer_id := p_other_user_id;
  elsif public.app_role() = 'trainer' then
    v_trainer_id := auth.uid();
    v_client_id := p_other_user_id;
  else
    raise exception 'Solo un cliente o un entrenador tienen conversaciones.';
  end if;

  if not public.is_client_trainer(v_trainer_id) then
    raise exception 'Esa conversación es solo entre un entrenador y su propio cliente asignado.';
  end if;

  select id into v_conv_id from public.conversations
    where trainer_user_id = v_trainer_id and client_user_id = v_client_id;

  if v_conv_id is null then
    insert into public.conversations (gym_id, trainer_user_id, client_user_id)
    values (public.app_gym_id(), v_trainer_id, v_client_id)
    returning id into v_conv_id;
  end if;

  return v_conv_id;
end;
$$;

grant execute on function public.get_or_create_conversation(uuid) to authenticated;

-- ==================== check_in_client() ahora también evalúa logros ====================
-- check_in_client() es de 20260904000100_checkin_events.sql, anterior a que
-- existiera evaluate_achievements() — mismo cuerpo, agrega la llamada al
-- final. Misma firma (create or replace la reemplaza in-place, no crea un
-- overload).

create or replace function public.check_in_client(p_client_user_id uuid)
returns public.checkin_events
language plpgsql security definer set search_path = public as $$
declare
  v_client_gym_id uuid;
  v_row public.checkin_events;
begin
  if not public.app_role_is_staff() then
    raise exception 'Solo el administrador o el dueño del gimnasio registran un check-in.';
  end if;

  select gym_id into v_client_gym_id from public.client_profiles where user_id = p_client_user_id;
  if v_client_gym_id is null or v_client_gym_id is distinct from public.app_gym_id() then
    raise exception 'Ese cliente no pertenece a tu gimnasio.';
  end if;

  insert into public.checkin_events (gym_id, client_user_id, checked_in_by)
  values (v_client_gym_id, p_client_user_id, auth.uid())
  returning * into v_row;

  perform public.evaluate_achievements(p_client_user_id);

  return v_row;
end;
$$;

grant execute on function public.check_in_client(uuid) to authenticated;
