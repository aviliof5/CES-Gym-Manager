/* Fight Club Training Engine — análisis de progresión (Fase 9).
   Puro, sin estado ni DOM, sin IA externa. Ver
   docs/FIGHT_CLUB_TRAINING_ENGINE_AUDIT.md.

   Mira lo que el cliente REALMENTE hizo la última vez en cada ejercicio
   (exercise_logs: reps, peso y RIR por serie) y lo compara con el objetivo
   de la rutina (rango de reps + RIR objetivo). Devuelve, por ejercicio, un
   ajuste conservador para la próxima sesión: subir el peso, mantener y
   sumar reps, o bajar. Sobrecarga progresiva simple — nada de fórmulas
   mágicas, solo "si lo movió fácil y completó el rango, un poco más".

   NO decide solo: es una SUGERENCIA que la app muestra y el cliente aplica
   (o no) ajustando el campo de peso antes de la serie. */
'use strict';

// '6-10' -> {lo:6, hi:10} · '8' -> {lo:8, hi:8} · '15-20' -> {lo:15,hi:20}
export function repRange(s) {
  const m = String(s || '').match(/(\d+)\s*-\s*(\d+)/);
  if (m) return { lo: +m[1], hi: +m[2] };
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? { lo: n, hi: n } : { lo: 8, hi: 12 };
}

// '1-2' -> 1.5 · '2' -> 2 · '3' -> 3
export function parseRirTarget(s) {
  const m = String(s || '').match(/(\d+)\s*-\s*(\d+)/);
  if (m) return (+m[1] + +m[2]) / 2;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 2;
}

// Redondeo a incremento de gimnasio: 2.5 kg para cargas medianas/altas
// (barra, la mayoría de las máquinas), 1 kg para lo liviano (mancuernas
// chicas, aislados). Nunca menos de 1.
export function roundLoad(kg) {
  if (!(kg > 0)) return null;
  const step = kg >= 20 ? 2.5 : 1;
  return Math.max(step, Math.round(kg / step) * step);
}

function avg(nums) {
  const xs = nums.filter(n => n != null && Number.isFinite(n));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/* Analiza UN ejercicio.
   logs:   todas las series registradas de ESTE ejercicio (cualquier fecha),
           [{setNumber, reps, weightKg, rir, createdAt, sessionId}]
   target: { reps: '6-10', rir: '1-2' }
   Devuelve:
   { hasHistory, lastDate, lastWeightKg, lastRepsAvg, lastRirAvg,
     action: 'subir'|'mantener'|'bajar'|'sin_datos',
     suggestedWeightKg, note } */
export function analyzeExercise(logs, target = {}) {
  const range = repRange(target.reps);
  const rirGoal = parseRirTarget(target.rir);

  const withWeight = (logs || []).filter(l => l.weightKg != null);
  if (!withWeight.length) {
    return {
      hasHistory: false, action: 'sin_datos', suggestedWeightKg: null,
      note: `Primera vez. Elegí un peso con el que puedas hacer ${target.reps || range.lo + '-' + range.hi} repeticiones dejando ${target.rir || rirGoal} en reserva.`,
    };
  }

  // La sesión más reciente en la que apareció (agrupa por sessionId; si no
  // hay, por día).
  const keyOf = l => l.sessionId || String(l.createdAt || '').slice(0, 10);
  const lastKey = withWeight
    .slice()
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
  const lastGroupKey = keyOf(lastKey);
  const lastSets = withWeight.filter(l => keyOf(l) === lastGroupKey);

  const lastWeightKg = Math.max(...lastSets.map(l => l.weightKg));
  const lastRepsAvg = avg(lastSets.map(l => l.reps));
  const lastRirAvg = avg(lastSets.map(l => l.rir));
  const lastDate = lastSets.map(l => l.createdAt).sort().pop() || null;

  const base = { hasHistory: true, lastDate, lastWeightKg, lastRepsAvg, lastRirAvg };

  // Sin reps registradas no se puede juzgar el rendimiento — solo repetir.
  if (lastRepsAvg == null) {
    return { ...base, action: 'mantener', suggestedWeightKg: lastWeightKg,
      note: `La última vez: ${lastWeightKg} kg. Registrá las reps y el RIR esta vez para poder ajustar el peso.` };
  }

  const hitTop = lastRepsAvg >= range.hi;
  const underLow = lastRepsAvg < range.lo;
  const leftInTank = lastRirAvg != null && lastRirAvg >= rirGoal + 1;
  const wentToFailure = lastRirAvg != null && lastRirAvg <= 0.5;

  // Subir: completó (o pasó) el tope de reps Y le sobró (RIR alto, o sin RIR
  // registrado pero se pasó del tope por 2+).
  if (hitTop && (leftInTank || (lastRirAvg == null && lastRepsAvg >= range.hi + 2))) {
    const factor = 1.045;
    const sug = roundLoad(lastWeightKg * factor) || lastWeightKg;
    const bump = sug > lastWeightKg ? sug : roundLoad(lastWeightKg + 2.5);
    return { ...base, action: 'subir', suggestedWeightKg: bump,
      note: `La última vez hiciste ${Math.round(lastRepsAvg)} reps${lastRirAvg != null ? ` con RIR ${Math.round(lastRirAvg)}` : ''} — subí a ${bump} kg y volvé a apuntar a ${range.lo}-${range.hi}.` };
  }

  // Bajar: no llegó al piso del rango, o llegó al fallo sin completar.
  if (underLow && (wentToFailure || lastRepsAvg < range.lo - 2)) {
    const sug = roundLoad(lastWeightKg * 0.92) || lastWeightKg;
    return { ...base, action: 'bajar', suggestedWeightKg: sug,
      note: `La última vez ${Math.round(lastRepsAvg)} reps${wentToFailure ? ' y llegaste al fallo' : ''}. Bajá a ${sug} kg para volver al rango de ${range.lo}-${range.hi}.` };
  }

  // Mantener: dentro del rango o cerca — mismo peso, sumá reps.
  return { ...base, action: 'mantener', suggestedWeightKg: lastWeightKg,
    note: `La última vez: ${lastWeightKg} kg × ${Math.round(lastRepsAvg)}${lastRirAvg != null ? `, RIR ${Math.round(lastRirAvg)}` : ''}. Quedate en ${lastWeightKg} kg y sumá 1-2 reps; cuando llegues a ${range.hi} con RIR ${Math.ceil(rirGoal) + 1}+, subí el peso.` };
}

/* Corre analyzeExercise sobre toda una rutina.
   routineExercises: [{ name, reps, rirTarget }]  (name = nombre LIMPIO, sin
     " · RIR ..." — el llamador lo normaliza)
   allLogs: [{ exerciseName, setNumber, reps, weightKg, rir, createdAt, sessionId }]
   Devuelve un Map name -> resultado de analyzeExercise. */
export function analyzeRoutine(routineExercises = [], allLogs = []) {
  const byName = new Map();
  for (const l of allLogs) {
    const k = (l.exerciseName || '').trim();
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(l);
  }
  const out = new Map();
  for (const ex of routineExercises) {
    const name = (ex.name || '').trim();
    if (!name || out.has(name)) continue;
    out.set(name, analyzeExercise(byName.get(name) || [], { reps: ex.reps, rir: ex.rirTarget }));
  }
  return out;
}
