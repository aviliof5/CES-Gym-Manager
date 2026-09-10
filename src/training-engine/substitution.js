/* Fight Club Training Engine — sustitución de ejercicios (Fase 7).
   Puro, sin estado ni DOM. Ver docs/FIGHT_CLUB_TRAINING_ENGINE_AUDIT.md.

   Dado un ejercicio de la rutina + el pool real, devuelve el mejor
   reemplazo: mismo patrón de movimiento si se puede, si no el mismo grupo
   muscular primario. Sirve para: "no tengo la máquina libre", "ese no me
   gusta", o cuando el generador tuvo que meter un ejercicio con precaución y
   aparece uno mejor. NO inventa ejercicios — solo elige de la biblioteca. */
'use strict';

import { contribution } from './muscles.js';

const PATTERN_FAMILY = {
  empuje_horizontal_inclinado: 'empuje_horizontal',
  empuje_horizontal_declinado: 'empuje_horizontal',
  flexion_hombro: 'empuje_vertical',
  rotacion_interna: 'rotacion_externa',
};
function fam(p) { return PATTERN_FAMILY[p] || p || ''; }

function primaryGroup(ex) {
  const c = contribution(ex);
  return Object.keys(c).find(g => c[g] === 1) || null;
}

/* target:  el ejercicio a reemplazar (forma de exercisesLib.list)
   pool:    filtered.pool (ejercicios usables, ya con caution/styleScore)
   opts: { exclude: string[] (ids ya en la rutina, para no duplicar),
           avoidCaution: bool (default true) }
   Devuelve el ejercicio elegido, o null si no hay ninguno razonable. */
export function findSubstitute(target, pool = [], opts = {}) {
  const { exclude = [], avoidCaution = true } = opts;
  const blocked = new Set([String(target && target.id), ...exclude.map(String)]);
  const tFam = fam(target && target.movementPattern);
  const tGroup = primaryGroup(target || {});

  const scored = [];
  for (const ex of pool) {
    if (blocked.has(String(ex.id))) continue;
    if (avoidCaution && ex.caution) continue;

    let s = 0;
    if (tFam && fam(ex.movementPattern) === tFam) s += 4;
    const g = primaryGroup(ex);
    if (tGroup && g === tGroup) s += 2.5;
    else if (tGroup && contribution(ex)[tGroup]) s += 1;
    if (!!ex.isUnilateral === !!(target && target.isUnilateral)) s += 0.3;
    s += (ex.styleScore ?? 0.5) * 0.6;
    if (s > 0) scored.push({ ex, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.length ? scored[0].ex : null;
}

/* Todas las alternativas razonables, ordenadas (para un menú "cambiar por…"
   en la UI). `limit` corta la lista. */
export function listSubstitutes(target, pool = [], opts = {}) {
  const { exclude = [], avoidCaution = true, limit = 5 } = opts;
  const blocked = new Set([String(target && target.id), ...exclude.map(String)]);
  const tFam = fam(target && target.movementPattern);
  const tGroup = primaryGroup(target || {});

  return pool
    .filter(ex => !blocked.has(String(ex.id)) && (!avoidCaution || !ex.caution))
    .map(ex => {
      let s = 0;
      if (tFam && fam(ex.movementPattern) === tFam) s += 4;
      const g = primaryGroup(ex);
      if (tGroup && g === tGroup) s += 2.5;
      else if (tGroup && contribution(ex)[tGroup]) s += 1;
      s += (ex.styleScore ?? 0.5) * 0.6;
      return { ex, s };
    })
    .filter(x => x.s > 1)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(x => x.ex);
}
