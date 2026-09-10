/* Fight Club Training Engine — modelo de músculos y volumen (Fase 6).
   Puro, sin estado ni DOM. Ver docs/FIGHT_CLUB_TRAINING_ENGINE_AUDIT.md.

   El motor razona en 10 grupos musculares "mayores" + 2 menores. Cada
   ejercicio aporta 1.0 a su grupo primario y SEC_WEIGHT a cada grupo
   secundario — así el generador puede contar el volumen semanal real
   (incluyendo solapamiento: un press de banca suma también a tríceps y
   hombro) y evitar rutinas desequilibradas (pedido §17). */
'use strict';

export const SEC_WEIGHT = 0.4;

// Grupos que el motor equilibra. El orden es el de "prioridad de armado"
// (primero los grandes compuestos).
export const MUSCLE_GROUPS = [
  'cuadriceps', 'isquiotibiales', 'gluteos', 'espalda', 'pecho',
  'hombros', 'biceps', 'triceps', 'core', 'pantorrillas',
];
export const MINOR_GROUPS = ['trapecios', 'antebrazos'];

// Normaliza el texto libre de exercises.muscle_group / primary muscle /
// secondary_muscles al vocabulario de arriba. Devuelve null si no cae en
// ninguno (ej. "Cardio", "Full body", "Movilidad" — esos ejercicios no
// cuentan para el volumen de fuerza).
const NORM = [
  [/cu[aá]driceps|piernas?/, 'cuadriceps'],
  [/isquiotibial|femoral/, 'isquiotibiales'],
  [/gl[uú]teo/, 'gluteos'],
  [/espalda|dorsal|romboides|redondo/, 'espalda'],
  [/pecho|pectoral/, 'pecho'],
  [/hombro|deltoides|manguito|subescapular/, 'hombros'],
  [/b[ií]ceps|braquial(?!\s*tr)/, 'biceps'],
  [/tr[ií]ceps/, 'triceps'],
  [/core|abdomen|abdominal|oblicuo|lumbar|erectores|transverso/, 'core'],
  [/pantorrilla|gemelo|s[oó]leo|gastrocnemio/, 'pantorrillas'],
  [/trapecio/, 'trapecios'],
  [/antebrazo|braquiorradial|flexores de mu|extensores de mu/, 'antebrazos'],
];
export function normMuscle(text) {
  const s = (text || '').toLowerCase();
  for (const [re, g] of NORM) if (re.test(s)) return g;
  return null;
}

// Mapa de contribución de UN ejercicio: { grupo: peso }. Primario = 1.0,
// cada secundario reconocido = SEC_WEIGHT (sin duplicar el primario).
export function contribution(exercise) {
  const out = {};
  const primary = normMuscle(exercise.muscleGroup) || normMuscle(exercise.name);
  if (primary) out[primary] = 1;
  for (const sec of exercise.secondaryMuscles || []) {
    const g = normMuscle(sec);
    if (g && g !== primary) out[g] = Math.max(out[g] || 0, SEC_WEIGHT);
  }
  return out;
}

// Objetivo de series semanales por grupo muscular MAYOR, según nivel y
// objetivo. Son puntos de partida basados en rangos de la literatura
// (MEV/MAV aprox), no dogma — el generador ajusta según los días y el
// tiempo disponible, y sube ~40% los grupos que el cliente eligió priorizar.
const BASE_WEEKLY_SETS = {
  principiante: 9,
  intermedio: 14,
  avanzado: 18,
};
// Multiplicador del volumen total según objetivo.
const GOAL_VOLUME_MULT = {
  ganar_masa: 1,
  recomposicion: 0.9,
  perder_grasa: 0.85,
  fuerza: 0.7,          // menos volumen, más intensidad
  potencia: 0.7,
  resistencia_muscular: 1.05,
  condicion_fisica: 0.85,
  iniciar: 0.6,
  mantener: 0.75,
};

export function weeklySetTargets({ level, primaryGoal, priorityMuscles = [] }) {
  const base = BASE_WEEKLY_SETS[level] || BASE_WEEKLY_SETS.intermedio;
  const mult = GOAL_VOLUME_MULT[primaryGoal] ?? 0.85;
  const priority = new Set(priorityMuscles);
  const targets = {};
  for (const g of MUSCLE_GROUPS) {
    let t = base * mult;
    // Core y pantorrillas rara vez necesitan tanto como pecho/espalda.
    if (g === 'core' || g === 'pantorrillas') t *= 0.7;
    if (priority.has(g)) t *= 1.4;
    targets[g] = Math.round(t);
  }
  return targets;
}
