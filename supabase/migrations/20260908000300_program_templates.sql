-- Bolá — plantillas de programa/rutina (Programas + Rutinas de
-- Fight_Club_Gym_Base_Datos_Entrenamiento.xlsx). Catálogo global de
-- referencia, igual patrón que exercises (20260905000300_etapa2_features_
-- schema.sql) y su contenido real (20260908000200_exercise_library_real_
-- content.sql): sin gym_id, cualquier gimnasio lo lee, nadie lo escribe
-- desde el frontend por ahora.
--
-- Un "programa" (ej. "Push Pull Legs") tiene varios "días" (Push/Pull/
-- Legs/...), cada uno con su propia lista ordenada de ejercicios. Por eso
-- program_template_items lleva day_label y day_position — y
-- routine_exercises gana day_label también, para que un entrenador pueda
-- aplicar un programa entero a la rutina de un cliente sin perder a qué
-- día pertenece cada ejercicio. day_label queda NULL en todo lo que ya
-- existe (rutinas con IA, rutinas armadas a mano) — sigue siendo "todo en
-- una sola sesión", como hasta ahora; nada de lo viejo se rompe.
--
-- "Intensidad" ("RIR 2-3") y "Notas" ("Ajustar carga para mantener
-- técnica...") son el mismo texto en las 97 filas de la planilla — como
-- "Advertencias" en Ejercicios, no se guardan por fila: se muestran fijas
-- en la pantalla (ver src/screens/programs.js).

create table public.program_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  level text,
  goal text,
  days_per_week smallint,
  duration_label text,
  created_at timestamptz not null default now()
);

create table public.program_template_items (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.program_templates(id) on delete cascade,
  day_label text not null,
  day_position smallint not null,   -- orden del "día"/bloque dentro del programa (Push=1, Pull=2, Legs=3...)
  position smallint not null,       -- orden del ejercicio dentro de ese día
  exercise_id uuid references public.exercises(id) on delete set null,
  exercise_name text not null,
  sets smallint,
  reps text,
  rest_seconds smallint
);

create index program_template_items_program_idx on public.program_template_items(program_id);

alter table public.program_templates enable row level security;
alter table public.program_template_items enable row level security;

create policy "anyone can read program templates" on public.program_templates
  for select to authenticated using (true);
create policy "anyone can read program template items" on public.program_template_items
  for select to authenticated using (true);

alter table public.routine_exercises add column if not exists day_label text;

-- ==================== Seed: 10 programas ====================

-- Se crea con un id text temporal igual al de la planilla (P01..P10) y
-- se resuelve a los uuid reales de program_templates más abajo, en la
-- misma migración — no queda ninguna columna extra.
create temporary table tmp_programs (sheet_id text, name text, level text, goal text, days_per_week smallint, duration_label text) on commit drop;
insert into tmp_programs (sheet_id, name, level, goal, days_per_week, duration_label) values
  ('P01', 'Inicio 3 días', 'Principiante', 'Hipertrofia general', 3, '45-60 min'),
  ('P02', 'Full Body 3 días', 'Principiante', 'Fuerza general', 3, '45-60 min'),
  ('P03', 'Full Body Intermedio', 'Intermedio', 'Hipertrofia', 3, '60 min'),
  ('P04', 'Upper / Lower 4 días', 'Intermedio', 'Hipertrofia', 4, '60-75 min'),
  ('P05', 'Push Pull Legs', 'Intermedio', 'Hipertrofia', 6, '60-75 min'),
  ('P06', 'Fuerza 5x5', 'Intermedio', 'Fuerza', 3, '60 min'),
  ('P07', 'Pérdida de grasa + fuerza', 'Principiante', 'Pérdida de grasa', 4, '45-60 min'),
  ('P08', 'Boxeo + acondicionamiento', 'Principiante', 'Boxeo/Condición', 3, '45-60 min'),
  ('P09', 'Boxeo + fuerza', 'Intermedio', 'Boxeo/Fuerza', 4, '60-75 min'),
  ('P10', 'Core y acondicionamiento', 'Principiante', 'Core/Resistencia', 3, '30-45 min');

