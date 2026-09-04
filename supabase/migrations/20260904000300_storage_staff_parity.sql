-- Bolá — corrige un hallazgo abierto desde la migración de owner-role
-- (ver docs/SECURITY_AUDIT.md, "Hallazgo abierto — política de Storage
-- desalineada con owner-role"): la política de lectura de fotos seguía
-- comparando `app_role() = 'admin'` literal, así que un DUEÑO no podía ver
-- las fotos de progreso de sus propios clientes — a diferencia de todo el
-- resto de las políticas del proyecto, que ya usan
-- `app_role_is_staff()` (admin U owner) desde 20260903000001_owner_role_2_logic.sql.
--
-- De paso se renombran las 3 políticas: decían "owner" refiriéndose al
-- DUEÑO DEL ARCHIVO (el cliente cuya foto es), de cuando "owner" todavía no
-- era un rol de la app — ahora que sí lo es, ese nombre confunde. Pasan a
-- decir "client" (quien sube/reemplaza su propia foto).

drop policy "owner uploads own photos" on storage.objects;
create policy "client uploads own photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy "owner replaces own photos" on storage.objects;
create policy "client replaces own photos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy "owner, their trainer, or gym admin can view photos" on storage.objects;
create policy "client, their trainer, or gym staff can view photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_client_trainer(((storage.foldername(name))[2])::uuid)
      or (public.app_role_is_staff() and (storage.foldername(name))[1] = public.app_gym_id()::text)
    )
  );

-- Segundo hallazgo de esta misma auditoría (Fase 12, no documentado antes):
-- la política de LECTURA DE METADATOS en progress_photos (storage_key,
-- taken_at) tenía el mismo problema y ni siquiera estaba anotada como
-- pendiente — quedó afuera por completo de 20260903000001_owner_role_2_logic.sql,
-- que sí cubrió equipment/plans/trainers/client_profiles/payments/checkins
-- pero no esta tabla. Sin este fix, un dueño podía ver la FOTO (una vez
-- arreglado el bucket arriba) pero no la fila que dice cuándo se tomó.
drop policy "admin reads progress in their gym" on public.progress_photos;
create policy "staff reads progress in their gym" on public.progress_photos
  for select to authenticated
  using (
    public.app_role_is_staff()
    and exists (
      select 1 from public.client_profiles cp
      where cp.user_id = progress_photos.client_user_id and cp.gym_id = public.app_gym_id()
    )
  );
