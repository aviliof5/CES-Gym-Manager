-- Bolá — almacenamiento de fotos
-- Bucket privado. Convención de ruta: {gym_id}/{client_user_id}/face.jpg
-- y {gym_id}/{client_user_id}/progress/{fecha}.jpg — las políticas leen esos
-- primeros dos segmentos de la ruta con storage.foldername().

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
