-- Bolá — foto por máquina/equipo (pedido: "en la parte de agregar las
-- máquinas del admin y del dueño les de opción de poner una foto de la
-- máquina y que le salgan las máquinas con foto luego a los clientes").
--
-- equipment.photo_key sigue el mismo patrón que client_profiles.face_photo_key
-- y progress_photos.storage_key: guarda la RUTA dentro del bucket 'photos',
-- no la URL (las URLs firmadas se piden al vuelo, ver BolaAPI.photos.signedUrl
-- en supabase-client.js). La ruta usada es
-- `<gym_id>/equipment/<equipment_id>.jpg` — a diferencia de las fotos de
-- cliente (`<gym_id>/<client_user_id>/...`), acá el segundo segmento es el
-- literal "equipment" en vez de un user id, así que las políticas de
-- Storage nuevas comparan ese segmento contra 'equipment' en vez de contra
-- auth.uid()/is_client_trainer().

alter table public.equipment add column if not exists photo_key text;

-- Subir/reemplazar la foto: solo staff (dueño o admin) del propio gimnasio
-- — mismo criterio que "staff manages equipment" (RLS de la tabla, ver
-- 20260903000001_owner_role_2_logic.sql), para que un admin/dueño de OTRO
-- gimnasio no pueda escribir acá aunque adivine la ruta.
create policy "staff uploads equipment photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[2] = 'equipment'
    and public.app_role_is_staff()
    and (storage.foldername(name))[1] = public.app_gym_id()::text
  );

create policy "staff replaces equipment photos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[2] = 'equipment'
    and public.app_role_is_staff()
    and (storage.foldername(name))[1] = public.app_gym_id()::text
  );

-- Ver la foto: cualquier miembro del gimnasio (cliente, entrenador o
-- staff) — a diferencia de la foto de rostro, esta SÍ es para que la vean
-- todos los socios ("máquinas con foto para los clientes"), no privada de
-- un cliente puntual.
create policy "gym members view equipment photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[2] = 'equipment'
    and (storage.foldername(name))[1] = public.app_gym_id()::text
  );
