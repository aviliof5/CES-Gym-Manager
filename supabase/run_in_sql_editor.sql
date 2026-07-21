-- Bolá — las 4 migraciones combinadas, en orden, para pegar de una sola vez
-- en Supabase Dashboard → SQL Editor → New query → Run.
-- (Generado a partir de supabase/migrations/*.sql — esos archivos siguen
-- siendo la fuente de verdad si en algún momento se usa la CLI en su lugar.)

-- ============================================================
-- 1/4 — esquema base
-- ============================================================

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
-- (entrenador/cliente), ver más abajo.

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

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references public.client_profiles(user_id) on delete cascade,
  -- nullable: el cliente registra el check-in del día primero (ensureToday)
  -- y sube la foto después, en un segundo paso (setPhoto).
  storage_key text,
  taken_at date not null default current_date,
  created_at timestamptz not null default now(),
  unique (client_user_id, taken_at)
);

-- ---------- rutinas ----------

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
-- efectivo únicamente: no hay procesador ni número de tarjeta. Sin política
-- de INSERT/UPDATE directa — todo pasa por las funciones de la sección 2,
-- que exigen rol admin.

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

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  hour smallint not null check (hour between 0 and 23),
  count integer not null default 0,
  unique (gym_id, day_of_week, hour)
);

-- ============================================================
-- 2/4 — funciones
-- ============================================================

create or replace function public.app_role()
returns user_role
language sql security definer stable set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.app_gym_id()
returns uuid
language sql security definer stable set search_path = public as $$
  select gym_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_client_trainer(p_client_user_id uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from public.client_profiles cp
    where cp.user_id = p_client_user_id and cp.trainer_user_id = auth.uid()
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role user_role := coalesce((new.raw_user_meta_data->>'role')::user_role, 'client');
begin
  insert into public.profiles (id, role, name, email, phone)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.email,
    new.raw_user_meta_data->>'phone'
  );

  if v_role = 'trainer' then
    insert into public.trainers (user_id, specialty, price, status)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'specialty', 'General'),
      coalesce((new.raw_user_meta_data->>'price')::numeric, 0),
      'pending'
    );
  elsif v_role = 'client' then
    insert into public.client_profiles (user_id) values (new.id);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.prevent_role_change()
returns trigger language plpgsql as $$
begin
  if new.role <> old.role then
    raise exception 'El rol de un usuario no se puede cambiar.';
  end if;
  return new;
end;
$$;

create trigger profiles_role_immutable
  before update on public.profiles
  for each row execute function public.prevent_role_change();

create or replace function public.create_gym(p_name text, p_address text, p_hours text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_gym_id uuid;
begin
  if public.app_role() is distinct from 'admin' then
    raise exception 'Solo una cuenta de administrador puede crear un gimnasio.';
  end if;
  if public.app_gym_id() is not null then
    raise exception 'Esta cuenta ya tiene un gimnasio asignado.';
  end if;

  insert into public.gyms (name, address, hours, owner_user_id)
  values (p_name, p_address, p_hours, auth.uid())
  returning id into v_gym_id;

  update public.profiles set gym_id = v_gym_id where id = auth.uid();

  return v_gym_id;
end;
$$;

create or replace function public.join_gym(p_gym_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() is null or public.app_role() not in ('trainer', 'client') then
    raise exception 'Solo entrenadores y clientes se unen a un gimnasio con esta función.';
  end if;
  if public.app_gym_id() is not null then
    raise exception 'Esta cuenta ya pertenece a un gimnasio.';
  end if;
  if not exists (select 1 from public.gyms where id = p_gym_id) then
    raise exception 'Ese gimnasio no existe.';
  end if;

  update public.profiles set gym_id = p_gym_id where id = auth.uid();
  update public.trainers set gym_id = p_gym_id where user_id = auth.uid();
  update public.client_profiles set gym_id = p_gym_id where user_id = auth.uid();
end;
$$;

create or replace function public.approve_trainer(p_trainer_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() is distinct from 'admin' then
    raise exception 'Solo el administrador del gimnasio aprueba entrenadores.';
  end if;
  update public.trainers
    set status = 'approved'
    where user_id = p_trainer_user_id and gym_id = public.app_gym_id();
end;
$$;

create or replace function public.reject_trainer(p_trainer_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() is distinct from 'admin' then
    raise exception 'Solo el administrador del gimnasio rechaza entrenadores.';
  end if;
  update public.trainers
    set status = 'rejected'
    where user_id = p_trainer_user_id and gym_id = public.app_gym_id();
end;
$$;

create or replace function public.create_cash_charge(p_client_user_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_amount numeric(10,2);
  v_gym_id uuid;
  v_payment_id uuid;
begin
  if public.app_role() is distinct from 'admin' then
    raise exception 'Solo el administrador del gimnasio genera un cobro.';
  end if;

  select coalesce(p.price, 0) + coalesce(t.price, 0), cp.gym_id
    into v_amount, v_gym_id
    from public.client_profiles cp
    left join public.plans p on p.id = cp.plan_id
    left join public.trainers t on t.user_id = cp.trainer_user_id
    where cp.user_id = p_client_user_id;

  if v_gym_id is null or v_gym_id is distinct from public.app_gym_id() then
    raise exception 'Ese cliente no pertenece a tu gimnasio.';
  end if;

  insert into public.payments (client_user_id, gym_id, amount, status)
  values (p_client_user_id, v_gym_id, v_amount, 'pending')
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

create or replace function public.confirm_cash_payment(p_payment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments%rowtype;
begin
  if public.app_role() is distinct from 'admin' then
    raise exception 'Solo el staff del gimnasio puede confirmar un cobro.';
  end if;

  select * into v_payment from public.payments where id = p_payment_id;
  if v_payment.id is null or v_payment.gym_id is distinct from public.app_gym_id() then
    raise exception 'No autorizado para este cobro.';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Este cobro ya fue procesado.';
  end if;

  update public.payments
    set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
    where id = p_payment_id;

  update public.client_profiles
    set membership_status = 'al_dia',
        last_payment_at = now(),
        membership_expires_at = current_date + interval '30 days'
    where user_id = v_payment.client_user_id;
end;
$$;

create or replace function public.cancel_cash_payment(p_payment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_gym_id uuid;
  v_status payment_status;
begin
  if public.app_role() is distinct from 'admin' then
    raise exception 'Solo el staff del gimnasio puede cancelar un cobro.';
  end if;

  select gym_id, status into v_gym_id, v_status from public.payments where id = p_payment_id;
  if v_gym_id is null or v_gym_id is distinct from public.app_gym_id() then
    raise exception 'No autorizado para este cobro.';
  end if;
  if v_status <> 'pending' then
    raise exception 'Este cobro ya fue procesado.';
  end if;

  update public.payments set status = 'cancelled' where id = p_payment_id;
end;
$$;

grant execute on function public.create_gym(text, text, text) to authenticated;
grant execute on function public.join_gym(uuid) to authenticated;
grant execute on function public.approve_trainer(uuid) to authenticated;
grant execute on function public.reject_trainer(uuid) to authenticated;
grant execute on function public.create_cash_charge(uuid) to authenticated;
grant execute on function public.confirm_cash_payment(uuid) to authenticated;
grant execute on function public.cancel_cash_payment(uuid) to authenticated;

-- ============================================================
-- 3/4 — Row Level Security
-- ============================================================

alter table public.gyms enable row level security;
alter table public.profiles enable row level security;
alter table public.equipment enable row level security;
alter table public.plans enable row level security;
alter table public.trainers enable row level security;
alter table public.client_profiles enable row level security;
alter table public.progress_photos enable row level security;
alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;
alter table public.checkins enable row level security;

create policy "any authenticated user can browse gyms" on public.gyms
  for select to authenticated
  using (true);

create policy "admin creates their own gym" on public.gyms
  for insert to authenticated
  with check (owner_user_id = auth.uid());

create policy "owner updates their gym" on public.gyms
  for update to authenticated
  using (owner_user_id = auth.uid());

create policy "self can read own profile" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "gym members can read each other" on public.profiles
  for select to authenticated
  using (gym_id is not null and gym_id = public.app_gym_id());

create policy "self can update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid());

create policy "gym members read equipment" on public.equipment
  for select to authenticated
  using (gym_id = public.app_gym_id());

create policy "admin manages equipment" on public.equipment
  for all to authenticated
  using (gym_id = public.app_gym_id() and public.app_role() = 'admin')
  with check (gym_id = public.app_gym_id() and public.app_role() = 'admin');

create policy "gym members read plans" on public.plans
  for select to authenticated
  using (gym_id = public.app_gym_id());

create policy "admin manages plans" on public.plans
  for all to authenticated
  using (gym_id = public.app_gym_id() and public.app_role() = 'admin')
  with check (gym_id = public.app_gym_id() and public.app_role() = 'admin');

create policy "gym members read approved trainers" on public.trainers
  for select to authenticated
  using (
    (gym_id = public.app_gym_id() and status = 'approved')
    or user_id = auth.uid()
    or (public.app_role() = 'admin' and gym_id = public.app_gym_id())
  );

create policy "trainer creates own application" on public.trainers
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

create policy "trainer edits own profile" on public.trainers
  for update to authenticated
  using (user_id = auth.uid());

create policy "admin edits trainers in their gym" on public.trainers
  for update to authenticated
  using (public.app_role() = 'admin' and gym_id = public.app_gym_id());

revoke update on public.trainers from authenticated;
grant update (specialty, price) on public.trainers to authenticated;

create policy "self reads own client profile" on public.client_profiles
  for select to authenticated
  using (user_id = auth.uid());

create policy "admin reads clients in their gym" on public.client_profiles
  for select to authenticated
  using (public.app_role() = 'admin' and gym_id = public.app_gym_id());

create policy "assigned trainer reads their client" on public.client_profiles
  for select to authenticated
  using (trainer_user_id = auth.uid());

create policy "self creates own client profile" on public.client_profiles
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "self updates own client profile" on public.client_profiles
  for update to authenticated
  using (user_id = auth.uid());

revoke update on public.client_profiles from authenticated;
grant update (plan_id, trainer_user_id, face_photo_key, weight, height, age, level, goal)
  on public.client_profiles to authenticated;

create policy "self reads own progress" on public.progress_photos
  for select to authenticated
  using (client_user_id = auth.uid());

create policy "trainer reads assigned client progress" on public.progress_photos
  for select to authenticated
  using (public.is_client_trainer(client_user_id));

create policy "admin reads progress in their gym" on public.progress_photos
  for select to authenticated
  using (
    public.app_role() = 'admin'
    and exists (
      select 1 from public.client_profiles cp
      where cp.user_id = progress_photos.client_user_id and cp.gym_id = public.app_gym_id()
    )
  );

create policy "self writes own progress" on public.progress_photos
  for insert to authenticated
  with check (client_user_id = auth.uid());

create policy "self updates today's progress photo" on public.progress_photos
  for update to authenticated
  using (client_user_id = auth.uid());

create policy "self reads own routines" on public.routines
  for select to authenticated
  using (client_user_id = auth.uid());

create policy "trainer reads assigned client routines" on public.routines
  for select to authenticated
  using (public.is_client_trainer(client_user_id));

create policy "self creates own ai routine" on public.routines
  for insert to authenticated
  with check (client_user_id = auth.uid() and source = 'ia' and author_user_id is null);

create policy "trainer creates routine for assigned client" on public.routines
  for insert to authenticated
  with check (source = 'trainer' and author_user_id = auth.uid() and public.is_client_trainer(client_user_id));

create policy "write exercises via owned routine" on public.routine_exercises
  for all to authenticated
  using (
    exists (
      select 1 from public.routines r
      where r.id = routine_exercises.routine_id
        and (r.client_user_id = auth.uid() or public.is_client_trainer(r.client_user_id))
    )
  )
  with check (
    exists (
      select 1 from public.routines r
      where r.id = routine_exercises.routine_id
        and (r.client_user_id = auth.uid() or public.is_client_trainer(r.client_user_id))
    )
  );

create policy "self reads own payments" on public.payments
  for select to authenticated
  using (client_user_id = auth.uid());

create policy "admin reads payments in their gym" on public.payments
  for select to authenticated
  using (public.app_role() = 'admin' and gym_id = public.app_gym_id());

create policy "gym members read reviews" on public.reviews
  for select to authenticated
  using (gym_id = public.app_gym_id());

create policy "client posts own review" on public.reviews
  for insert to authenticated
  with check (client_user_id = auth.uid() and gym_id = public.app_gym_id());

create policy "gym members read checkins" on public.checkins
  for select to authenticated
  using (gym_id = public.app_gym_id());

create policy "admin writes checkins" on public.checkins
  for all to authenticated
  using (gym_id = public.app_gym_id() and public.app_role() = 'admin')
  with check (gym_id = public.app_gym_id() and public.app_role() = 'admin');

-- ============================================================
-- 4/4 — almacenamiento (fotos)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

create policy "owner uploads own photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "owner replaces own photos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "owner, their trainer, or gym admin can view photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_client_trainer(((storage.foldername(name))[2])::uuid)
      or (public.app_role() = 'admin' and (storage.foldername(name))[1] = public.app_gym_id()::text)
    )
  );
