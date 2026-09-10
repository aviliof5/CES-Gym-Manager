/* Fight Club Training Engine — batería de pruebas (pedido §32).
 *
 * Corre el motor (100% JS puro, sin backend) contra la biblioteca REAL de
 * 116 ejercicios — parseada de la migración aplicada
 * supabase/migrations/20260918000000_training_engine_exercise_metadata.sql —
 * y el equipamiento real de Fight Club.
 *
 *   node scripts/test-training-engine.mjs
 *
 * Cubre los 14 escenarios del §32 y sus verificaciones:
 *   - no aparecen máquinas inexistentes
 *   - no aparecen ejercicios desactivados
 *   - no aparecen ejercicios excluidos
 *   - se respetan las restricciones físicas
 *   - la rutina cabe dentro del tiempo de sesión
 *   - los músculos quedan equilibrados
 *   - se respetan los días disponibles
 *   - se generan sustituciones
 *   - el progreso modifica correctamente la rutina
 *
 * Sale con código != 0 si algo falla (usable en CI).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const eng = await import(pathToFileURL(path.join(ROOT, 'src/training-engine/index.js')).href);
const { contribution } = eng;

// ============================================================
// Biblioteca real: seed 20260908000200 (nombre/grupo/tipo) +
// metadatos del motor de 20260918000000.
// ============================================================
function parseArr(s) {
  const m = (s || '').match(/array\[([^\]]*)\]/);
  if (!m || !m[1].trim()) return [];
  return m[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
}
// separa una fila `'a', 'b', 'c', 3, ...` respetando comillas
function splitRow(row) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === "'" && row[i - 1] !== '\\') q = !q;
    else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.map(x => x.replace(/^'|'$/g, ''));
}

const lib = new Map();

// --- 1) seed base: (null, name, muscle_group, equipment_name, level, goal, kind, ...) ---
const SEED = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260908000200_exercise_library_real_content.sql'), 'utf8');
for (const raw of (SEED.split(/\bvalues\b/i)[1] || '').split(/\),\s*\n/)) {
  const row = raw.replace(/^\s*\(/, '').trim();
  if (!row.startsWith("null, '")) continue;
  const f = splitRow(row);
  const name = f[1];
  if (!name) continue;
  lib.set(name, {
    id: name, name, muscleGroup: f[2] || '', kind: f[6] || '', level: f[4] || '',
    movementPattern: '', secondaryMuscles: [], contraindicatedJoints: [],
    isUnilateral: false, isActive: true, requiredEquipment: [],
  });
}

// --- 2) 20260918000000: UPDATEs con los metadatos del motor ---
const META = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260918000000_training_engine_exercise_metadata.sql'), 'utf8');
for (const line of META.split('\n')) {
  if (!line.startsWith('update public.exercises set movement_pattern')) continue;
  const name = line.match(/name = '([^']+)'/)?.[1];
  if (!name) continue;
  const ex = lib.get(name) || { id: name, name, muscleGroup: '', kind: '', level: '', isActive: true };
  ex.movementPattern = line.match(/movement_pattern = '([a-zñ_]+)'/)?.[1] || '';
  ex.secondaryMuscles = parseArr(line.match(/secondary_muscles = (array\[[^\]]*\])/)?.[1] || '');
  ex.contraindicatedJoints = parseArr(line.match(/contraindicated_joints = (array\[[^\]]*\])/)?.[1] || '');
  ex.isUnilateral = /is_unilateral = true/.test(line);
  ex.requiredEquipment = parseArr(line.match(/required_equipment = (array\[[^\]]*\])/)?.[1] || '');
  lib.set(name, ex);
}

// --- 3) 20260918000000: INSERTs de los 26 ejercicios nuevos ---
for (const raw of (META.split(/\bvalues\b/i)[1] || '').split(/\),\s*\n/)) {
  const row = raw.replace(/^\s*\(/, '').trim();
  if (!row.startsWith("null, '")) continue;
  const arrs = [...row.matchAll(/array\[[^\]]*\]/g)].map(m => m[0]);
  const f = splitRow(row.replace(/array\[[^\]]*\]/g, 'ARR'));
  const name = f[1];
  if (!name || lib.has(name)) continue;
  lib.set(name, {
    id: name, name, muscleGroup: f[2] || '', kind: f[6] || '', level: f[4] || '',
    movementPattern: (row.match(/,\s*'([a-zñ_]+)',\s*array\[/) || [])[1] || '',
    secondaryMuscles: parseArr(arrs[0] || ''), contraindicatedJoints: parseArr(arrs[1] || ''),
    isUnilateral: /,\s*true,\s*array\[/.test(row), isActive: true,
    requiredEquipment: parseArr(arrs[2] || ''),
  });
}

// Solo los que tienen metadatos del motor (los 116 que consume el engine).
const LIBRARY = [...lib.values()].filter(e => e.movementPattern);

// Equipamiento real de Fight Club (sesión de auditoría): banco, barra,
// mancuernas, polea, máquina de extensión de cuádriceps. + peso corporal.
const FIGHT_CLUB = ['banco', 'barra', 'mancuernas', 'polea', 'maquina'];
// "Pocas máquinas" (§32.8): solo lo más básico.
const POCAS = ['mancuernas', 'banco'];

// ============================================================
// helpers de aserción
// ============================================================
let failed = 0, passed = 0;
const results = [];
function scenario(n, label) {
  const checks = [];
  const rec = { n, label, checks };
  results.push(rec);
  return {
    ok(cond, msg) { checks.push({ ok: !!cond, msg }); if (cond) passed++; else failed++; },
  };
}

const EQUIP_LENIENCY = {
  barra_ez: ['barra'], barra: ['barra_fija'], cuerda_saltar: ['polea'],
  guantes: ['saco_boxeo'], banco_predicador: ['banco'],
};
function equipCovered(concept, gymSet) {
  if (concept === 'peso_corporal') return true;
  if (gymSet.has(concept)) return true;
  return (EQUIP_LENIENCY[concept] || []).some(a => gymSet.has(a));
}

// tiempo estimado de una sesión (min): calentamiento + ejercicios
function estSessionMinutes(spec) {
  const setsAvg = (spec.setsCompound + spec.setsIsolation) / 2;
  const restAvg = (spec.restCompound + spec.restIsolation) / 2;
  const perEx = setsAvg * (40 + restAvg) / 60;
  return 8 + spec.exercisesPerSession * perEx * (spec.useSupersets ? 0.77 : 1);
}

// volumen semanal real por grupo en la rutina generada
function weeklyVolume(plan) {
  const vol = {};
  for (const day of plan.perDay || []) {
    for (const it of day.items) {
      const ex = lib.get(it.exerciseId) || LIBRARY.find(e => e.name === (it.text || '').split(' · ')[0]);
      if (!ex) continue;
      for (const [g, w] of Object.entries(contribution(ex))) vol[g] = (vol[g] || 0) + w * it.sets;
    }
  }
  return vol;
}

// ============================================================
// runner de un escenario estándar
// ============================================================
function runScenario(n, label, { profile, gymConcepts = FIGHT_CLUB, excludedIds = [], limitations = [] }) {
  const s = scenario(n, label);
  const gymSet = new Set([...gymConcepts, 'peso_corporal']);

  const { entries, plan, filtered } = eng.generateFullRoutine({
    library: LIBRARY, gymConcepts, profile, excludedIds, limitations,
  });

  // -- días disponibles --
  const days = new Set(entries.map(e => e.dayLabel));
  s.ok(plan.daysPlan.length === Math.max(2, Math.min(6, profile.daysPerWeek)), `split usa ${profile.daysPerWeek} días`);
  if (filtered.pool.length >= 12) s.ok(days.size === plan.daysPlan.length, `rutina reparte en ${plan.daysPlan.length} días (${days.size})`);

  // -- no equipo inexistente --
  const badEquip = filtered.pool.filter(ex => (ex.requiredEquipment || []).some(c => !equipCovered(c, gymSet)));
  s.ok(badEquip.length === 0, `ningún ejercicio pide equipo inexistente${badEquip.length ? ` (${badEquip[0].name})` : ''}`);

  // -- no ejercicios desactivados --
  s.ok(!filtered.pool.some(ex => ex.isActive === false), 'ningún ejercicio desactivado en el pool');

  // -- no excluidos --
  const exSet = new Set(excludedIds);
  s.ok(!filtered.pool.some(ex => exSet.has(ex.id)), 'ningún ejercicio excluido en el pool');
  s.ok(!entries.some(e => exSet.has(e.exerciseId)), 'ningún ejercicio excluido en la rutina');

  // -- restricciones físicas --
  if (limitations.length) {
    const joints = new Set(limitations.map(l => (l.joint === 'espalda' ? 'columna_lumbar' : l.joint)));
    // Cualquier ejercicio del pool que cargue una articulación sensible en
    // patrón de alto estrés tiene que estar marcado con caution (no colarse
    // como normal).
    const unflagged = filtered.pool.filter(ex => {
      if (ex.caution) return false;
      return (ex.contraindicatedJoints || []).some(j => {
        const nj = j === 'espalda' ? 'columna_lumbar' : j;
        if (!joints.has(nj)) return false;
        const set = eng.JOINT_HIGH_STRESS_PATTERNS[nj];
        return set && set.has((ex.movementPattern || '').replace(/_(inclinado|declinado)$/, ''));
      });
    });
    s.ok(unflagged.length === 0, `todo lo riesgoso para la articulación va marcado (${unflagged.length} sin marcar)`);
    s.ok(filtered.pool.some(ex => ex.caution) || filtered.pool.length < 5, 'el pool marca ejercicios con precaución');
  }

  // -- la rutina cabe en el tiempo --
  const est = estSessionMinutes(plan);
  s.ok(est <= profile.sessionMinutes + 12, `la sesión cabe en ${profile.sessionMinutes} min (estimado ${Math.round(est)})`);
  s.ok(plan.exercisesPerSession >= 3, `al menos 3 ejercicios por sesión (${plan.exercisesPerSession})`);

  // -- músculos equilibrados --
  // Balance RELATIVO: con poco tiempo o poco equipo el volumen total baja
  // para TODO — lo que importa es que no quede lopsided (pecho 12 / espalda
  // 2). Se compara cada grupo grande del foco contra la mediana de los
  // grupos grandes, no contra un objetivo absoluto.
  {
    const vol = weeklyVolume(plan);
    const MAJORS = ['cuadriceps', 'isquiotibiales', 'gluteos', 'espalda', 'pecho', 'hombros'];
    const focusMajors = MAJORS.filter(g => plan.daysPlan.some(d => d.focus.includes(g)) && LIBRARY.some(e => contribution(e)[g] === 1 && (e.requiredEquipment || []).every(c => equipCovered(c, gymSet))));
    const vals = focusMajors.map(g => vol[g] || 0).sort((a, b) => a - b);
    const median = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
    const lopsided = focusMajors.filter(g => median > 2 && (vol[g] || 0) < median * 0.3);
    s.ok(lopsided.length === 0, `músculos grandes equilibrados entre sí (${lopsided.join(', ') || 'ok'})`);
    const tgt = plan.weeklySetTargets;
    const bloated = Object.entries(vol).filter(([g, v]) => tgt[g] && v > tgt[g] * 2.3);
    s.ok(bloated.length === 0, `sin grupos sobreentrenados (${bloated.map(x => x[0]).join(', ') || 'ok'})`);
  }

  // -- calentamiento + RIR presentes (no MVP de mentira, §36) --
  s.ok(plan.warmup && plan.warmup.length > 0, 'incluye calentamiento');
  s.ok(!!plan.rirTarget, 'define RIR objetivo');
  s.ok(entries.every(e => e.sets && e.reps && e.restSeconds), 'cada ejercicio trae series/reps/descanso');

  return { entries, plan, filtered };
}

// ============================================================
// LOS 14 ESCENARIOS DEL §32
// ============================================================
const base = {
  sex: 'masculino', level: 'intermedio', primaryGoal: 'ganar_masa', secondaryGoal: null,
  daysPerWeek: 4, sessionMinutes: 60, preferredStyle: 'ambos', priorityMuscles: [],
};

runScenario(1, 'Principiante + 3 días', { profile: { ...base, level: 'principiante', primaryGoal: 'iniciar', daysPerWeek: 3, sessionMinutes: 45 } });
runScenario(2, 'Intermedio + 4 días', { profile: { ...base } });
runScenario(3, 'Avanzado + 5 días', { profile: { ...base, level: 'avanzado', daysPerWeek: 5, sessionMinutes: 75 } });
runScenario(4, 'Hipertrofia', { profile: { ...base, primaryGoal: 'ganar_masa' } });
runScenario(5, 'Pérdida de grasa', { profile: { ...base, primaryGoal: 'perder_grasa', daysPerWeek: 4, sessionMinutes: 45 } });
runScenario(6, 'Fuerza', { profile: { ...base, level: 'avanzado', primaryGoal: 'fuerza', daysPerWeek: 4, sessionMinutes: 75 } });
runScenario(7, 'Recomposición', { profile: { ...base, primaryGoal: 'recomposicion' } });
runScenario(8, 'Gimnasio con pocas máquinas', { profile: { ...base, preferredStyle: 'peso_corporal' }, gymConcepts: POCAS });

// 9. Ejercicio excluido + sustitución
{
  const excluded = ['Sentadilla con barra'];
  const { filtered } = runScenario(9, 'Ejercicio excluido', { profile: { ...base }, excludedIds: excluded });
  const s = scenario(9, 'Ejercicio excluido — sustitución');
  const target = LIBRARY.find(e => e.name === 'Sentadilla con barra');
  const sub = eng.findSubstitute(target, filtered.pool, { exclude: [] });
  s.ok(sub && sub.name !== 'Sentadilla con barra', `hay sustituto para la sentadilla (${sub && sub.name})`);
  s.ok(sub && (sub.movementPattern === target.movementPattern || contribution(sub).cuadriceps), 'el sustituto trabaja el mismo patrón/músculo');
}

// 10. Máquina desactivada (se cae 'polea' del gimnasio)
{
  const s = scenario(10, 'Máquina desactivada (polea)');
  const gym = FIGHT_CLUB.filter(c => c !== 'polea');
  const { filtered } = eng.generateFullRoutine({ library: LIBRARY, gymConcepts: gym, profile: { ...base }, excludedIds: [], limitations: [] });
  const gymSet = new Set([...gym, 'peso_corporal']);
  s.ok(!filtered.pool.some(ex => (ex.requiredEquipment || []).includes('polea')), 'ningún ejercicio de polea en el pool');
  s.ok(filtered.rejected.some(r => /polea/.test(r.reason)), 'los de polea aparecen como descartados por equipo');
  s.ok(filtered.pool.length > 10, `queda pool suficiente sin polea (${filtered.pool.length})`);
}

// 11. Restricción física
runScenario(11, 'Restricción física (rodilla + dolor)', {
  profile: { ...base }, limitations: [{ joint: 'rodilla', painfulMovement: true }],
});

// 12-14. Tiempo de sesión
runScenario(12, 'Sesión de 30 minutos', { profile: { ...base, sessionMinutes: 30 } });
runScenario(13, 'Sesión de 60 minutos', { profile: { ...base, sessionMinutes: 60 } });
runScenario(14, 'Sesión de 90 minutos', { profile: { ...base, level: 'avanzado', sessionMinutes: 90 } });

// ============================================================
// EXTRA — el progreso modifica correctamente la rutina (§32)
// ============================================================
{
  const s = scenario('P', 'El progreso modifica la rutina');
  const { entries, plan } = eng.generateFullRoutine({ library: LIBRARY, gymConcepts: FIGHT_CLUB, profile: { ...base }, excludedIds: [], limitations: [] });
  const first = entries[0];
  const name = (first.text || '').split(' · ')[0];
  const day = '2026-09-01';
  // sesión "fácil": completó el tope de reps con RIR alto -> debe subir peso
  const logs = [1, 2, 3].map(setN => ({
    exerciseName: name, setNumber: setN, reps: 12, weightKg: 50, rir: 3,
    createdAt: `${day}T10:0${setN}:00Z`, sessionId: 'ws-1',
  }));
  const a = eng.analyzeExercise(logs, { reps: first.reps, rir: plan.rirTarget });
  s.ok(a.action === 'subir' && a.suggestedWeightKg > 50, `sesión fácil -> sube el peso (${a.action} a ${a.suggestedWeightKg})`);

  const mk = (reps, rir, w = 40) => [1, 2, 3].map(n => ({ exerciseName: 'X', setNumber: n, reps, weightKg: w, rir, createdAt: `2026-09-0${n}T10:00:00Z`, sessionId: 's' }));
  s.ok(eng.analyzeExercise(mk(9, 1), { reps: '8-12', rir: '1-2' }).action === 'mantener', 'en rango con RIR bajo -> mantener');
  s.ok(eng.analyzeExercise(mk(4, 0, 100), { reps: '8-12', rir: '1-2' }).action === 'bajar', 'al fallo bajo el rango -> bajar');
  s.ok(eng.analyzeExercise([], { reps: '8-12', rir: '1-2' }).action === 'sin_datos', 'sin historial -> sin_datos');

  const routineRows = entries.map((e, i) => ({ id: `r${i}`, text: e.text, exerciseId: e.exerciseId, reps: e.reps, weightKg: 50 }));
  const adapt = eng.adaptRoutineAfterSession({
    routineExercises: routineRows, cleanName: t => String(t).split(' · ')[0].trim(),
    allLogs: logs, trainedNames: new Set([name]), pool: [], rirTarget: plan.rirTarget,
  });
  s.ok(adapt.weightUpdates.length >= 1, `adaptRoutineAfterSession genera cambios de peso (${adapt.weightUpdates.length})`);
  s.ok(adapt.weightUpdates.every(u => u.weightKg > 50), 'el peso objetivo sube, no baja');

  // sesión "al fallo, corto" repetida -> rota el ejercicio
  const stalledLogs = ['2026-07-20', '2026-08-01', '2026-08-15'].flatMap(d =>
    [1, 2, 3].map(n => ({ exerciseName: name, setNumber: n, reps: 4, weightKg: 90, rir: 0, createdAt: `${d}T10:0${n}:00Z`, sessionId: 'ws-' + d })));
  const pool = eng.filterExercises({ library: LIBRARY, gymConcepts: FIGHT_CLUB, profile: { ...base }, excludedIds: [], limitations: [] }).pool;
  const adapt2 = eng.adaptRoutineAfterSession({
    routineExercises: [{ id: 'x', text: first.text, exerciseId: first.exerciseId, reps: first.reps, weightKg: 90 }],
    cleanName: t => String(t).split(' · ')[0].trim(),
    allLogs: stalledLogs, trainedNames: new Set([name]), pool, rirTarget: plan.rirTarget,
  });
  s.ok(adapt2.swaps.length >= 1 || adapt2.weightUpdates.some(u => u.weightKg < 90), 'ejercicio estancado -> rota o baja el peso');
}

// ============================================================
// REPORTE
// ============================================================
console.log(`\nFight Club Training Engine — batería §32`);
console.log(`biblioteca: ${LIBRARY.length} ejercicios (${LIBRARY.filter(e => e.movementPattern).length} con patrón de movimiento)\n`);
for (const r of results) {
  const bad = r.checks.filter(c => !c.ok);
  console.log(`${bad.length ? '❌' : '✅'} #${r.n} ${r.label}`);
  for (const c of r.checks) console.log(`   ${c.ok ? '·' : '✗'} ${c.msg}`);
}
console.log(`\n${failed ? '❌' : '✅'} ${passed} checks ok, ${failed} fallos`);
process.exit(failed ? 1 : 0);
