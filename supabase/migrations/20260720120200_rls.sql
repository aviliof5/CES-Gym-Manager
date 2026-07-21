-- Bolá — Row Level Security
-- Cada tabla queda cerrada por defecto; cada política abre exactamente lo
-- que la matriz de permisos del plano (A-03) autoriza. Si una tabla no tiene
-- política de INSERT/UPDATE, esa operación queda prohibida para
-- "authenticated" aunque alguien intente pegarle directo a la API REST.

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

-- ---------- gyms ----------
-- Lectura abierta a cualquier usuario autenticado (no solo a sus propios
-- miembros): un entrenador o cliente recién registrado, con gym_id todavía
-- en null, necesita poder ver qué gimnasios existen para poder unirse a
-- alguno con join_gym(). name/address/hours no son datos sensibles — es
-- justo la información que un gimnasio quiere que se vea para conseguir
-- clientes.

create policy "any authenticated user can browse gyms" on public.gyms
  for select to authenticated
  using (true);

create policy "admin creates their own gym" on public.gyms
  for insert to authenticated
  with check (owner_user_id = auth.uid());

create policy "owner updates their gym" on public.gyms
  for update to authenticated
  using (owner_user_id = auth.uid());

-- ---------- profiles ----------

create policy "self can read own profile" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "gym members can read each other" on public.profiles
  for select to authenticated
  using (gym_id is not null and gym_id = public.app_gym_id());

create policy "self can update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid());

-- ---------- equipment ----------

create policy "gym members read equipment" on public.equipment
  for select to authenticated
  using (gym_id = public.app_gym_id());

create policy "admin manages equipment" on public.equipment
  for all to authenticated
  using (gym_id = public.app_gym_id() and public.app_role() = 'admin')
  with check (gym_id = public.app_gym_id() and public.app_role() = 'admin');

-- ---------- plans ----------

create policy "gym members read plans" on public.plans
  for select to authenticated
  using (gym_id = public.app_gym_id());

create policy "admin manages plans" on public.plans
  for all to authenticated
  using (gym_id = public.app_gym_id() and public.app_role() = 'admin')
  with check (gym_id = public.app_gym_id() and public.app_role() = 'admin');

-- ---------- trainers ----------
-- status solo cambia vía approve_trainer()/reject_trainer(). Esas funciones
-- corren como el dueño de la función (postgres), a quien este REVOKE no
-- alcanza — por eso column-level GRANT y no un trigger: un trigger "before
-- update" dispara también dentro de esas mismas funciones y se bloquearía a
-- sí mismo, ya que no hay forma de que el trigger distinga "vino de
-- approve_trainer()" de "vino de un UPDATE cualquiera".

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

-- ---------- client_profiles ----------
-- membership_status / membership_expires_at / last_payment_at NO están en la
-- lista de columnas otorgadas más abajo: nadie puede tocarlas con un UPDATE
-- normal, ni el cliente ni el admin — solo confirm_cash_payment(), que corre
-- como el dueño de la función y no está sujeta a este GRANT.

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

-- ---------- progress_photos ----------

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

-- ---------- routines ----------

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

-- routine_exercises hereda el permiso a través de la rutina dueña: el
-- cliente agrega/edita solo dentro de su propia rutina "ia"; el entrenador
-- solo dentro de la rutina "trainer" del cliente que tiene asignado.

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

-- ---------- payments ----------
-- Sin políticas de insert/update: todo pasa por create_cash_charge(),
-- confirm_cash_payment() y cancel_cash_payment().

create policy "self reads own payments" on public.payments
  for select to authenticated
  using (client_user_id = auth.uid());

create policy "admin reads payments in their gym" on public.payments
  for select to authenticated
  using (public.app_role() = 'admin' and gym_id = public.app_gym_id());

-- ---------- reviews ----------

create policy "gym members read reviews" on public.reviews
  for select to authenticated
  using (gym_id = public.app_gym_id());

create policy "client posts own review" on public.reviews
  for insert to authenticated
  with check (client_user_id = auth.uid() and gym_id = public.app_gym_id());

-- ---------- checkins ----------

create policy "gym members read checkins" on public.checkins
  for select to authenticated
  using (gym_id = public.app_gym_id());

create policy "admin writes checkins" on public.checkins
  for all to authenticated
  using (gym_id = public.app_gym_id() and public.app_role() = 'admin')
  with check (gym_id = public.app_gym_id() and public.app_role() = 'admin');
