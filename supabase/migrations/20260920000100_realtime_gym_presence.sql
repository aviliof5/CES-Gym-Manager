-- Bolá — habilita tiempo real para la presencia en el gym (ver
-- 20260920000000_gym_presence_sessions.sql). `gyms` había quedado afuera de
-- la publicación en 20260913000100_realtime_everything.sql ("catálogo, no
-- cambia en vivo") — ahora sí cambia en vivo (current_encargado_user_id/
-- current_encargado_since), así que se suma acá.
alter publication supabase_realtime add table public.gym_sessions;
alter publication supabase_realtime add table public.gyms;
