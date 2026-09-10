/* Fight Club Training Engine — rutina dinámica (Fase 10).
   Puro, sin estado ni DOM, sin IA externa. Ver
   docs/FIGHT_CLUB_TRAINING_ENGINE_AUDIT.md.

   Después de cada sesión, la rutina EVOLUCIONA sola: NO se regenera entera
   (eso sería tirar el progreso), se ajusta lo que ya hay —
   - el peso objetivo de cada ejercicio sube o baja según lo que el cliente
     realmente movió (usa analyzeExercise de progression.js);
   - un ejercicio "estancado" (varias sesiones sin poder progresar, o
     bajando) se rota por otro parecido del pool disponible.

   Devuelve la lista de cambios para que la app los persista en
   routine_exercises y le muestre al cliente un resumen. */
'use strict';

import { analyzeExercise, repRange } from './progression.js';
import { findSubstitute } from './substitution.js';

// Un ejercicio está "estancado" si, en sus últimas 3+ sesiones, el mejor
// peso nunca subió y la última vez el análisis dice bajar (o quedó lejos
// del rango). Rotarlo suele destrabar más que insistir.
function isStalled(logs, target) {
  const withW = (logs || []).filter(l => l.weightKg != null && l.reps != null);
  if (withW.length < 3) return false;
  const bySession = new Map();
  for (const l of withW) {
    const k = l.sessionId || String(l.createdAt || '').slice(0, 10);
    const cur = bySession.get(k) || { w: 0, date: l.createdAt };
    bySession.set(k, { w: Math.max(cur.w, l.weightKg), date: l.createdAt || cur.date });
  }
  const sessions = [...bySession.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (sessions.length < 3) return false;
  const last3 = sessions.slice(-3);
  const noProgress = last3[2].w <= last3[0].w;
  const a = analyzeExercise(logs, target);
  return noProgress && a.action === 'bajar';
}

/* input:
   routineExercises: filas de la rutina COMPLETA (todos los días)
     [{ id, text, exerciseId, reps, weightKg }]  (text puede traer " · RIR …")
   cleanName:  fn(text) -> nombre limpio (lo pasa el llamador, ya lo tiene)
   allLogs:    exercise_logs recientes del cliente (incluida la sesión que
               se acaba de cerrar)
   trainedNames: Set de nombres limpios que se entrenaron en esta sesión
   rirTarget:  RIR objetivo de la rutina ('1-2', '2', …)
   pool:       ejercicios usables (filtered.pool) para las rotaciones; [] = sin rotaciones

   returns: { weightUpdates: [{id, weightKg}],
              swaps: [{id, fromName, to}],   // `to` = ejercicio del pool
              summary: [string] }
*/
export function adaptRoutineAfterSession({ routineExercises = [], cleanName, allLogs = [], trainedNames, pool = [], rirTarget = '2' }) {
  const clean = cleanName || (t => String(t || '').split(' · ')[0].trim());
  const trained = trainedNames instanceof Set ? trainedNames : new Set(trainedNames || []);

  const logsByName = new Map();
  for (const l of allLogs) {
    const k = (l.exerciseName || '').trim();
    if (!logsByName.has(k)) logsByName.set(k, []);
    logsByName.get(k).push(l);
  }

  const weightUpdates = [];
  const swaps = [];
  const summary = [];
  const alreadyInRoutine = new Set(routineExercises.map(r => clean(r.text)));
  const done = new Set();                            // nombres ya procesados (dedupe)

  for (const row of routineExercises) {
    const name = clean(row.text);
    if (!trained.has(name) || done.has(name)) continue;   // solo lo entrenado hoy, una vez
    done.add(name);
    const logs = logsByName.get(name) || [];
    const target = { reps: row.reps, rir: rirTarget };
    const a = analyzeExercise(logs, target);
    const rowsOfThis = routineExercises.filter(r => clean(r.text) === name);

    // ---- rotación por estancamiento ----
    if (pool.length && isStalled(logs, target)) {
      const sub = findSubstitute(
        pool.find(p => clean(p.name) === name) || { name, movementPattern: null, isUnilateral: false },
        pool,
        { exclude: [...alreadyInRoutine].map(String), avoidCaution: true },
      );
      if (sub && clean(sub.name) !== name) {
        for (const r2 of rowsOfThis) swaps.push({ id: r2.id, fromName: name, to: sub });
        alreadyInRoutine.add(clean(sub.name));
        summary.push(`Venías trabado en ${name} — lo cambiamos por ${sub.name}.`);
        continue;                                    // no toca el peso de algo que se va
      }
    }

    // ---- ajuste de peso objetivo ----
    if (a.suggestedWeightKg != null && a.suggestedWeightKg !== (row.weightKg ?? null)) {
      for (const r2 of rowsOfThis) weightUpdates.push({ id: r2.id, weightKg: a.suggestedWeightKg });
      if (a.action === 'subir') summary.push(`${name}: ${row.weightKg ?? '—'} → ${a.suggestedWeightKg} kg.`);
      else if (a.action === 'bajar') summary.push(`${name}: bajamos a ${a.suggestedWeightKg} kg para volver al rango.`);
      else if (row.weightKg == null) summary.push(`${name}: fijamos el objetivo en ${a.suggestedWeightKg} kg.`);
    }
  }

  return { weightUpdates, swaps, summary };
}
