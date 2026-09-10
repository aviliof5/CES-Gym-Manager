/* Fight Club Training Engine — punto de entrada (Fase 6+).
   Motor determinista, 100% en el cliente, sin IA externa ni internet para
   decidir ejercicios (pedido §15, §29, §34). Ver
   docs/FIGHT_CLUB_TRAINING_ENGINE_AUDIT.md.

   Fase 6 entrega: el filtro de ejercicios + el motor de reglas (la
   estructura de la rutina). La Fase 7 agrega generator.js (arma la rutina
   ejercicio por ejercicio) y substitution.js. */
'use strict';

export { filterExercises, JOINT_HIGH_STRESS_PATTERNS } from './exercise-filter.js';
export { buildPlanSpec } from './rules.js';
export { generateRoutine } from './generator.js';
export { findSubstitute, listSubstitutes } from './substitution.js';
export { analyzeExercise, analyzeRoutine, repRange, parseRirTarget, roundLoad } from './progression.js';
export { contribution, weeklySetTargets, normMuscle, MUSCLE_GROUPS, MINOR_GROUPS, SEC_WEIGHT } from './muscles.js';

import { filterExercises } from './exercise-filter.js';
import { buildPlanSpec } from './rules.js';
import { generateRoutine } from './generator.js';

/* Conveniencia: filtro + reglas en un paso (sin armar la rutina concreta).
   input: { library, gymConcepts, profile, excludedIds, limitations } */
export function planFromProfile(input) {
  const filtered = filterExercises(input);
  const spec = buildPlanSpec(input.profile || {}, {
    hasCardioMachine: filtered.hasCardioMachine,
    hasMobility: filtered.hasMobility,
  });
  return { spec, filtered };
}

/* El pipeline completo: perfil → rutina lista para guardar.
   Devuelve { entries, plan, filtered }:
   - entries: filas para BolaAPI.routines.generateAi()
   - plan:    estructura + perDay (para la UI: calentamiento, split, RIR)
   - filtered: pools (para sustituciones y para explicar qué quedó afuera) */
export function generateFullRoutine(input) {
  const filtered = filterExercises(input);
  const spec = buildPlanSpec(input.profile || {}, {
    hasCardioMachine: filtered.hasCardioMachine,
    hasMobility: filtered.hasMobility,
  });
  const { entries, plan } = generateRoutine({ spec, filtered, profile: input.profile || {} });
  return { entries, plan, filtered };
}
