-- Bolá — reemplaza el catálogo global de ejercicios (8 filas genéricas de
-- relleno, sembradas en 20260905000300_etapa2_features_schema.sql antes de
-- que existiera contenido real) por una biblioteca real de 90 ejercicios
-- con nivel, objetivo, tipo y series/repeticiones/descanso sugeridos —
-- contenido que el dueño pasó en Fight_Club_Gym_Base_Datos_Entrenamiento.xlsx.
--
-- Las "Advertencias" de esa planilla son el mismo texto en las 90 filas
-- ("Detener ante dolor agudo; adaptar carga, rango y variante al nivel del
-- usuario.") — no se guarda como columna por fila, se muestra como aviso
-- fijo en la pantalla de la biblioteca (src/screens/library.js).
--
-- Video URL e Imagen URL venían vacíos en la planilla a propósito (para que
-- el gimnasio sume sus propios recursos más adelante) — no se agrega
-- columna todavía; `media_key` ya existe para cuando haya fotos reales.

alter table public.exercises add column if not exists level text;
alter table public.exercises add column if not exists goal text;
alter table public.exercises add column if not exists kind text;
alter table public.exercises add column if not exists suggested_sets smallint;
alter table public.exercises add column if not exists suggested_reps text;
alter table public.exercises add column if not exists suggested_rest_seconds smallint;

-- Los 8 ejercicios de relleno del catálogo global salen — routine_exercises
-- .exercise_id tiene "on delete set null" (ver 20260720120000_schema.sql),
-- así que si algún entrenador ya armó una rutina con uno de estos, la fila
-- de esa rutina no se borra: solo pierde el vínculo con la biblioteca y
-- sigue mostrando su `text` libre como siempre. El catálogo propio de cada
-- gimnasio (gym_id no nulo) no se toca.
delete from public.exercises where gym_id is null;

insert into public.exercises (gym_id, name, muscle_group, equipment_name, level, goal, kind, description, suggested_sets, suggested_reps, suggested_rest_seconds) values
  (null, 'Sentadilla con barra', 'Piernas', 'Barra', 'Intermedio', 'Fuerza/Hipertrofia', 'Compuesto', 'Baja con control manteniendo el tronco estable y sube empujando el suelo.', 3, '8-12', 90),
  (null, 'Sentadilla goblet', 'Piernas', 'Mancuerna', 'Principiante', 'Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Sentadilla frontal', 'Piernas', 'Barra', 'Intermedio', 'Fuerza/Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Sentadilla hack', 'Piernas', 'Máquina hack', 'Intermedio', 'Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Prensa de piernas', 'Piernas', 'Prensa', 'Principiante', 'Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Peso muerto rumano', 'Piernas', 'Barra', 'Intermedio', 'Hipertrofia', 'Compuesto', 'Lleva la cadera hacia atrás con rodillas ligeramente flexionadas y vuelve extendiendo la cadera.', 3, '8-12', 90),
  (null, 'Peso muerto con mancuernas', 'Piernas', 'Mancuernas', 'Principiante', 'Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Hip thrust con barra', 'Glúteos', 'Barra', 'Intermedio', 'Hipertrofia', 'Compuesto', 'Extiende la cadera hasta quedar alineado, evitando hiperextender la zona lumbar.', 3, '8-12', 90),
  (null, 'Puente de glúteos', 'Glúteos', 'Peso corporal', 'Principiante', 'Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Zancadas caminando', 'Piernas', 'Mancuernas', 'Intermedio', 'Hipertrofia', 'Unilateral', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Zancada atrás', 'Piernas', 'Mancuernas', 'Principiante', 'Hipertrofia', 'Unilateral', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Split squat búlgaro', 'Piernas', 'Mancuernas', 'Intermedio', 'Hipertrofia', 'Unilateral', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Step-up', 'Piernas', 'Banco + mancuernas', 'Principiante', 'Hipertrofia', 'Unilateral', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Extensión de piernas', 'Cuádriceps', 'Máquina', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Curl femoral tumbado', 'Isquiotibiales', 'Máquina', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Curl femoral sentado', 'Isquiotibiales', 'Máquina', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Elevación de talones de pie', 'Pantorrillas', 'Máquina', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Elevación de talones sentado', 'Pantorrillas', 'Máquina', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Abducción de cadera', 'Glúteos', 'Máquina', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Aducción de cadera', 'Piernas', 'Máquina', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Press de banca con barra', 'Pecho', 'Barra + banco', 'Intermedio', 'Fuerza/Hipertrofia', 'Compuesto', 'Desciende la barra de forma controlada hacia el pecho y empuja sin perder estabilidad escapular.', 3, '8-12', 90),
  (null, 'Press inclinado con barra', 'Pecho', 'Barra + banco', 'Intermedio', 'Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Press de banca con mancuernas', 'Pecho', 'Mancuernas + banco', 'Principiante', 'Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Press inclinado con mancuernas', 'Pecho', 'Mancuernas + banco', 'Principiante', 'Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Press en máquina', 'Pecho', 'Máquina', 'Principiante', 'Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Fondos en paralelas', 'Pecho/Tríceps', 'Paralelas', 'Avanzado', 'Fuerza/Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Aperturas con mancuernas', 'Pecho', 'Mancuernas + banco', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Cruce de poleas', 'Pecho', 'Poleas', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Flexiones', 'Pecho', 'Peso corporal', 'Principiante', 'Fuerza/Resistencia', 'Compuesto', 'Desciende manteniendo cuerpo alineado y empuja el suelo hasta extender los brazos.', 3, '8-12', 90),
  (null, 'Press militar con barra', 'Hombros', 'Barra', 'Intermedio', 'Fuerza/Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Press de hombros con mancuernas', 'Hombros', 'Mancuernas', 'Principiante', 'Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Press de hombros en máquina', 'Hombros', 'Máquina', 'Principiante', 'Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Elevaciones laterales', 'Hombros', 'Mancuernas', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Elevaciones laterales en polea', 'Hombros', 'Polea', 'Intermedio', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Pájaros con mancuernas', 'Hombros', 'Mancuernas', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Face pull', 'Hombros/Espalda', 'Polea + cuerda', 'Principiante', 'Hipertrofia/Salud de hombro', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Encogimientos con mancuernas', 'Trapecios', 'Mancuernas', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Dominadas', 'Espalda', 'Barra fija', 'Intermedio', 'Fuerza/Hipertrofia', 'Compuesto', 'Tira del cuerpo hacia la barra manteniendo el control durante todo el recorrido.', 3, '8-12', 90),
  (null, 'Dominadas asistidas', 'Espalda', 'Máquina asistida', 'Principiante', 'Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Jalón al pecho', 'Espalda', 'Polea', 'Principiante', 'Hipertrofia', 'Compuesto', 'Lleva la barra hacia la parte alta del pecho manteniendo el torso estable.', 3, '8-12', 90),
  (null, 'Remo con barra', 'Espalda', 'Barra', 'Intermedio', 'Fuerza/Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Remo con mancuerna', 'Espalda', 'Mancuerna', 'Principiante', 'Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Remo sentado en polea', 'Espalda', 'Polea', 'Principiante', 'Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Remo en máquina', 'Espalda', 'Máquina', 'Principiante', 'Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Pullover en polea', 'Espalda', 'Polea', 'Intermedio', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Curl de bíceps con barra', 'Bíceps', 'Barra', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Flexiona los codos sin balancear el tronco y baja de forma controlada.', 3, '8-12', 90),
  (null, 'Curl alterno con mancuernas', 'Bíceps', 'Mancuernas', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Curl martillo', 'Bíceps', 'Mancuernas', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Curl predicador', 'Bíceps', 'Banco predicador', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Curl en polea', 'Bíceps', 'Polea', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Press cerrado', 'Tríceps', 'Barra + banco', 'Intermedio', 'Fuerza/Hipertrofia', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Press francés', 'Tríceps', 'Barra EZ + banco', 'Intermedio', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Extensión de tríceps en polea', 'Tríceps', 'Polea + cuerda', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Extiende los codos manteniendo los brazos cerca del cuerpo.', 3, '8-12', 90),
  (null, 'Extensión de tríceps sobre cabeza', 'Tríceps', 'Mancuerna', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Patada de tríceps', 'Tríceps', 'Mancuerna', 'Principiante', 'Hipertrofia', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Plancha', 'Core', 'Peso corporal', 'Principiante', 'Core/Resistencia', 'Isométrico', 'Mantén el cuerpo alineado, abdomen activo y respiración controlada.', 3, '8-12', 90),
  (null, 'Plancha lateral', 'Core', 'Peso corporal', 'Principiante', 'Core/Resistencia', 'Isométrico', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Crunch', 'Core', 'Peso corporal', 'Principiante', 'Core', 'Aislamiento', 'Flexiona el tronco con control sin tirar del cuello.', 3, '8-12', 90),
  (null, 'Crunch en polea', 'Core', 'Polea', 'Intermedio', 'Hipertrofia/Core', 'Aislamiento', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Elevación de rodillas', 'Core', 'Barra fija', 'Principiante', 'Core', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Elevación de piernas', 'Core', 'Barra fija', 'Intermedio', 'Core', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Dead bug', 'Core', 'Peso corporal', 'Principiante', 'Core/Control motor', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Bird dog', 'Core', 'Peso corporal', 'Principiante', 'Core/Control motor', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Mountain climbers', 'Core/Cardio', 'Peso corporal', 'Principiante', 'Acondicionamiento', 'Dinámico', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Burpees', 'Full body', 'Peso corporal', 'Intermedio', 'Acondicionamiento', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Jumping jacks', 'Full body', 'Peso corporal', 'Principiante', 'Calentamiento/Cardio', 'Dinámico', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Cuerda de saltar', 'Cardio', 'Cuerda', 'Principiante', 'Cardio', 'Dinámico', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Sprint en cinta', 'Cardio', 'Cinta', 'Intermedio', 'Cardio', 'Dinámico', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Caminata inclinada', 'Cardio', 'Cinta', 'Principiante', 'Cardio', 'Dinámico', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Bicicleta estática', 'Cardio', 'Bicicleta', 'Principiante', 'Cardio', 'Dinámico', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Remo ergómetro', 'Cardio', 'Remo', 'Intermedio', 'Cardio', 'Dinámico', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Battle ropes', 'Full body', 'Cuerdas', 'Intermedio', 'Acondicionamiento', 'Dinámico', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Kettlebell swing', 'Full body', 'Kettlebell', 'Intermedio', 'Potencia/Condición', 'Balístico', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Farmer walk', 'Full body', 'Mancuernas', 'Principiante', 'Fuerza/Condición', 'Locomoción', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Turkish get-up', 'Full body', 'Kettlebell', 'Avanzado', 'Fuerza/Control', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Clean con kettlebell', 'Full body', 'Kettlebell', 'Avanzado', 'Potencia', 'Explosivo', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Box jump', 'Piernas', 'Cajón', 'Intermedio', 'Potencia', 'Explosivo', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Lanzamiento de balón medicinal', 'Full body', 'Balón medicinal', 'Intermedio', 'Potencia', 'Explosivo', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Golpes al saco', 'Boxeo', 'Saco de boxeo', 'Principiante', 'Boxeo/Cardio', 'Dinámico', 'Golpea con técnica, rotación de cadera y control de la distancia.', 3, '8-12', 90),
  (null, 'Sombra de boxeo', 'Boxeo', 'Peso corporal', 'Principiante', 'Boxeo/Cardio', 'Dinámico', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Combinación jab-cross', 'Boxeo', 'Saco/Guantes', 'Principiante', 'Boxeo/Técnica', 'Dinámico', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Hook al saco', 'Boxeo', 'Saco/Guantes', 'Intermedio', 'Boxeo/Técnica', 'Dinámico', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Uppercut al saco', 'Boxeo', 'Saco/Guantes', 'Intermedio', 'Boxeo/Técnica', 'Dinámico', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Burpee + golpe', 'Boxeo/Condición', 'Peso corporal + saco', 'Intermedio', 'Acondicionamiento', 'Compuesto', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Movilidad de tobillo', 'Movilidad', 'Peso corporal', 'Principiante', 'Movilidad', 'Movilidad', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Rotación torácica', 'Movilidad', 'Peso corporal', 'Principiante', 'Movilidad', 'Movilidad', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Estiramiento flexor de cadera', 'Movilidad', 'Peso corporal', 'Principiante', 'Movilidad', 'Movilidad', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Estiramiento de isquiotibiales', 'Movilidad', 'Peso corporal', 'Principiante', 'Movilidad', 'Movilidad', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Estiramiento de pectoral', 'Movilidad', 'Pared', 'Principiante', 'Movilidad', 'Movilidad', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90),
  (null, 'Estiramiento de dorsal', 'Movilidad', 'Banco', 'Principiante', 'Movilidad', 'Movilidad', 'Ejecuta el movimiento con control, rango cómodo y técnica estable.', 3, '8-12', 90);
