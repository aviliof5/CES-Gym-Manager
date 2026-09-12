/* Bolá — datos estáticos (catálogos, íconos, textos fijos). Sin dependencias
   de estado ni de otros módulos: es la base de todo el árbol de imports.
   Movido 1:1 desde app.js (Fase 3 de docs/MIGRATION_PLAN.md) — sin reescribir
   lógica, solo separado en módulos ES. */
'use strict';

export const EQUIPMENT_SUGGESTIONS = ['Caminadora', 'Bicicleta estática', 'Rack de sentadillas', 'Banco de press', 'Mancuernas', 'Máquina de poleas', 'Remo'];
export const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
// Nombres completos, mismo orden que DAY_LABELS (0=Lunes..6=Domingo) — ver
// routine_exercises.day_of_week (rutinas semanales, Etapa 2).
export const WEEKDAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
// Índice de "hoy" en ese mismo orden (JS: domingo=0 -> acá lunes=0).
export function todayWeekday() { return (new Date().getDay() + 6) % 7; }
export const GOALS = [
  { id: 'perder_peso', label: 'Perder peso' },
  { id: 'ganar_musculo', label: 'Ganar músculo' },
  { id: 'resistencia', label: 'Resistencia' },
  { id: 'tonificar', label: 'Tonificar' },
];
// ids en minúscula porque client_profiles.level es el enum experience_level
// del backend ('principiante'/'intermedio'/'avanzado') — no el label capitalizado.
export const LEVELS = [
  { id: 'principiante', label: 'Principiante' },
  { id: 'intermedio', label: 'Intermedio' },
  { id: 'avanzado', label: 'Avanzado' },
];

/* ---------- Fight Club Training Engine — formulario de evaluación (Fase 3) ----------
   Ver docs/FIGHT_CLUB_TRAINING_ENGINE_AUDIT.md y la migración
   20260917000000_training_engine_profile.sql. Los `id` acá son EXACTAMENTE
   los valores de texto que aceptan los CHECK de esa migración. `hint` es la
   explicación que se muestra bajo cada pregunta (pedido §4). */
export const EVAL_GOALS = [
  { id: 'ganar_masa', label: 'Ganar masa muscular', hint: 'Priorizar el crecimiento del músculo (hipertrofia).' },
  { id: 'perder_grasa', label: 'Perder grasa', hint: 'Bajar porcentaje de grasa manteniendo la mayor cantidad de músculo posible.' },
  { id: 'recomposicion', label: 'Recomposición corporal', hint: 'Ganar músculo y perder grasa a la vez — progreso más lento en ambos, pero posible sobre todo si recién empezás.' },
  { id: 'fuerza', label: 'Aumentar fuerza', hint: 'Levantar más peso en los ejercicios grandes. Menos repeticiones, más descanso.' },
  { id: 'resistencia_muscular', label: 'Resistencia muscular', hint: 'Aguantar más repeticiones y series antes de fatigarte.' },
  { id: 'condicion_fisica', label: 'Mejorar condición física', hint: 'Estar más en forma en general — un poco de todo, sin especializarte.' },
  { id: 'potencia', label: 'Potencia / rendimiento', hint: 'Generar fuerza rápido (saltar, esprintar, golpear). Útil para deportes.' },
  { id: 'iniciar', label: 'Comenzar a entrenar', hint: 'Nunca entrenaste o volvés después de mucho tiempo. Rutina simple para agarrar el hábito y la técnica.' },
  { id: 'mantener', label: 'Mantener mi estado físico', hint: 'Ya estás donde querés — sostenerlo sin exigirte de más.' },
];

export const EVAL_TIME_BUCKETS = [
  { id: 'nunca', label: 'Nunca entrené' },
  { id: 'menos_3m', label: 'Menos de 3 meses' },
  { id: '3_6m', label: '3 a 6 meses' },
  { id: '6_12m', label: '6 a 12 meses' },
  { id: '1_2a', label: '1 a 2 años' },
  { id: 'mas_2a', label: 'Más de 2 años' },
];

export const EVAL_COMFORT = [
  { id: 'principiante', label: 'Principiante', hint: 'Necesito que me expliquen cómo se usa cada máquina.' },
  { id: 'intermedio', label: 'Intermedio', hint: 'Me manejo con casi todo, pero algunos ejercicios los hago con dudas.' },
  { id: 'avanzado', label: 'Avanzado', hint: 'Domino la técnica de los ejercicios grandes con barra y mancuernas.' },
];

