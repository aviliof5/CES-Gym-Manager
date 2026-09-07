-- Bolá — segunda parte de 20260911000000_weekly_personal_routines.sql,
-- en archivo aparte porque referencia el valor 'personal' del enum que
-- agregó la primera — no pueden ir en la misma transacción (restricción
-- real de Postgres sobre "alter type ... add value").

alter table public.routine_exercises add column if not exists day_of_week smallint check (day_of_week between 0 and 6);

create unique index if not exists routines_one_personal_per_client
  on public.routines(client_user_id) where source = 'personal';

create policy "self creates own personal routine" on public.routines
  for insert to authenticated
  with check (client_user_id = auth.uid() and source = 'personal');
