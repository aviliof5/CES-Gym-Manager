-- Bolá — esquema base
-- Multi-tenant por gimnasio: casi toda tabla lleva gym_id, y RLS (siguiente
-- migración) impide que un gimnasio vea datos de otro.

create extension if not exists "pgcrypto";

-- ---------- tipos ----------

create type user_role as enum ('admin', 'trainer', 'client');
create type trainer_status as enum ('pending', 'approved', 'rejected');
create type plan_duration as enum ('diario', 'mensual', 'anual');
create type membership_status as enum ('al_dia', 'pendiente', 'vencido');
create type experience_level as enum ('principiante', 'intermedio', 'avanzado');
create type training_goal as enum ('perder_peso', 'ganar_musculo', 'resistencia', 'tonificar');
create type routine_source as enum ('ia', 'trainer');
create type payment_status as enum ('pending', 'confirmed', 'cancelled');

-- ---------- gimnasios ----------

create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  hours text not null,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- ---------- perfiles (extiende auth.users) ----------
-- gym_id es nullable a propósito: un usuario existe (se registró) antes de
-- tener gimnasio asignado — lo obtiene vía create_gym() (admin) o join_gym()
-- (entrenador/cliente), ver 0002_functions.sql.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  gym_id uuid references public.gyms(id) on delete set null,
  name text not null default '',
  email text not null,
  phone text,
  created_at timestamptz not null default now()
);

create index profiles_gym_id_idx on public.profiles(gym_id);

-- ---------- equipo y planes ----------

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  duration plan_duration not null,
  created_at timestamptz not null default now()
);

-- ---------- entrenadores ----------

create table public.trainers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  gym_id uuid references public.gyms(id) on delete cascade,
  specialty text not null default 'General',
  price numeric(10,2) not null default 0 check (price >= 0),
  status trainer_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index trainers_gym_id_idx on public.trainers(gym_id);

-- ---------- clientes ----------
-- amount/type/lastPayment del prototipo se derivan (plan+entrenador, plans.duration,
-- payments) en vez de duplicarse; last_payment_at queda denormalizado por
-- conveniencia de lectura, pero payments es la fuente de verdad.

create table public.client_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  gym_id uuid references public.gyms(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  trainer_user_id uuid references public.trainers(user_id) on delete set null,
  face_photo_key text,
  weight numeric(5,2),
  height numeric(5,2),
  age smallint,
  level experience_level not null default 'principiante',
  goal training_goal not null default 'perder_peso',
  membership_status membership_status not null default 'pendiente',
  membership_expires_at date,
  last_payment_at timestamptz,
  created_at timestamptz not null default now()
);

create index client_profiles_gym_id_idx on public.client_profiles(gym_id);
create index client_profiles_trainer_idx on public.client_profiles(trainer_user_id);

-- ---------- progreso ----------
-- un renglón por cliente y día: la restricción unique aplica a nivel de base
-- de datos el límite "una foto de progreso por día" (ver A-06 del plano).

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  storage_key text not null,
  taken_at date not null default current_date,
  created_at timestamptz not null default now(),
  unique (client_user_id, taken_at)
);

-- ---------- rutinas ----------
-- una rutina "ia" por cliente+meta, una rutina "trainer" por cliente — los
-- índices únicos parciales de abajo aplican esa regla.

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  source routine_source not null,
  goal training_goal,
  author_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index routines_one_trainer_per_client
  on public.routines(client_user_id) where source = 'trainer';
create unique index routines_one_ai_per_client_goal
  on public.routines(client_user_id, goal) where source = 'ia';

create table public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  position smallint not null,
  text text not null
);

create index routine_exercises_routine_idx on public.routine_exercises(routine_id);

-- ---------- pagos ----------
-- efectivo únicamente (ver ADR-01): no hay procesador ni número de tarjeta.
-- Sin política de INSERT/UPDATE directa — todo pasa por las funciones de
-- 0002_functions.sql, que exigen rol admin. Ver también el comentario sobre
-- GRANT por columna en client_profiles, en esa misma migración.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  method text not null default 'efectivo',
  status payment_status not null default 'pending',
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create index payments_client_idx on public.payments(client_user_id);
create index payments_gym_idx on public.payments(gym_id);

-- ---------- reseñas ----------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  client_user_id uuid references public.client_profiles(user_id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  text text not null,
  created_at timestamptz not null default now()
);

-- ---------- tráfico agregado ----------
-- Tabla lista para cuando haya check-ins reales; el frontend hoy sigue
-- usando la distribución de ejemplo, no está conectado a esta tabla todavía.

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  hour smallint not null check (hour between 0 and 23),
  count integer not null default 0,
  unique (gym_id, day_of_week, hour)
);