export const EVAL_DAYS = [2, 3, 4, 5, 6];
export const EVAL_SESSION_MINUTES = [30, 45, 60, 75, 90];

export const EVAL_STYLES = [
  { id: 'maquinas', label: 'Máquinas', hint: 'Más fáciles de aprender y más seguras para entrenar solo.' },
  { id: 'pesas_libres', label: 'Pesas libres', hint: 'Barra y mancuernas. Más transferencia a la vida real, exigen más técnica.' },
  { id: 'ambos', label: 'Ambos', hint: 'Mezcla de máquinas y pesas libres — lo más habitual.' },
  { id: 'peso_corporal', label: 'Peso corporal', hint: 'Sin equipo o casi. Bueno si entrenás en casa o viajás seguido.' },
  { id: 'indiferente', label: 'Me es indiferente', hint: 'Elegí lo que sea mejor para mi objetivo.' },
];

// value = como lo espera el motor (grupo muscular en minúscula); label para mostrar.
export const EVAL_PRIORITY_MUSCLES = [
  { id: 'pecho', label: 'Pecho' },
  { id: 'espalda', label: 'Espalda' },
  { id: 'hombros', label: 'Hombros' },
  { id: 'biceps', label: 'Bíceps' },
  { id: 'triceps', label: 'Tríceps' },
  { id: 'cuadriceps', label: 'Cuádriceps' },
  { id: 'isquiotibiales', label: 'Isquiotibiales' },
  { id: 'gluteos', label: 'Glúteos' },
  { id: 'pantorrillas', label: 'Pantorrillas' },
  { id: 'core', label: 'Abdomen / core' },
];

export const EVAL_JOINTS = [
  { id: 'hombro', label: 'Hombro' },
  { id: 'codo', label: 'Codo' },
  { id: 'muñeca', label: 'Muñeca' },
  { id: 'espalda', label: 'Espalda' },
  { id: 'cadera', label: 'Cadera' },
  { id: 'rodilla', label: 'Rodilla' },
  { id: 'tobillo', label: 'Tobillo' },
  { id: 'otra', label: 'Otra' },
];

export const EVAL_SOMATOTYPES = [
  { id: 'ectomorfo', label: 'Ectomorfo', hint: 'Delgado por naturaleza, te cuesta ganar peso.' },
  { id: 'mesomorfo', label: 'Mesomorfo', hint: 'Ganás músculo con relativa facilidad.' },
  { id: 'endomorfo', label: 'Endomorfo', hint: 'Ganás peso con facilidad, te cuesta más definir.' },
];

export const EVAL_SEX = [
  { id: 'femenino', label: 'Femenino' },
  { id: 'masculino', label: 'Masculino' },
  { id: 'prefiero_no_decir', label: 'Prefiero no decir' },
];

export const EVAL_TOTAL_STEPS = 8;

/* ---------- Training Engine — conceptos de equipamiento (Fase 5) ----------
   Cada máquina/equipo del gimnasio (public.equipment.concepts) ofrece uno o
   más de estos "conceptos". Cada ejercicio pide un set de conceptos
   (public.exercises.required_equipment). El motor: un ejercicio es posible
   si TODOS sus conceptos están cubiertos por la unión de conceptos de las
   máquinas ACTIVAS del gimnasio. 'peso_corporal' se da siempre por sentado
   y no aparece en este catálogo. */
export const EQUIPMENT_CONCEPTS = [
  { id: 'barra', label: 'Barra olímpica' },
  { id: 'barra_ez', label: 'Barra EZ / Z' },
  { id: 'mancuernas', label: 'Mancuernas' },
  { id: 'banco', label: 'Banco (plano / inclinable)' },
  { id: 'banco_predicador', label: 'Banco predicador' },
  { id: 'polea', label: 'Poleas / cables' },
  { id: 'prensa', label: 'Prensa de piernas' },
  { id: 'maquina', label: 'Máquinas de piezas (press, remo, extensiones…)' },
  { id: 'maquina_hack', label: 'Máquina hack' },
  { id: 'maquina_asistida', label: 'Máquina asistida (dominadas / fondos)' },
  { id: 'barra_fija', label: 'Barra fija / paralelas / dominadas' },
  { id: 'cinta', label: 'Cinta de correr' },
  { id: 'bicicleta', label: 'Bicicleta fija' },
  { id: 'remo_ergometro', label: 'Remo ergómetro' },
  { id: 'cuerda_saltar', label: 'Cuerda de saltar' },
  { id: 'battle_ropes', label: 'Sogas de batalla' },
  { id: 'kettlebell', label: 'Kettlebells' },
  { id: 'cajon', label: 'Cajón pliométrico' },
  { id: 'balon_medicinal', label: 'Balón medicinal' },
  { id: 'saco_boxeo', label: 'Saco de boxeo' },
  { id: 'guantes', label: 'Guantes de boxeo' },
];

