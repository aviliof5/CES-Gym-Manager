/* Fight Club Training Engine — motor de reglas (Fase 6).
   Puro, sin estado ni DOM, sin IA externa (pedido §15, §29). Ver
   docs/FIGHT_CLUB_TRAINING_ENGINE_AUDIT.md.

   Dado el perfil de evaluación, devuelve la ESTRUCTURA de la rutina (no los
   ejercicios — eso es el generador, Fase 7): qué split, cuántos días, qué
   bloque muscular toca cada día, cuántos ejercicios por sesión (según el
   tiempo disponible), rangos de series/reps/descanso/RIR, y el
   calentamiento. Reglas basadas en principios actuales de entrenamiento
   (progresión, volumen, intensidad, frecuencia, especificidad), NO en
   fórmulas absurdas tipo "si pesás 70 kg levantás X". */
'use strict';

import { weeklySetTargets } from './muscles.js';

// ---- Split según días + nivel ----
// Cada "día" es una lista de bloques (grupos musculares que prioriza). El
// generador reparte el volumen semanal entre los días que trabajan cada
// grupo.
const FULL = ['cuadriceps', 'isquiotibiales', 'gluteos', 'espalda', 'pecho', 'hombros', 'biceps', 'triceps', 'core'];
const UPPER = ['espalda', 'pecho', 'hombros', 'biceps', 'triceps'];
const LOWER = ['cuadriceps', 'isquiotibiales', 'gluteos', 'pantorrillas', 'core'];
const PUSH = ['pecho', 'hombros', 'triceps'];
const PULL = ['espalda', 'biceps', 'trapecios'];
const LEGS = ['cuadriceps', 'isquiotibiales', 'gluteos', 'pantorrillas'];

function splitFor(daysPerWeek, level) {
  switch (daysPerWeek) {
    case 2: return [{ label: 'Día 1 · Cuerpo completo', focus: FULL }, { label: 'Día 2 · Cuerpo completo', focus: FULL }];
    case 3: return [
      { label: 'Día 1 · Cuerpo completo', focus: FULL },
      { label: 'Día 2 · Cuerpo completo', focus: FULL },
      { label: 'Día 3 · Cuerpo completo', focus: FULL },
    ];
    case 4: return [
      { label: 'Día 1 · Tren superior', focus: UPPER },
      { label: 'Día 2 · Tren inferior', focus: LOWER },
      { label: 'Día 3 · Tren superior', focus: UPPER },
      { label: 'Día 4 · Tren inferior', focus: LOWER },
    ];
    case 5: return [
      { label: 'Día 1 · Tren superior', focus: UPPER },
      { label: 'Día 2 · Tren inferior', focus: LOWER },
      { label: 'Día 3 · Empuje', focus: PUSH },
      { label: 'Día 4 · Tracción', focus: PULL },
      { label: 'Día 5 · Piernas', focus: LEGS },
    ];
    case 6: return [
      { label: 'Día 1 · Empuje', focus: PUSH },
      { label: 'Día 2 · Tracción', focus: PULL },
      { label: 'Día 3 · Piernas', focus: LEGS },
      { label: 'Día 4 · Empuje', focus: PUSH },
      { label: 'Día 5 · Tracción', focus: PULL },
      { label: 'Día 6 · Piernas', focus: LEGS },
    ];
    default: return splitFor(3, level);
  }
}

