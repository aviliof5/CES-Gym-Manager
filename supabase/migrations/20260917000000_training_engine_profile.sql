-- Bolá — Fight Club Training Engine, Fase 2: perfil de evaluación del
-- cliente (ver docs/FIGHT_CLUB_TRAINING_ENGINE_AUDIT.md).
--
-- Todo lo que agrega esta migración es NUEVO — ninguna tabla existente
-- cambia de forma ni pierde datos. client_profiles.goal/level (enums
-- training_goal/experience_level, 4 y 3 valores) NO se tocan: los sigue
-- usando el resto de la app. El motor guarda acá su propio objetivo (9
-- opciones) y su propia granularidad de experiencia como texto, y deriva
-- el level "grueso" de client_profiles a partir de esto.
--
-- Sin RPC: la única regla de escritura es "es mío" — mismo patrón que
-- body_measurements / messages (RLS directo, sin security definer).
--
-- IMPORTANTE sobre lesiones/dolor (pedido §11, §31): estos datos son
-- RESTRICCIONES CONSERVADORAS para el generador, nunca un diagnóstico. El
-- motor no afirma que un ejercicio sea seguro ni que "cure" nada.

-- ==================== training_profiles ====================
-- 1:1 con client_profiles. Se llena/actualiza cuando el cliente toca
-- "Generar rutina con IA" y completa el formulario de evaluación.
create table public.training_profiles (
  user_id uuid primary key references public.client_profiles(user_id) on delete cascade,
  gym_id uuid references public.gyms(id) on delete cascade,

  -- Identificación (nada obligatorio salvo el objetivo principal)
  sex text check (sex in ('masculino', 'femenino', 'prefiero_no_decir')),

  -- Objetivo (§6) — texto, no enum: 9 opciones y puede haber uno secundario
  primary_goal text not null,
  secondary_goal text,

  -- Experiencia (§7) — dos ejes: cuánto hace que entrena, y qué tan cómodo
  -- se siente. El motor DERIVA de acá el level principiante/intermedio/
  -- avanzado y lo sincroniza a client_profiles.level.
  training_time_bucket text check (training_time_bucket in ('nunca', 'menos_3m', '3_6m', '6_12m', '1_2a', 'mas_2a')),
  machine_comfort text check (machine_comfort in ('principiante', 'intermedio', 'avanzado')),

  -- Disponibilidad (§8) — afecta directamente la estructura y el volumen
  days_per_week smallint check (days_per_week between 2 and 6),
  session_minutes smallint check (session_minutes in (30, 45, 60, 75, 90)),

  -- Preferencias (§9)
  preferred_style text check (preferred_style in ('maquinas', 'pesas_libres', 'ambos', 'peso_corporal', 'indiferente')),
  priority_muscles text[] not null default '{}',

  -- Morfología (§12) — SOLO descriptivo. El motor NO lo usa para decidir
  -- ejercicios ni cargas.
  somatotype text check (somatotype in ('ectomorfo', 'mesomorfo', 'endomorfo')),

  evaluated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.training_profiles enable row level security;

create policy "self reads own training profile" on public.training_profiles
  for select to authenticated
  using (user_id = auth.uid());

create policy "trainer reads assigned client training profile" on public.training_profiles
  for select to authenticated
  using (public.is_client_trainer(user_id));

create policy "self writes own training profile" on public.training_profiles
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "self updates own training profile" on public.training_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ==================== client_exercise_preferences ====================
-- Ejercicios que el cliente NO quiere hacer (§10). El motor intenta
-- sustituirlos por una alternativa equivalente (mismo músculo + patrón),
-- usando SOLO ejercicios reales de la biblioteca.
create table public.client_exercise_preferences (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete cascade,
  exercise_name text not null,   -- resguardo si el ejercicio se borra de la biblioteca
  preference text not null check (preference in ('excluido', 'no_me_gusta')),
  created_at timestamptz not null default now(),
  unique (client_user_id, exercise_id)
);

create index client_exercise_preferences_client_idx on public.client_exercise_preferences(client_user_id);

alter table public.client_exercise_preferences enable row level security;

create policy "self manages own exercise preferences" on public.client_exercise_preferences
  for all to authenticated
  using (client_user_id = auth.uid())
  with check (client_user_id = auth.uid());

create policy "trainer reads assigned client exercise preferences" on public.client_exercise_preferences
  for select to authenticated
  using (public.is_client_trainer(client_user_id));

-- ==================== client_limitations ====================
-- Lesiones / dolores / limitaciones por articulación (§11). RESTRICCIÓN
-- CONSERVADORA, no diagnóstico. El motor evita patrones de movimiento
-- marcados como riesgosos para esa articulación y muestra el disclaimer
-- fijo.
create table public.client_limitations (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  joint text not null check (joint in ('ninguna', 'hombro', 'codo', 'muñeca', 'espalda', 'cadera', 'rodilla', 'tobillo', 'otra')),
  painful_movement boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

create index client_limitations_client_idx on public.client_limitations(client_user_id);

alter table public.client_limitations enable row level security;

create policy "self manages own limitations" on public.client_limitations
  for all to authenticated
  using (client_user_id = auth.uid())
  with check (client_user_id = auth.uid());

create policy "trainer reads assigned client limitations" on public.client_limitations
  for select to authenticated
  using (public.is_client_trainer(client_user_id));

-- ==================== Realtime ====================
-- Consistente con 20260913000100_realtime_everything.sql — el perfil y sus
-- restricciones se muestran también en el detalle del cliente del
-- entrenador, así que conviene que se refresquen solos.
alter publication supabase_realtime add table public.training_profiles;
alter publication supabase_realtime add table public.client_exercise_preferences;
alter publication supabase_realtime add table public.client_limitations;