// Infiere los conceptos de una máquina a partir de su nombre — para
// pre-marcar el editor y para las máquinas que ya existen. El admin siempre
// puede corregir. Devuelve [] si no reconoce nada (el admin lo completa).
export function inferEquipmentConcepts(name) {
  const s = (name || '').toLowerCase();
  const c = new Set();
  if (/caminadora|cinta|trotadora/.test(s)) c.add('cinta');
  if (/bicicleta|spinning/.test(s)) c.add('bicicleta');
  if (/el[ií]ptic/.test(s)) { /* sin concepto — ningún ejercicio la pide */ }
  if (/rack|jaula|sentadilla|smith/.test(s)) { c.add('barra'); c.add('barra_fija'); }
  if (/banco de press|banco press|press de banca|press banca/.test(s)) { c.add('banco'); c.add('barra'); }
  else if (/\bbanco\b/.test(s)) c.add('banco');
  if (/mancuerna/.test(s)) c.add('mancuernas');
  if (/polea|cable|cruce/.test(s)) c.add('polea');
  if (/prensa/.test(s)) c.add('prensa');
  if (/hack/.test(s)) c.add('maquina_hack');
  if (/asistid/.test(s)) { c.add('maquina_asistida'); c.add('barra_fija'); }
  if (/predicador|scott/.test(s)) c.add('banco_predicador');
  if (/dominad|paralel|fondos|barra fija|dip/.test(s)) c.add('barra_fija');
  if (/kettlebell|pesa rusa/.test(s)) c.add('kettlebell');
  if (/saco|boxeo|bolsa/.test(s)) { c.add('saco_boxeo'); c.add('guantes'); }
  if (/caj[oó]n|plyo|box\b/.test(s)) c.add('cajon');
  if (/soga|battle/.test(s)) c.add('battle_ropes');
  if (/bal[oó]n medicinal|medicine ball/.test(s)) c.add('balon_medicinal');
  if (/barra ez|barra z/.test(s)) c.add('barra_ez');
  else if (/\bbarra\b/.test(s) && !c.has('barra')) c.add('barra');
  if (/remo/.test(s) && !c.has('polea') && !c.has('maquina')) c.add('remo_ergometro');
  // "máquina de X" genérico -> concepto 'maquina' (extensiones, curl femoral,
  // press de pecho/hombro en máquina, remo en máquina...).
  if (/m[aá]quina/.test(s) && !c.has('maquina_hack') && !c.has('maquina_asistida')) c.add('maquina');
  return [...c];
}

// Deriva el enum experience_level (3 valores, client_profiles.level) a partir
// de "cuánto hace que entrena" + "qué tan cómodo se siente". El motor real
// (Fases 6-8) puede afinar esto con el rendimiento registrado.
export function deriveLevel(timeBucket, comfort) {
  if (!timeBucket || timeBucket === 'nunca' || timeBucket === 'menos_3m') return 'principiante';
  if (timeBucket === 'mas_2a') return comfort === 'avanzado' ? 'avanzado' : 'intermedio';
  if (timeBucket === '1_2a') return comfort === 'principiante' ? 'principiante' : 'intermedio';
  // 3_6m / 6_12m
  return comfort === 'avanzado' ? 'intermedio' : (comfort === 'principiante' ? 'principiante' : 'intermedio');
}

