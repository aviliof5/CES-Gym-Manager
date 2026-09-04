-- Bolá — rol "dueño", parte 1/2: tipos y tabla nueva.
--
-- Separado en dos migraciones a propósito: Postgres no deja usar un valor
-- de enum recién agregado (ALTER TYPE ... ADD VALUE) dentro de la misma
-- transacción en la que se agregó — hay que confirmarlo primero. Como el
-- SQL Editor de Supabase corre todo el script pegado como una sola
-- transacción implícita, esta parte (que solo agrega el valor y crea tipos/
-- tablas que no lo usan todavía) tiene que ejecutarse — y confirmarse —
-- antes que la parte 2 (funciones/RLS que sí comparan contra 'owner').

alter type user_role add value if not exists 'owner';

create type approval_status as enum ('pending', 'approved', 'rejected');

-- Igual que `trainers`: datos específicos del rol admin, separados de
-- `profiles` (común a los 4 roles). gym_id nullable por el mismo motivo que
-- en trainers/client_profiles — se completa recién en join_gym() (parte 2).

create table public.gym_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  gym_id uuid references public.gyms(id) on delete cascade,
  status approval_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index gym_admins_gym_id_idx on public.gym_admins(gym_id);

alter table public.gym_admins enable row level security;
