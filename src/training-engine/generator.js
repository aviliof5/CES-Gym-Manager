/* Fight Club Training Engine — generador de rutina (Fase 7).
   Puro, sin estado ni DOM, sin IA externa (pedido §15, §29). Ver
   docs/FIGHT_CLUB_TRAINING_ENGINE_AUDIT.md.

   Toma la ESTRUCTURA (rules.js → buildPlanSpec) y el POOL real de ejercicios
   (exercise-filter.js → filterExercises) y arma la rutina concreta: elige
   ejercicio por ejercicio para cada día, repartiendo el volumen semanal
   objetivo por grupo muscular entre los días que trabajan ese grupo, sin
   pasarse del tiempo de sesión, poniendo los compuestos primero, evitando
   repetir de más y dejando los ejercicios "con precaución" para el final (o
   afuera si hay con qué reemplazarlos).

   Devuelve `entries` con la forma que espera BolaAPI.routines.generateAi()
   (text/sets/reps/weightKg/restSeconds/exerciseId + dayLabel/dayOfWeek), más
   el `plan` (la estructura) para que la UI muestre el calentamiento, el
   split y el RIR objetivo (Fase 8). */
'use strict';

import { contribution } from './muscles.js';

// Familias de patrón que son "compuestas" (varias articulaciones, buen
// candidato para ir primero y cargar el grueso del volumen).
const COMPOUND_PATTERNS = new Set([
  'sentadilla', 'empuje_pierna', 'zancada', 'bisagra_cadera',
  'empuje_horizontal', 'empuje_vertical', 'traccion_vertical', 'traccion_horizontal',
  'extension_cadera',
]);
const PATTERN_FAMILY = {
  empuje_horizontal_inclinado: 'empuje_horizontal',
  empuje_horizontal_declinado: 'empuje_horizontal',
  flexion_hombro: 'empuje_vertical',
};
function fam(p) { return PATTERN_FAMILY[p] || p || ''; }

function isCompound(ex) {
  const k = (ex.kind || '').toLowerCase();
  if (/compuesto|compound/.test(k)) return true;
  if (/aislamiento|isolation|aislado/.test(k)) return false;
  return COMPOUND_PATTERNS.has(fam(ex.movementPattern));
}

// Qué día de la semana (0=Lunes) cae cada sesión, repartido con descanso
// entre medio siempre que se pueda.
const DAY_SPREAD = {
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 4, 5, 6],
};

function primaryGroup(ex) {
  const c = contribution(ex);
  return Object.keys(c).find(g => c[g] === 1) || null;
}