insert into public.program_templates (name, level, goal, days_per_week, duration_label)
select name, level, goal, days_per_week, duration_label from tmp_programs;

-- ==================== Seed: 97 asignaciones de ejercicio ====================
-- Ojo: la planilla solo desarrolló el día a día de 5 de los 10 programas
-- (P01-P05) — P06-P10 quedan como programa "de catálogo" sin ejercicios
-- todavía. La pantalla lo muestra como "sin ejercicios definidos" en vez
-- de inventar contenido; se puede completar más adelante.

-- seq = orden real de la planilla (1..97) — de ahí sacamos day_position
-- (en qué orden va cada "día"/bloque dentro de su programa: Push antes que
-- Pull antes que Legs, etc.), porque un SELECT sin ORDER BY no garantiza
-- devolver las filas en el orden en que se insertaron.
create temporary table tmp_routine_items (seq smallint, sheet_id text, day_label text, position smallint, exercise_lookup_name text, exercise_name text, sets smallint, reps text, rest_seconds smallint) on commit drop;
insert into tmp_routine_items (seq, sheet_id, day_label, position, exercise_lookup_name, exercise_name, sets, reps, rest_seconds) values
  (1, 'P01', 'Día 1', 1, 'Sentadilla goblet', 'Sentadilla goblet', 3, '10-12', 90),
  (2, 'P01', 'Día 1', 2, 'Press de banca con mancuernas', 'Press de banca con mancuernas', 3, '8-12', 90),
  (3, 'P01', 'Día 1', 3, 'Jalón al pecho', 'Jalón al pecho', 3, '10-12', 90),
  (4, 'P01', 'Día 1', 4, 'Peso muerto rumano', 'Peso muerto rumano', 2, '10-12', 90),
  (5, 'P01', 'Día 1', 5, 'Plancha', 'Plancha', 3, '30-45 s', 60),
  (6, 'P01', 'Día 2', 1, 'Prensa de piernas', 'Prensa de piernas', 3, '10-12', 90),
  (7, 'P01', 'Día 2', 2, 'Press de hombros con mancuernas', 'Press de hombros con mancuernas', 3, '8-12', 90),
  (8, 'P01', 'Día 2', 3, 'Remo sentado en polea', 'Remo sentado en polea', 3, '10-12', 90),
  (9, 'P01', 'Día 2', 4, 'Hip thrust con barra', 'Hip thrust con barra', 3, '10-12', 90),
  (10, 'P01', 'Día 2', 5, 'Crunch', 'Crunch', 3, '12-15', 60),
  (11, 'P01', 'Día 3', 1, 'Zancada atrás', 'Zancada atrás', 3, '8-10/lado', 90),
  (12, 'P01', 'Día 3', 2, null, 'Press de máquina', 3, '10-12', 90),
  (13, 'P01', 'Día 3', 3, 'Dominadas asistidas', 'Dominadas asistidas', 3, '8-12', 90),
  (14, 'P01', 'Día 3', 4, 'Curl femoral sentado', 'Curl femoral sentado', 3, '10-15', 75),
  (15, 'P01', 'Día 3', 5, 'Plancha lateral', 'Plancha lateral', 3, '30 s/lado', 60),
  (16, 'P02', 'Día 1', 1, 'Sentadilla goblet', 'Sentadilla goblet', 3, '8-12', 120),
  (17, 'P02', 'Día 1', 2, 'Press de banca con mancuernas', 'Press de banca con mancuernas', 3, '8-12', 120),
  (18, 'P02', 'Día 1', 3, 'Remo con mancuerna', 'Remo con mancuerna', 3, '8-12', 120),
  (19, 'P02', 'Día 1', 4, 'Hip thrust con barra', 'Hip thrust con barra', 3, '10-12', 90),
  (20, 'P02', 'Día 1', 5, 'Plancha', 'Plancha', 3, '30-45 s', 60),
  (21, 'P02', 'Día 2', 1, 'Prensa de piernas', 'Prensa de piernas', 3, '8-12', 120),
  (22, 'P02', 'Día 2', 2, 'Press de hombros con mancuernas', 'Press de hombros con mancuernas', 3, '8-12', 120),
  (23, 'P02', 'Día 2', 3, 'Jalón al pecho', 'Jalón al pecho', 3, '8-12', 120),
  (24, 'P02', 'Día 2', 4, 'Peso muerto rumano', 'Peso muerto rumano', 3, '8-12', 120),
  (25, 'P02', 'Día 2', 5, 'Crunch', 'Crunch', 3, '12-15', 60),
  (26, 'P02', 'Día 3', 1, 'Zancadas caminando', 'Zancadas caminando', 3, '8-10/lado', 90),
  (27, 'P02', 'Día 3', 2, 'Press en máquina', 'Press en máquina', 3, '8-12', 90),
  (28, 'P02', 'Día 3', 3, 'Remo sentado en polea', 'Remo sentado en polea', 3, '8-12', 90),
  (29, 'P02', 'Día 3', 4, 'Curl femoral tumbado', 'Curl femoral tumbado', 3, '10-15', 75),
  (30, 'P02', 'Día 3', 5, 'Plancha lateral', 'Plancha lateral', 3, '30-45 s/lado', 60),
  (31, 'P03', 'Día 1', 1, 'Sentadilla con barra', 'Sentadilla con barra', 4, '6-10', 150),
  (32, 'P03', 'Día 1', 2, 'Press de banca con barra', 'Press de banca con barra', 4, '6-10', 150),
  (33, 'P03', 'Día 1', 3, 'Remo con barra', 'Remo con barra', 4, '6-10', 150),
  (34, 'P03', 'Día 1', 4, 'Elevaciones laterales', 'Elevaciones laterales', 3, '12-15', 60),
  (35, 'P03', 'Día 1', 5, 'Curl de bíceps con barra', 'Curl de bíceps con barra', 3, '10-12', 75),
  (36, 'P03', 'Día 2', 1, 'Peso muerto rumano', 'Peso muerto rumano', 4, '6-10', 150),
  (37, 'P03', 'Día 2', 2, 'Press inclinado con mancuernas', 'Press inclinado con mancuernas', 4, '8-12', 120),
  (38, 'P03', 'Día 2', 3, 'Jalón al pecho', 'Jalón al pecho', 4, '8-12', 120),
  (39, 'P03', 'Día 2', 4, 'Hip thrust con barra', 'Hip thrust con barra', 3, '8-12', 120),
  (40, 'P03', 'Día 2', 5, 'Extensión de tríceps en polea', 'Extensión de tríceps en polea', 3, '10-15', 75),
  (41, 'P03', 'Día 3', 1, 'Prensa de piernas', 'Prensa de piernas', 4, '8-12', 120),
  (42, 'P03', 'Día 3', 2, 'Press de hombros con mancuernas', 'Press de hombros con mancuernas', 4, '8-12', 120),
  (43, 'P03', 'Día 3', 3, 'Remo en máquina', 'Remo en máquina', 4, '8-12', 120),
  (44, 'P03', 'Día 3', 4, 'Curl femoral sentado', 'Curl femoral sentado', 3, '10-15', 75),
  (45, 'P03', 'Día 3', 5, 'Crunch en polea', 'Crunch en polea', 3, '10-15', 60),
  (46, 'P04', 'Día 1 Upper', 1, 'Press de banca con barra', 'Press de banca con barra', 4, '6-10', 150),
  (47, 'P04', 'Día 1 Upper', 2, 'Remo con barra', 'Remo con barra', 4, '6-10', 150),
  (48, 'P04', 'Día 1 Upper', 3, 'Press de hombros con mancuernas', 'Press de hombros con mancuernas', 3, '8-12', 120),
  (49, 'P04', 'Día 1 Upper', 4, 'Jalón al pecho', 'Jalón al pecho', 3, '8-12', 120),
  (50, 'P04', 'Día 1 Upper', 5, 'Curl de bíceps con barra', 'Curl de bíceps con barra', 3, '10-12', 75),
  (51, 'P04', 'Día 1 Upper', 6, 'Extensión de tríceps en polea', 'Extensión de tríceps en polea', 3, '10-15', 75),
  (52, 'P04', 'Día 2 Lower', 1, 'Sentadilla con barra', 'Sentadilla con barra', 4, '6-10', 150),
  (53, 'P04', 'Día 2 Lower', 2, 'Peso muerto rumano', 'Peso muerto rumano', 4, '8-10', 150),
  (54, 'P04', 'Día 2 Lower', 3, 'Prensa de piernas', 'Prensa de piernas', 3, '10-12', 120),
  (55, 'P04', 'Día 2 Lower', 4, 'Curl femoral tumbado', 'Curl femoral tumbado', 3, '10-15', 75),
  (56, 'P04', 'Día 2 Lower', 5, 'Elevación de talones de pie', 'Elevación de talones de pie', 4, '10-15', 60),
  (57, 'P04', 'Día 3 Upper', 1, 'Press inclinado con mancuernas', 'Press inclinado con mancuernas', 4, '8-12', 120),
  (58, 'P04', 'Día 3 Upper', 2, 'Remo sentado en polea', 'Remo sentado en polea', 4, '8-12', 120),
  (59, 'P04', 'Día 3 Upper', 3, 'Press de hombros en máquina', 'Press de hombros en máquina', 3, '8-12', 120),
  (60, 'P04', 'Día 3 Upper', 4, 'Dominadas asistidas', 'Dominadas asistidas', 3, '8-12', 120),
  (61, 'P04', 'Día 3 Upper', 5, 'Curl martillo', 'Curl martillo', 3, '10-12', 75),
  (62, 'P04', 'Día 3 Upper', 6, 'Press francés', 'Press francés', 3, '10-12', 75),
  (63, 'P04', 'Día 4 Lower', 1, 'Sentadilla hack', 'Sentadilla hack', 4, '8-12', 120),
  (64, 'P04', 'Día 4 Lower', 2, 'Hip thrust con barra', 'Hip thrust con barra', 4, '8-12', 120),
  (65, 'P04', 'Día 4 Lower', 3, 'Zancada atrás', 'Zancada atrás', 3, '10/lado', 90),
  (66, 'P04', 'Día 4 Lower', 4, 'Curl femoral sentado', 'Curl femoral sentado', 3, '10-15', 75),
  (67, 'P04', 'Día 4 Lower', 5, 'Elevación de talones sentado', 'Elevación de talones sentado', 4, '12-15', 60),
  (68, 'P05', 'Push', 1, 'Press de banca con barra', 'Press de banca con barra', 4, '6-10', 150),
  (69, 'P05', 'Push', 2, 'Press inclinado con mancuernas', 'Press inclinado con mancuernas', 3, '8-12', 120),
  (70, 'P05', 'Push', 3, 'Press de hombros con mancuernas', 'Press de hombros con mancuernas', 3, '8-12', 120),
  (71, 'P05', 'Push', 4, 'Elevaciones laterales', 'Elevaciones laterales', 4, '12-15', 60),
  (72, 'P05', 'Push', 5, 'Extensión de tríceps en polea', 'Extensión de tríceps en polea', 3, '10-15', 75),
  (73, 'P05', 'Pull', 1, 'Dominadas', 'Dominadas', 4, '6-10', 150),
  (74, 'P05', 'Pull', 2, 'Remo con barra', 'Remo con barra', 4, '6-10', 150),
  (75, 'P05', 'Pull', 3, 'Remo sentado en polea', 'Remo sentado en polea', 3, '8-12', 120),
  (76, 'P05', 'Pull', 4, 'Face pull', 'Face pull', 3, '12-15', 60),
  (77, 'P05', 'Pull', 5, 'Curl martillo', 'Curl martillo', 3, '10-12', 75),
  (78, 'P05', 'Legs', 1, 'Sentadilla con barra', 'Sentadilla con barra', 4, '6-10', 150),
  (79, 'P05', 'Legs', 2, 'Peso muerto rumano', 'Peso muerto rumano', 4, '8-10', 150),
  (80, 'P05', 'Legs', 3, 'Prensa de piernas', 'Prensa de piernas', 3, '10-12', 120),
  (81, 'P05', 'Legs', 4, 'Curl femoral tumbado', 'Curl femoral tumbado', 3, '10-15', 75),
  (82, 'P05', 'Legs', 5, 'Elevación de talones de pie', 'Elevación de talones de pie', 4, '10-15', 60),
  (83, 'P05', 'Push 2', 1, 'Press de banca con barra', 'Press de banca con barra', 4, '6-10', 150),
  (84, 'P05', 'Push 2', 2, 'Press inclinado con mancuernas', 'Press inclinado con mancuernas', 3, '8-12', 120),
  (85, 'P05', 'Push 2', 3, 'Press de hombros con mancuernas', 'Press de hombros con mancuernas', 3, '8-12', 120),
  (86, 'P05', 'Push 2', 4, 'Elevaciones laterales', 'Elevaciones laterales', 4, '12-15', 60),
  (87, 'P05', 'Push 2', 5, 'Extensión de tríceps en polea', 'Extensión de tríceps en polea', 3, '10-15', 75),
  (88, 'P05', 'Pull 2', 1, 'Dominadas', 'Dominadas', 4, '6-10', 150),
  (89, 'P05', 'Pull 2', 2, 'Remo con barra', 'Remo con barra', 4, '6-10', 150),
  (90, 'P05', 'Pull 2', 3, 'Remo sentado en polea', 'Remo sentado en polea', 3, '8-12', 120),
  (91, 'P05', 'Pull 2', 4, 'Face pull', 'Face pull', 3, '12-15', 60),
  (92, 'P05', 'Pull 2', 5, 'Curl martillo', 'Curl martillo', 3, '10-12', 75),
  (93, 'P05', 'Legs 2', 1, 'Sentadilla con barra', 'Sentadilla con barra', 4, '6-10', 150),
  (94, 'P05', 'Legs 2', 2, 'Peso muerto rumano', 'Peso muerto rumano', 4, '8-10', 150),
  (95, 'P05', 'Legs 2', 3, 'Prensa de piernas', 'Prensa de piernas', 3, '10-12', 120),
  (96, 'P05', 'Legs 2', 4, 'Curl femoral tumbado', 'Curl femoral tumbado', 3, '10-15', 75),
  (97, 'P05', 'Legs 2', 5, 'Elevación de talones de pie', 'Elevación de talones de pie', 4, '10-15', 60);

create temporary table tmp_day_order (sheet_id text, day_label text, day_position smallint) on commit drop;
insert into tmp_day_order (sheet_id, day_label, day_position)
select sheet_id, day_label, dense_rank() over (partition by sheet_id order by min(seq))
from tmp_routine_items group by sheet_id, day_label;

-- exercise_lookup_name resuelve contra el nombre real en exercises (global,
-- gym_id null) — la única fila que no matchea ("Press de máquina", typo de
-- la planilla vs. "Press en máquina") queda con exercise_id null y se
-- muestra igual por exercise_name, como el texto libre de siempre.
insert into public.program_template_items (program_id, day_label, day_position, position, exercise_id, exercise_name, sets, reps, rest_seconds)
select pt.id, tri.day_label, tdo.day_position, tri.position, ex.id, tri.exercise_name, tri.sets, tri.reps, tri.rest_seconds
from tmp_routine_items tri
join tmp_programs tp on tp.sheet_id = tri.sheet_id
join public.program_templates pt on pt.name = tp.name
join tmp_day_order tdo on tdo.sheet_id = tri.sheet_id and tdo.day_label = tri.day_label
left join public.exercises ex on ex.gym_id is null and ex.name = tri.exercise_lookup_name;