// ---- Parámetros de intensidad según objetivo ----
// repsCompound / repsIsolation: rango de reps. rir: cercanía al fallo
// objetivo (menor = más cerca del fallo). restCompound/restIsolation: seg.
// setsCompound/setsIsolation: series por ejercicio. superset: sugerir
// superseries para ahorrar tiempo (§18).
const GOAL_PARAMS = {
  ganar_masa:           { repsC: '6-10', repsI: '10-15', rir: '1-2', restC: 120, restI: 75, setsC: 4, setsI: 3, superset: false },
  recomposicion:        { repsC: '8-12', repsI: '12-15', rir: '1-2', restC: 90, restI: 60, setsC: 3, setsI: 3, superset: false },
  perder_grasa:         { repsC: '10-15', repsI: '12-20', rir: '1-2', restC: 75, restI: 45, setsC: 3, setsI: 3, superset: true },
  fuerza:               { repsC: '3-6', repsI: '6-10', rir: '2-3', restC: 180, restI: 90, setsC: 5, setsI: 3, superset: false },
  potencia:             { repsC: '3-6', repsI: '6-10', rir: '2-3', restC: 180, restI: 90, setsC: 5, setsI: 3, superset: false },
  resistencia_muscular: { repsC: '15-20', repsI: '15-25', rir: '2-3', restC: 60, restI: 45, setsC: 3, setsI: 3, superset: true },
  condicion_fisica:     { repsC: '8-12', repsI: '12-15', rir: '2', restC: 75, restI: 60, setsC: 3, setsI: 3, superset: false },
  iniciar:              { repsC: '10-12', repsI: '12-15', rir: '3', restC: 90, restI: 75, setsC: 2, setsI: 2, superset: false },
  mantener:             { repsC: '8-12', repsI: '10-15', rir: '2', restC: 90, restI: 60, setsC: 3, setsI: 2, superset: false },
};

// ---- Ejercicios por sesión según el tiempo disponible (§18) ----
// Minutos por ejercicio ≈ series × (trabajo + descanso). Se descuenta el
// calentamiento. Con superseries entran ~30% más.
function exercisesPerSession(sessionMinutes, params) {
  const warmup = 8;
  const usable = Math.max(15, (sessionMinutes || 60) - warmup);
  const setsAvg = (params.setsC + params.setsI) / 2;
  const restAvg = (params.restC + params.restI) / 2;
  const perExercise = setsAvg * (40 + restAvg) / 60; // 40 s de trabajo por serie aprox
  let n = Math.floor(usable / perExercise);
  if (params.superset) n = Math.round(n * 1.3);
  return Math.max(3, Math.min(9, n));
}

// ---- Calentamiento ----
function warmupBlock({ hasCardioMachine, hasMobility }) {
  const parts = [];
  if (hasCardioMachine) parts.push('5 min de cardio suave (cinta, bici o remo) para entrar en calor.');
  parts.push('Movilidad de las articulaciones que vas a usar: 5-8 repeticiones controladas.');
  if (hasMobility) parts.push('1-2 ejercicios de movilidad de la biblioteca según el bloque del día.');
  parts.push('En el primer ejercicio de cada bloque: 2 series de aproximación con poco peso antes de las series reales.');
  return parts;
}

/* Devuelve el "plan spec" completo.
   profile: { level, primaryGoal, secondaryGoal, daysPerWeek, sessionMinutes, priorityMuscles }
   gym: { hasCardioMachine, hasMobility } (del filtro de ejercicios) */
export function buildPlanSpec(profile, gym = {}) {
  const level = profile.level || 'principiante';
  const goal = profile.primaryGoal || 'mantener';
  const days = Math.max(2, Math.min(6, profile.daysPerWeek || 3));
  const params = GOAL_PARAMS[goal] || GOAL_PARAMS.mantener;

  const split = splitFor(days, level);
  const perSession = exercisesPerSession(profile.sessionMinutes, params);
  const weeklyTargets = weeklySetTargets({ level, primaryGoal: goal, priorityMuscles: profile.priorityMuscles });

  return {
    goal, level, days,
    splitName: split.length === 3 ? 'Cuerpo completo' : split.length === 2 ? 'Cuerpo completo' :
      days === 4 ? 'Torso / Pierna' : days === 5 ? 'Torso-Pierna + Empuje-Tracción-Pierna' : 'Empuje / Tracción / Pierna',
    daysPlan: split,                 // [{label, focus:[grupos]}]
    exercisesPerSession: perSession,
    setsCompound: params.setsC,
    setsIsolation: params.setsI,
    repsCompound: params.repsC,
    repsIsolation: params.repsI,
    restCompound: params.restC,
    restIsolation: params.restI,
    rirTarget: params.rir,
    useSupersets: params.superset,
    weeklySetTargets: weeklyTargets, // { grupo: series/semana objetivo }
    warmup: warmupBlock(gym),
    // Nota de seguridad fija (pedido §31) — nunca afirma que algo es seguro.
    safetyNote: 'Si un ejercicio te causa dolor (no la molestia normal del esfuerzo), detenelo y consultá con un profesional de la salud. Ajustá siempre la carga y el rango a tu técnica.',
  };
}