// Mapea el objetivo de 9 opciones (training_profiles.primary_goal) al enum
// training_goal de 4 valores que usa el resto de la app (client_profiles.goal,
// y buildRoutine() hasta que el motor real lo reemplace).
export function mapGoalToEnum(primaryGoal) {
  switch (primaryGoal) {
    case 'perder_grasa': return 'perder_peso';
    case 'ganar_masa':
    case 'recomposicion':
    case 'fuerza':
    case 'potencia': return 'ganar_musculo';
    case 'resistencia_muscular':
    case 'condicion_fisica': return 'resistencia';
    case 'iniciar':
    case 'mantener':
    default: return 'tonificar';
  }
}
// Resumen legible de un training_profile guardado (shapeTrainingProfile) —
// para que el entrenador lo VEA (Fase 11, solo lectura). Devuelve
// [{label, value}] salteando lo que no completó.
export function trainingProfileSummary(p) {
  if (!p) return [];
  const lbl = (arr, id) => (arr.find(x => x.id === id) || {}).label || id || '—';
  const out = [];
  if (p.primaryGoal) out.push({ label: 'Objetivo principal', value: lbl(EVAL_GOALS, p.primaryGoal) });
  if (p.secondaryGoal) out.push({ label: 'Objetivo secundario', value: lbl(EVAL_GOALS, p.secondaryGoal) });
  if (p.trainingTimeBucket || p.machineComfort) {
    out.push({ label: 'Nivel estimado', value: deriveLevel(p.trainingTimeBucket, p.machineComfort) });
  }
  if (p.trainingTimeBucket) out.push({ label: 'Experiencia', value: lbl(EVAL_TIME_BUCKETS, p.trainingTimeBucket) });
  if (p.machineComfort) out.push({ label: 'Comodidad con las máquinas', value: lbl(EVAL_COMFORT, p.machineComfort) });
  if (p.daysPerWeek) out.push({ label: 'Días por semana', value: `${p.daysPerWeek}` });
  if (p.sessionMinutes) out.push({ label: 'Minutos por sesión', value: `${p.sessionMinutes}` });
  if (p.preferredStyle) out.push({ label: 'Estilo preferido', value: lbl(EVAL_STYLES, p.preferredStyle) });
  if (p.priorityMuscles && p.priorityMuscles.length) {
    out.push({ label: 'Músculos a priorizar', value: p.priorityMuscles.map(m => lbl(EVAL_PRIORITY_MUSCLES, m)).join(', ') });
  }
  if (p.somatotype) out.push({ label: 'Tipo de cuerpo', value: lbl(EVAL_SOMATOTYPES, p.somatotype) });
  if (p.sex) out.push({ label: 'Sexo', value: lbl(EVAL_SEX, p.sex) });
  return out;
}

// Etapa 2 — cada entrada trae ya sets/reps/restSeconds estructurados (no solo
// el texto libre de antes) para que el modo entrenamiento pueda mostrar y
// registrar series reales. `reps` es texto (no número): admite "20 min" o
// "circuito" además de una cifra — mismo criterio que routine_exercises.reps
// del backend. weightKg queda null: el peso de partida lo define cada quien
// la primera vez que entrena ese ejercicio, no lo inventa la IA.
export const EXERCISE_LIB = {
  perder_peso: [
    { text: 'Cardio en caminadora - 20 min', kw: 'caminadora', sets: 1, reps: '20 min', weightKg: null, restSeconds: 0 },
    { text: 'Bicicleta estática - 15 min', kw: 'bicicleta', sets: 1, reps: '15 min', weightKg: null, restSeconds: 0 },
    { text: 'Circuito funcional - 3 rondas', kw: null, sets: 3, reps: 'circuito', weightKg: null, restSeconds: 45 },
    { text: 'Remo - 10 min', kw: 'remo', sets: 1, reps: '10 min', weightKg: null, restSeconds: 0 },
  ],
  ganar_musculo: [
    { text: 'Sentadilla en rack - 4x8', kw: 'rack', sets: 4, reps: '8', weightKg: null, restSeconds: 90 },
    { text: 'Press banca - 4x8', kw: 'banco', sets: 4, reps: '8', weightKg: null, restSeconds: 90 },
    { text: 'Peso muerto - 3x6', kw: 'rack', sets: 3, reps: '6', weightKg: null, restSeconds: 120 },
    { text: 'Máquina de poleas - 3x12', kw: 'poleas', sets: 3, reps: '12', weightKg: null, restSeconds: 60 },
  ],
  resistencia: [
    { text: 'Caminadora - 30 min', kw: 'caminadora', sets: 1, reps: '30 min', weightKg: null, restSeconds: 0 },
    { text: 'Bicicleta estática - 20 min', kw: 'bicicleta', sets: 1, reps: '20 min', weightKg: null, restSeconds: 0 },
    { text: 'Remo - 15 min', kw: 'remo', sets: 1, reps: '15 min', weightKg: null, restSeconds: 0 },
    { text: 'Circuito funcional - 4 rondas', kw: null, sets: 4, reps: 'circuito', weightKg: null, restSeconds: 45 },
  ],
  tonificar: [
    { text: 'Mancuernas - 3x15', kw: 'mancuernas', sets: 3, reps: '15', weightKg: null, restSeconds: 60 },
    { text: 'Máquina de poleas - 3x15', kw: 'poleas', sets: 3, reps: '15', weightKg: null, restSeconds: 60 },
    { text: 'Circuito funcional - 3 rondas', kw: null, sets: 3, reps: 'circuito', weightKg: null, restSeconds: 45 },
    { text: 'Bicicleta estática - 10 min', kw: 'bicicleta', sets: 1, reps: '10 min', weightKg: null, restSeconds: 0 },
  ],
};
export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const DURATION_LABELS = { diario: 'Diario', mensual: 'Mensual', anual: 'Anual' };

