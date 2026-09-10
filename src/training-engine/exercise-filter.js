/* Fight Club Training Engine — filtro de ejercicios (Fase 6).
   Puro, sin estado ni DOM, sin IA externa (pedido §15, §29). Ver
   docs/FIGHT_CLUB_TRAINING_ENGINE_AUDIT.md.

   Dado (biblioteca de ejercicios + conceptos de las máquinas ACTIVAS del
   gimnasio + perfil de evaluación + exclusiones del cliente + limitaciones),
   devuelve el POOL real de ejercicios que el generador puede usar, más los
   que quedaron afuera y por qué.

   Reglas DURAS (el ejercicio no entra):
   - exercise.isActive === false (el admin lo apagó).
   - equipo: algún concepto de required_equipment no está cubierto por el
     gimnasio (con algunas equivalencias razonables).
   - el cliente lo marcó como "excluido".
   - patrón de movilidad / boxeo / cardio: no van al pool de fuerza (se
     devuelven aparte para el calentamiento y el trabajo de acondicionamiento).

   Reglas de PRECAUCIÓN (entra pero marcado, el generador lo evita o lo pone
   al final): el cliente declaró molestia/dolor en una articulación y el
   ejercicio la carga en un patrón de alto estrés para esa articulación.
   Esto NO es diagnóstico (pedido §11, §31) — es una restricción conservadora
   configurable: el cliente puede quitar la marca sacando la limitación. */
'use strict';

// Vocabulario real de exercises.movement_pattern (ver la migración
// 20260918000000_training_engine_exercise_metadata.sql).
const MOBILITY_PATTERNS = new Set(['movilidad']);
const BOXING_PATTERNS = new Set(['boxeo']);
const CARDIO_PATTERNS = new Set(['cardio_ciclico', 'cardio_dinamico', 'carrera', 'marcha']);
// Patrones que sirven para acondicionamiento/potencia pero no son "fuerza
// con carga progresiva" clásica.
const CONDITIONING_PATTERNS = new Set(['pliometria', 'saltos', 'explosivo', 'transporte']);

// exercises.contraindicated_joints usa 'columna_lumbar'; client_limitations
// (y el formulario) usan 'espalda'. Acá se traduce el vocabulario del
// cliente al de los ejercicios.
const JOINT_ALIASES = { espalda: 'columna_lumbar', lumbar: 'columna_lumbar', muneca: 'muñeca' };
function normJoint(j) { const k = (j || '').toLowerCase(); return JOINT_ALIASES[k] || k; }

// Reduce las variantes del patrón (empuje_horizontal_inclinado /
// _declinado → empuje_horizontal, rotacion_tronco → flexion_tronco, etc.)
// a una "familia" para razonar el estrés articular sin listar cada variante.
const PATTERN_FAMILY = {
  empuje_horizontal_inclinado: 'empuje_horizontal',
  empuje_horizontal_declinado: 'empuje_horizontal',
  flexion_hombro: 'empuje_vertical',
  rotacion_interna: 'rotacion_externa',
  rotacion_tronco: 'flexion_tronco',
  extension_muñeca: 'flexion_muñeca',
};
function patternFamily(p) { return PATTERN_FAMILY[p] || p || ''; }

// Para cada articulación, las FAMILIAS de patrón que la cargan fuerte. Si el
// cliente declara molestia ahí, esos ejercicios entran con caution=true.
const JOINT_HIGH_STRESS_PATTERNS = {
  rodilla: new Set(['sentadilla', 'zancada', 'extension_rodilla', 'flexion_rodilla', 'empuje_pierna', 'pliometria', 'saltos', 'explosivo']),
  hombro: new Set(['empuje_vertical', 'empuje_horizontal', 'traccion_vertical', 'abduccion_hombro', 'aduccion_horizontal', 'abduccion_horizontal', 'extension_hombro', 'rotacion_externa']),
  codo: new Set(['extension_codo', 'flexion_codo', 'empuje_vertical', 'empuje_horizontal']),
  'muñeca': new Set(['empuje_horizontal', 'empuje_vertical', 'flexion_codo', 'flexion_muñeca', 'sentadilla']),
  columna_lumbar: new Set(['bisagra_cadera', 'sentadilla', 'traccion_horizontal', 'empuje_vertical', 'extension_cadera', 'transporte', 'flexion_tronco']),
  cadera: new Set(['sentadilla', 'zancada', 'bisagra_cadera', 'empuje_pierna', 'extension_cadera', 'abduccion_cadera', 'aduccion_cadera', 'pliometria']),
  tobillo: new Set(['pliometria', 'saltos', 'carrera', 'marcha', 'sentadilla', 'zancada', 'explosivo', 'flexion_plantar']),
};

// Equivalencias de equipo: si el ejercicio pide la clave, alcanza con tener
// alguno del valor.
const EQUIPMENT_EQUIVALENTS = {
  peso_corporal: null,               // siempre disponible
  barra_ez: ['barra'],               // una barra recta sirve para casi todo lo de EZ
  barra: ['barra_fija'],             // el rack/jaula ya implica barra
  cuerda_saltar: ['polea'],          // "cuerda" acá suele ser el accesorio de polea
  guantes: ['saco_boxeo'],
  banco_predicador: ['banco'],
};

function equipmentCovered(concept, gymSet) {
  if (concept === 'peso_corporal') return true;
  if (gymSet.has(concept)) return true;
  const alts = EQUIPMENT_EQUIVALENTS[concept];
  if (alts) for (const a of alts) if (gymSet.has(a)) return true;
  return false;
}