/* input: { spec, filtered, profile }
   spec:     buildPlanSpec(...)
   filtered: filterExercises(...)  (usa filtered.pool)
   profile:  { priorityMuscles }
*/
export function generateRoutine({ spec, filtered, profile = {} }) {
  const pool = (filtered.pool || []).slice();
  const days = spec.daysPlan || [];
  const spread = DAY_SPREAD[days.length] || days.map((_, i) => i);
  const priority = new Set(profile.priorityMuscles || []);

  // Cuántos días toca cada grupo (para dividir el volumen semanal).
  const daysPerGroup = {};
  for (const d of days) for (const g of d.focus) daysPerGroup[g] = (daysPerGroup[g] || 0) + 1;

  const usage = {};            // exId -> veces usado en la semana
  const entries = [];
  const perDay = [];           // para el `plan` de salida

  days.forEach((day, di) => {
    // Series que se quieren cubrir HOY por grupo del foco del día.
    const need = {};
    for (const g of day.focus) {
      const wk = spec.weeklySetTargets[g];
      if (wk == null) continue;
      need[g] = wk / (daysPerGroup[g] || 1);
    }

    const candidates = pool.filter(ex => {
      const c = contribution(ex);
      return day.focus.some(g => c[g]);
    });

    const picks = [];
    const maxEx = spec.exercisesPerSession;
    const minEx = Math.min(maxEx, Math.max(3, day.focus.length));

    while (picks.length < maxEx) {
      let best = null, bestScore = -Infinity;
      for (const ex of candidates) {
        if (picks.includes(ex)) continue;
        const used = usage[ex.id] || 0;
        if (used >= 2) continue;

        const c = contribution(ex);
        const compound = isCompound(ex);
        const sets = compound ? spec.setsCompound : spec.setsIsolation;

        let score = 0;
        for (const [g, w] of Object.entries(c)) {
          if (need[g] == null) { score += w * 0.15; continue; }   // crédito chico por grupo fuera del foco
          score += Math.min(w * sets, Math.max(0, need[g]));
        }
        // Compuestos primero.
        if (compound && picks.length < Math.ceil(maxEx / 2)) score += 1.6;
        // Evitá los "con precaución" y los ya usados.
        if (ex.caution) score -= 2.5;
        score -= used * 2.2;
        // Estilo preferido y músculos priorizados.
        score += (ex.styleScore ?? 0.5) * 0.8;
        for (const g of Object.keys(c)) if (priority.has(g)) score += 0.5;
        // Variedad: penalizá (creciente) repetir el mismo patrón ya elegido
        // hoy — evita "3 remos y ningún press" en una sola sesión.
        const sameFam = picks.filter(p => fam(p.movementPattern) === fam(ex.movementPattern)).length;
        score -= sameFam * 1.1;
        // Y penalizá repetir exactamente el mismo grupo primario más de una vez.
        const samePrimary = picks.filter(p => primaryGroup(p) && primaryGroup(p) === primaryGroup(ex)).length;
        score -= samePrimary * 0.5;

        if (score > bestScore) { bestScore = score; best = ex; }
      }
      if (!best) break;

      const stillShort = Object.values(need).some(n => n > 1.5);
      if (!stillShort && picks.length >= minEx) break;

      picks.push(best);
      usage[best.id] = (usage[best.id] || 0) + 1;
      const c = contribution(best);
      const sets = isCompound(best) ? spec.setsCompound : spec.setsIsolation;
      for (const [g, w] of Object.entries(c)) if (need[g] != null) need[g] -= w * sets;
    }

    // Compuestos arriba, aislados abajo — orden de ejecución sensato.
    picks.sort((a, b) => (isCompound(b) ? 1 : 0) - (isCompound(a) ? 1 : 0));

    const dayItems = picks.map(ex => {
      const compound = isCompound(ex);
      const sets = compound ? spec.setsCompound : spec.setsIsolation;
      const reps = compound ? spec.repsCompound : spec.repsIsolation;
      const rest = compound ? spec.restCompound : spec.restIsolation;
      const cautionTxt = ex.caution ? ` · ⚠ cuidá ${ex.cautionJoints.join(' / ')}` : '';
      // El texto es el respaldo (lo que ve quien no lee sets/reps
      // estructurados). Las series/reps van en sus columnas y las muestra
      // exerciseRow(); acá solo el nombre + el RIR objetivo + la marca de
      // precaución, para no repetir "4×6-10" dos veces en la misma fila.
      const entry = {
        text: `${ex.name} · RIR ${spec.rirTarget}${cautionTxt}`,
        exerciseId: ex.id || null,
        sets, reps, weightKg: null, restSeconds: rest,
        dayLabel: day.label,
        dayOfWeek: spread[di] ?? di,
        caution: !!ex.caution,
        cautionJoints: ex.cautionJoints || [],
        primaryGroup: primaryGroup(ex),
        compound,
      };
      entries.push({
        text: entry.text, exerciseId: ex.id || null, sets, reps,
        weightKg: null, restSeconds: rest, dayLabel: entry.dayLabel, dayOfWeek: entry.dayOfWeek,
      });
      return entry;
    });

    perDay.push({ label: day.label, dayOfWeek: spread[di] ?? di, focus: day.focus, items: dayItems });
  });

  return {
    entries,
    plan: {
      ...spec,
      perDay,
      totalExercises: entries.length,
    },
  };
}