export const LOGO_SVG = `<svg viewBox="0 0 100 100" width="34" height="34"><path d="M20 18 h60 a12 12 0 0 1 12 12 v28 a12 12 0 0 1 -12 12 H42 L28 84 V70 H20 a12 12 0 0 1 -12 -12 V30 a12 12 0 0 1 12 -12 Z" fill="none" stroke="#0B0D10" stroke-width="7" stroke-linejoin="round"/><rect x="34" y="40" width="32" height="7" rx="3.5" fill="#0B0D10"/><rect x="26" y="33" width="8" height="21" rx="3" fill="#0B0D10"/><rect x="66" y="33" width="8" height="21" rx="3" fill="#0B0D10"/></svg>`;

// Logo real de la marca (assets/logo.png, ver scripts/build-icons.js) — el
// mismo badge circular en cualquier lugar donde aparece el logo: portada,
// login, encabezado de los 4 paneles (dueño/admin, cliente, entrenador,
// plataforma) y los íconos de la app (favicon/PWA, generados del mismo
// archivo). Antes acá había un lockup tipográfico ("FightClub" en texto);
// se reemplazó por completo por el logo ilustrado.
export const BRAND_MARK_SIZES = { sm: 32, md: 44, lg: 88, xl: 140 };

export function brandMark(size = 'md') {
  const px = BRAND_MARK_SIZES[size] || BRAND_MARK_SIZES.md;
  return `<img src="assets/logo.png" alt="Fight Club Gym" width="${px}" height="${px}" style="width:${px}px;height:${px}px;flex-shrink:0;display:block" />`;
}