function missingEquipment(exercise, gymSet) {
  const req = exercise.requiredEquipment || [];
  if (!req.length) return [];                 // sin datos → se asume peso corporal
  return req.filter(c => !equipmentCovered(c, gymSet));
}

// Puntaje de afinidad con el estilo preferido (0..1). No excluye — solo
// ordena. 'ambos' / 'indiferente' → neutro.
const STYLE_EQUIPMENT = {
  maquinas: new Set(['maquina', 'maquina_hack', 'maquina_asistida', 'prensa', 'polea']),
  pesas_libres: new Set(['barra', 'barra_ez', 'mancuernas', 'kettlebell']),
  peso_corporal: new Set(['peso_corporal', 'barra_fija']),
};
function styleScore(exercise, preferredStyle) {
  const pref = STYLE_EQUIPMENT[preferredStyle];
  if (!pref) return 0.5;
  const req = exercise.requiredEquipment || ['peso_corporal'];
  const hits = req.filter(c => pref.has(c)).length;
  return hits ? Math.min(1, 0.5 + 0.5 * (hits / req.length)) : 0.2;
}

/* library:      [{ id, name, muscleGroup, movementPattern, secondaryMuscles,
                    contraindicatedJoints, isUnilateral, isActive, requiredEquipment }]
   gymConcepts:  string[]  (unión de equipment.concepts de las máquinas activas)
   profile:      { preferredStyle, primaryGoal }
   excludedIds:  string[]  (client_exercise_preferences con preference='excluido')
   limitations:  [{ joint, painfulMovement }]  (client_limitations, joint!='ninguna')
*/
export function filterExercises({ library = [], gymConcepts = [], profile = {}, excludedIds = [], limitations = [] } = {}) {
  const gymSet = new Set(gymConcepts);
  gymSet.add('peso_corporal');
  const excluded = new Set(excludedIds.map(String));

  // Articulaciones sensibles del cliente (solo las que tienen dolor/molestia
  // en movimiento declarada, o cualquier limitación distinta de 'ninguna').
  const sensitiveJoints = new Set();
  for (const lim of limitations || []) {
    const j = normJoint(lim.joint);
    if (!j || j === 'ninguna' || j === 'otra') continue;
    sensitiveJoints.add(j);
  }

  const goal = profile.primaryGoal || '';
  const wantsConditioning = goal === 'condicion_fisica' || goal === 'potencia' || goal === 'perder_grasa';

  const pool = [];
  const cardioPool = [];
  const mobilityPool = [];
  const conditioningPool = [];
  const rejected = [];

  for (const ex of library) {
    const pattern = ex.movementPattern || '';

    if (ex.isActive === false) { rejected.push({ id: ex.id, name: ex.name, reason: 'desactivado por el gimnasio' }); continue; }
    if (excluded.has(String(ex.id))) { rejected.push({ id: ex.id, name: ex.name, reason: 'el cliente lo excluyó' }); continue; }

    const missing = missingEquipment(ex, gymSet);
    if (missing.length) { rejected.push({ id: ex.id, name: ex.name, reason: `falta equipo: ${missing.join(', ')}` }); continue; }

    // Separá lo que no es fuerza con carga progresiva.
    if (MOBILITY_PATTERNS.has(pattern)) { mobilityPool.push(ex); continue; }
    if (CARDIO_PATTERNS.has(pattern)) { cardioPool.push(ex); continue; }
    if (BOXING_PATTERNS.has(pattern)) {
      if (wantsConditioning) conditioningPool.push(ex);
      else rejected.push({ id: ex.id, name: ex.name, reason: 'patrón de boxeo — fuera del pool de fuerza' });
      continue;
    }
    if (CONDITIONING_PATTERNS.has(pattern) && !wantsConditioning) {
      // Los pliométricos/explosivos solo entran si el objetivo los pide.
      rejected.push({ id: ex.id, name: ex.name, reason: 'patrón explosivo — no aporta al objetivo actual' });
      continue;
    }

    // Precaución por articulación sensible.
    let caution = false;
    const cautionJoints = [];
    const fam = patternFamily(pattern);
    for (const j of sensitiveJoints) {
      const loadsJoint = (ex.contraindicatedJoints || []).map(normJoint).includes(j);
      const highStress = (JOINT_HIGH_STRESS_PATTERNS[j] || new Set()).has(fam);
      if (loadsJoint && highStress) { caution = true; cautionJoints.push(j); }
    }

    const entry = {
      ...ex,
      caution,
      cautionJoints,
      cautionReason: caution ? `Carga ${cautionJoints.join(' / ')} en un patrón exigente; el cliente declaró molestia ahí.` : '',
      styleScore: styleScore(ex, profile.preferredStyle),
    };
    if (CONDITIONING_PATTERNS.has(pattern)) conditioningPool.push(entry);
    else pool.push(entry);
  }

  return {
    pool,                       // ejercicios de fuerza usables (con caution/styleScore)
    cardioPool,                 // cinta / bici / remo / etc. (para calentamiento y finisher)
    mobilityPool,               // movilidad (para calentamiento)
    conditioningPool,           // pliométricos / boxeo / transporte si el objetivo los pide
    rejected,                   // [{id, name, reason}]
    gymConcepts: [...gymSet],
    hasCardioMachine: cardioPool.length > 0,
    hasMobility: mobilityPool.length > 0,
    sensitiveJoints: [...sensitiveJoints],
  };
}

// Reexport para que el generador (Fase 7) arme el objeto `gym` de rules.js
// sin volver a razonar los pools.
export { JOINT_HIGH_STRESS_PATTERNS };
