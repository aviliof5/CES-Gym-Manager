-- El check-in diario de progreso se crea SIN foto (ensureToday) y la foto
-- se sube después en un segundo paso (setPhoto) — pero storage_key había
-- quedado como NOT NULL en el schema original, así que el primer paso
-- fallaba siempre con "null value in column storage_key violates not-null
-- constraint". Lo hacemos nullable para que coincida con cómo lo usa la app.

alter table public.progress_photos alter column storage_key drop not null;