export const ICON_PATHS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  dumbbell: '<path d="M4 9v6M2 10v4M20 9v6M22 10v4M8 8v8M16 8v8M8 12h8"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6"/><circle cx="17" cy="8" r="2.5"/><path d="M17 14c2.8 0 5 2.3 5 6"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/>',
  bars: '<path d="M4 20V10M12 20V4M20 20v-7"/>',
  crown: '<path d="M4 17l-1.6-9L8 12l4-7 4 7 5.6-4-1.6 9z"/><path d="M4 19.5h16"/>',
  star: '<path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.2-5.4 3.2 1.3-6L3.3 9.2l6.1-.6L12 3z"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  camera: '<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13.5" r="3.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  chat: '<path d="M4 5h16v11H8l-4 4V5z"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9z"/><path d="M9 12l2 2 4-4"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M6 16c.5-1.8 2-2.5 2.5-2.5S11 14.2 11.5 16M14 9h4M14 13h4"/>',
  // Panel de plataforma (ver src/screens/platform.js).
  shield: '<path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  // Confirmación de correo por código (ver screens/auth.js viewConfirmCode).
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 6.5l9 6.5 9-6.5"/>',
  run: '<circle cx="14" cy="5" r="2"/><path d="M9 20l2-5 2 1 2 5M8 13l3-3 2 2 3-1M6 9l3-2"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6 0 10 7 10 7a17.6 17.6 0 0 1-3.1 3.9M6.3 6.3A17.9 17.9 0 0 0 2 12s4 7 10 7a10.5 10.5 0 0 0 4.2-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  wifiOff: '<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 3.5-2.3M19 12.5a10 10 0 0 0-3-2.1M2 8.5a15 15 0 0 1 4.5-2.8M22 8.5a15 15 0 0 0-6-3.4"/><circle cx="12" cy="20" r="1"/>',
  // Etapa 2 — Reservas (calendario), Modo entrenamiento (check) y Rutina (plus).
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  check: '<path d="M4 12l5 5 11-11"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  // Etapa 2 — "Configuración" (dueño/admin).
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V19a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V10a1.6 1.6 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z"/>',
  // Logros (biblioteca de 1000, ver src/screens/logros.js) — íconos por
  // categoría además de los que ya había (dumbbell=fuerza, calendar=clases,
  // crown/star=constancia general).
  heart: '<path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z"/>',
  ruler: '<rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M7 7v3M11 7v4M15 7v3M19 7v4"/>',
  flame: '<path d="M12 22c4.4 0 7-2.8 7-6.5C19 11 15 9 15 5c0 0-1 2.5-3 3.5C9 6 9 3 9 3 6 5.5 5 9 5 12c0 5 3 10 7 10z"/>',
  medal: '<circle cx="12" cy="15" r="6"/><path d="M9 3l3 6 3-6M8 9l-3-6M16 9l3-6"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M5 5H3v2a4 4 0 0 0 4 4M19 5h2v2a4 4 0 0 1-4 4"/><path d="M10 15v3H8v2h8v-2h-2v-3"/>',
  // Notificaciones al cliente cuando dueño/admin crea un evento (ver
  // src/actions.js createEvent / notify_gym_clients()).
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  // Bloqueo de la app para el cliente que no pagó (ver viewClientHome,
  // "como se lleva el control para que no entren sin pagar").
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  // "Errores comunes" en la biblioteca de ejercicios (ver screens/library.js).
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  // Descargar el QR del gimnasio para imprimir (ver src/screens/presence.js).
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>',
};

// Prefijos de país para el campo de teléfono (nombre en español + código de
// marcación E.164). Cuba primero porque es el país por defecto del gym; el
// resto ordenado alfabéticamente.
export const COUNTRY_CODES = [
  ['Cuba', '+53'],
  ['Afganistán', '+93'], ['Albania', '+355'], ['Alemania', '+49'], ['Andorra', '+376'],
  ['Angola', '+244'], ['Arabia Saudita', '+966'], ['Argelia', '+213'], ['Argentina', '+54'],
  ['Armenia', '+374'], ['Australia', '+61'], ['Austria', '+43'], ['Azerbaiyán', '+994'],
  ['Bahamas', '+1242'], ['Bahréin', '+973'], ['Bangladés', '+880'], ['Barbados', '+1246'],
  ['Bélgica', '+32'], ['Belice', '+501'], ['Benín', '+229'], ['Bielorrusia', '+375'],
  ['Bolivia', '+591'], ['Bosnia y Herzegovina', '+387'], ['Botsuana', '+267'], ['Brasil', '+55'],
  ['Brunéi', '+673'], ['Bulgaria', '+359'], ['Burkina Faso', '+226'], ['Burundi', '+257'],
  ['Bután', '+975'], ['Cabo Verde', '+238'], ['Camboya', '+855'], ['Camerún', '+237'],
  ['Canadá', '+1'], ['Catar', '+974'], ['Chad', '+235'], ['Chile', '+56'], ['China', '+86'],
  ['Chipre', '+357'], ['Colombia', '+57'], ['Comoras', '+269'], ['Corea del Norte', '+850'],
  ['Corea del Sur', '+82'], ['Costa de Marfil', '+225'], ['Costa Rica', '+506'], ['Croacia', '+385'],
  ['Dinamarca', '+45'], ['Ecuador', '+593'], ['Egipto', '+20'], ['El Salvador', '+503'],
  ['Emiratos Árabes Unidos', '+971'], ['Eritrea', '+291'], ['Eslovaquia', '+421'], ['Eslovenia', '+386'],
  ['España', '+34'], ['Estados Unidos', '+1'], ['Estonia', '+372'], ['Etiopía', '+251'],
  ['Filipinas', '+63'], ['Finlandia', '+358'], ['Fiyi', '+679'], ['Francia', '+33'],
  ['Gabón', '+241'], ['Gambia', '+220'], ['Georgia', '+995'], ['Ghana', '+233'], ['Grecia', '+30'],
  ['Guatemala', '+502'], ['Guinea', '+224'], ['Guinea-Bisáu', '+245'], ['Guinea Ecuatorial', '+240'],
  ['Guyana', '+592'], ['Haití', '+509'], ['Honduras', '+504'], ['Hungría', '+36'], ['India', '+91'],
  ['Indonesia', '+62'], ['Irak', '+964'], ['Irán', '+98'], ['Irlanda', '+353'], ['Islandia', '+354'],
  ['Israel', '+972'], ['Italia', '+39'], ['Jamaica', '+1876'], ['Japón', '+81'], ['Jordania', '+962'],
  ['Kazajistán', '+7'], ['Kenia', '+254'], ['Kirguistán', '+996'], ['Kiribati', '+686'],
  ['Kuwait', '+965'], ['Laos', '+856'], ['Lesoto', '+266'], ['Letonia', '+371'], ['Líbano', '+961'],
  ['Liberia', '+231'], ['Libia', '+218'], ['Liechtenstein', '+423'], ['Lituania', '+370'],
  ['Luxemburgo', '+352'], ['Madagascar', '+261'], ['Malasia', '+60'], ['Malaui', '+265'],
  ['Maldivas', '+960'], ['Malí', '+223'], ['Malta', '+356'], ['Marruecos', '+212'],
  ['Mauricio', '+230'], ['Mauritania', '+222'], ['México', '+52'], ['Moldavia', '+373'],
  ['Mónaco', '+377'], ['Mongolia', '+976'], ['Montenegro', '+382'], ['Mozambique', '+258'],
  ['Namibia', '+264'], ['Nauru', '+674'], ['Nepal', '+977'], ['Nicaragua', '+505'], ['Níger', '+227'],
  ['Nigeria', '+234'], ['Noruega', '+47'], ['Nueva Zelanda', '+64'], ['Omán', '+968'],
  ['Países Bajos', '+31'], ['Pakistán', '+92'], ['Palaos', '+680'], ['Panamá', '+507'],
  ['Papúa Nueva Guinea', '+675'], ['Paraguay', '+595'], ['Perú', '+51'], ['Polonia', '+48'],
  ['Portugal', '+351'], ['Puerto Rico', '+1787'], ['Reino Unido', '+44'],
  ['República Centroafricana', '+236'], ['República Checa', '+420'],
  ['República Democrática del Congo', '+243'], ['República del Congo', '+242'],
  ['República Dominicana', '+1809'], ['Ruanda', '+250'], ['Rumanía', '+40'], ['Rusia', '+7'],
  ['Samoa', '+685'], ['San Marino', '+378'], ['Senegal', '+221'], ['Serbia', '+381'],
  ['Seychelles', '+248'], ['Sierra Leona', '+232'], ['Singapur', '+65'], ['Siria', '+963'],
  ['Somalia', '+252'], ['Sri Lanka', '+94'], ['Suazilandia', '+268'], ['Sudáfrica', '+27'],
  ['Sudán', '+249'], ['Sudán del Sur', '+211'], ['Suecia', '+46'], ['Suiza', '+41'],
  ['Surinam', '+597'], ['Tailandia', '+66'], ['Taiwán', '+886'], ['Tanzania', '+255'],
  ['Tayikistán', '+992'], ['Timor Oriental', '+670'], ['Togo', '+228'], ['Tonga', '+676'],
  ['Trinidad y Tobago', '+1868'], ['Túnez', '+216'], ['Turkmenistán', '+993'], ['Turquía', '+90'],
  ['Tuvalu', '+688'], ['Ucrania', '+380'], ['Uganda', '+256'], ['Uruguay', '+598'],
  ['Uzbekistán', '+998'], ['Vanuatu', '+678'], ['Vaticano', '+379'], ['Venezuela', '+58'],
  ['Vietnam', '+84'], ['Yemen', '+967'], ['Yibuti', '+253'], ['Zambia', '+260'], ['Zimbabue', '+263'],
];

export function iconSpan(name, size) {
  const paths = ICON_PATHS[name] || '';
  return `<span class="icon icon--${size || 16}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></span>`;
}
