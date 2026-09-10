# Fight Club Training Engine

> Motor de generación y progresión de rutinas. **Determinista, 100 % en el
> cliente, sin IA externa ni internet para decidir ejercicios** (pedido §15,
> §29, §34). Fases 1‑14 completas — ver `FIGHT_CLUB_TRAINING_ENGINE_AUDIT.md`
> para la auditoría inicial.

---

## 0. En una frase

El cliente responde una evaluación → se guarda su **perfil de entrenamiento**
→ el motor **filtra** los 116 ejercicios contra el equipo real del gimnasio y
sus limitaciones → las **reglas** deciden la estructura (split, series, reps,
RIR, descanso, calentamiento) → el **generador** arma la rutina semana ejercicio
por ejercicio → el cliente la entrena y registra peso/reps/**RIR** → el
**análisis de progresión** sugiere el peso de la próxima vez → al terminar la
sesión la rutina **se adapta sola** (sube pesos, rota ejercicios estancados).
El entrenador ve todo y puede **adoptar** la rutina como suya.

---

## 1. Arquitectura

Todo el motor vive en `src/training-engine/`. Módulos **puros**: sin estado,
sin DOM, sin `BolaAPI`. Los importa únicamente `src/actions.js`.

| Módulo | Qué hace |
|---|---|
| `muscles.js` | 10 grupos musculares mayores + 2 menores. Normaliza texto libre (`exercises.muscle_group`, `secondary_muscles`) al vocabulario del motor. Modelo de **contribución** (primario 1.0, secundario 0.4). Objetivos de **volumen semanal** por grupo según nivel + objetivo + músculos priorizados. |
| `exercise-filter.js` | `filterExercises()` → el **pool** real de ejercicios usables. Exclusiones duras (equipo que no hay, ejercicios que el cliente excluyó, patrones de movilidad/boxeo/cardio a pools aparte). Marca de **precaución** — no diagnóstico (§11, §31) — cuando el cliente declara molestia en una articulación y el ejercicio la carga en un patrón de alto estrés. |
| `rules.js` | `buildPlanSpec(perfil)` → la **estructura**: split por días, ejercicios por sesión según los minutos, series/reps/descanso/RIR por objetivo, calentamiento, nota de seguridad. |
| `generator.js` | `generateRoutine({spec, filtered})` → la **rutina concreta**. Reparte el volumen semanal entre los días, scoring greedy (compuestos primero, penaliza repetir patrón/grupo el mismo día, evita precaución, respeta estilo y prioridades), asigna series/reps/descanso, reparte los días de la semana. |
| `substitution.js` | `findSubstitute()` / `listSubstitutes()` → mejor reemplazo de un ejercicio (mismo patrón de movimiento → mismo grupo primario). |
| `progression.js` | `analyzeExercise(logs, objetivo)` → mira la última sesión (reps/peso/RIR) y devuelve `subir` / `mantener` / `bajar` + `suggestedWeightKg`. `roundLoad()` redondea a 2.5 kg / 1 kg. |
| `dynamic.js` | `adaptRoutineAfterSession()` → después de una sesión, ajusta la rutina existente: sube/baja pesos objetivo, rota ejercicios estancados (3+ sesiones sin progresar + análisis en `bajar`). |
| `index.js` | Barrel + `planFromProfile()` y `generateFullRoutine()` (pipeline en un paso). |

### Flujo de datos

```
evaluación (src/screens/evaluation.js)
  └─ actions.saveEvaluationAndGenerate()
       ├─ BolaAPI.trainingProfile.save()          → training_profiles
       ├─ BolaAPI.trainingProfile.setExcludedExercises() → client_exercise_preferences
       ├─ BolaAPI.trainingProfile.setLimitations()       → client_limitations
       ├─ BolaAPI.clients.updatePhysical()               → client_profiles (nivel + objetivo de 4)
       ├─ generateFullRoutine({library, gymConcepts, profile, excludedIds, limitations})
       │     filterExercises → buildPlanSpec → generateRoutine
       └─ BolaAPI.routines.generateAi(clientId, goal4, entries)  → routines('ia') + routine_exercises

modo entrenamiento (viewWorkout)
  ├─ startWorkout → BolaAPI.workouts.recentLogs() → analyzeRoutine() → sugerencias + precarga de peso
  ├─ toggleSet   → BolaAPI.workouts.logSet(..., rir)  → exercise_logs (con rir)
  └─ nextExercise (finish) → adaptRoutineNow() → adaptRoutineAfterSession()
        └─ BolaAPI.routines.updateExercises([{id, weightKg?, text?, exerciseId?}])

panel entrenador (viewTrainerClientes)
  ├─ openClientDetail → trainingProfile.get() + routines.getAi() + trainingProfile.listLimitations()
  └─ adoptAiRoutine  → BolaAPI.routines.adoptAiIntoTrainer(clientId, trainerId)  → routines('trainer')
```

---

## 2. Base de datos

**El motor no creó ninguna tabla que reemplace algo.** Todo es aditivo.

### Tablas nuevas (migración `20260917000000`)

- **`training_profiles`** — 1:1 con el cliente. `primary_goal` (9 valores),
  `secondary_goal`, `training_time_bucket`, `machine_comfort`, `days_per_week`,
  `session_minutes`, `preferred_style`, `priority_muscles text[]`, `somatotype`,
  `sex`. RLS: el cliente lee/escribe la suya; el entrenador **solo lee**.
- **`client_exercise_preferences`** — ejercicios que el cliente marcó como
  `excluido`. RLS: self read/write, trainer read‑only.
- **`client_limitations`** — `joint` (`ninguna`/`hombro`/`codo`/`muñeca`/
  `espalda`/`cadera`/`rodilla`/`tobillo`/`otra`), `painful_movement bool`,
  `note`. RLS: self read/write, trainer read‑only.

### Columnas nuevas

| Migración | Tabla | Columnas |
|---|---|---|
| `20260918000000` | `exercises` | `movement_pattern`, `secondary_muscles text[]`, `contraindicated_joints text[]`, `is_unilateral bool`, `is_active bool default true`, `required_equipment text[]` |
| `20260918000000` | `equipment` | `is_active bool default true` |
| `20260918000000` | `exercise_logs` | `rir smallint (0‑10)`, `rpe numeric(3,1)` |
| `20260918000000` | `body_measurements` | `hip_cm numeric(5,1)` |
| `20260919000000` | `equipment` | `concepts text[]` |
| `20260916000000` | `equipment` | `photo_key text` |

### Enums / relación equipo↔ejercicio

El motor **no** vincula `exercises` a `equipment` por FK. Usa **conceptos**:

- `equipment.concepts text[]` — qué "conceptos" ofrece cada máquina
  (`barra`, `mancuernas`, `polea`, `prensa`, `maquina`, `barra_fija`, `cinta`,
  `banco`, …). 21 conceptos, ver `EQUIPMENT_CONCEPTS` en `src/data.js`.
- `exercises.required_equipment text[]` — qué conceptos pide cada ejercicio.
- Un ejercicio es **posible** si TODOS sus conceptos están cubiertos por la
  unión de conceptos de las máquinas **activas** (`equipment.is_active`) del
  gimnasio. `peso_corporal` se da siempre por sentado. Hay equivalencias
  razonables (`barra_ez` ← `barra`, rack → `barra`, etc.).

Las rutinas del motor viven en `routines` con **`source = 'ia'`** — **no** se
agregó el valor `'engine'` que preveía la auditoría; el botón "Generar rutina
con IA" *es* el motor y la rutina cae en el slot que ya lee toda la app.

---

## 3. Cómo decide

### Nivel (`deriveLevel`, `src/data.js`)

`training_time_bucket` × `machine_comfort` → `principiante` / `intermedio` /
`avanzado`. Nunca / < 3 meses → siempre principiante. > 2 años + comodidad
avanzada → avanzado.

### Split (`rules.js`)

| Días | Split |
|---|---|
| 2 | Cuerpo completo A/B |
| 3 | Cuerpo completo ×3 |
| 4 | Tren superior / Tren inferior ×2 |
| 5 | Superior · Inferior · Empuje · Tracción · Piernas |
| 6 | Empuje / Tracción / Piernas ×2 |

### Intensidad por objetivo (`GOAL_PARAMS`, `rules.js`)

Cada uno de los 9 objetivos define reps de compuestos/aislados, RIR objetivo,
descansos y series por ejercicio. Ej.: `ganar_masa` → compuestos 6‑10, aislados
10‑15, RIR 1‑2, descanso 120/75 s. `fuerza` → 3‑6 / 6‑10, RIR 2‑3, descanso
180/90 s.

### Ejercicios por sesión

`(minutos − 8 de calentamiento) / (series × (40 s trabajo + descanso))`, con
**tope por nivel** (principiante 6, intermedio 8, avanzado 9; objetivo
`iniciar` máx 5). Superseries (`perder_grasa`, `resistencia_muscular`) entran
~30 % más.

### Volumen semanal por grupo (`weeklySetTargets`, `muscles.js`)

`base[nivel] × mult[objetivo]`. Core y pantorrillas ×0.7. Grupos priorizados
por el cliente ×1.4. El generador reparte ese objetivo entre los días que
trabajan cada grupo.

### Selección de ejercicios (`generator.js`)

Scoring greedy por día:
`+` cubrir el volumen que falta del foco del día ·
`+1.6` si es compuesto y va en la primera mitad ·
`−2.5` si tiene precaución ·
`−2.2 × veces_usado` ·
`+0.8 × styleScore` (afinidad con el estilo preferido) ·
`+0.5` por músculo priorizado ·
`−1.1 × patrones_repetidos_hoy` · `−0.5 × grupo_primario_repetido_hoy`.

---

## 4. Seguridad (§11, §31)

- El motor **nunca diagnostica** y **nunca afirma que un ejercicio es seguro**.
- Las limitaciones del cliente son **restricciones conservadoras**, no
  diagnósticos. Un ejercicio que carga una articulación sensible en un patrón
  exigente entra al pool **marcado con `caution`**; el generador lo evita y lo
  deja para el final si no hay con qué reemplazarlo.
- La UI muestra un aviso fijo: *"No es un diagnóstico: empezá con poco peso y
  rango corto; si duele, cambialo por otro o consultá con un profesional de la
  salud."*
- `JOINT_HIGH_STRESS_PATTERNS` (`exercise-filter.js`) mapea cada articulación a
  las familias de patrón que la cargan fuerte.

---

## 5. Progresión y adaptación

### Registro (Fase 9)

En el modo entrenamiento, además de peso y reps por serie, el cliente marca el
**RIR** (0/1/2/3/4+, opcional). Se guarda en `exercise_logs.rir`.

### Análisis (`progression.js`)

`analyzeExercise(logs, {reps, rir})` toma la **sesión más reciente** del
ejercicio y devuelve:

| Resultado | Cuándo | Sugerencia |
|---|---|---|
| `sin_datos` | nunca lo hizo | "elegí un peso con el que puedas hacer N reps dejando X en reserva" |
| `subir` | llegó al tope de reps con RIR alto | peso × 1.045 redondeado (mín. +2.5 kg) |
| `bajar` | no llegó al piso del rango, o al fallo | peso × 0.92 |
| `mantener` | en rango | mismo peso, "sumá 1‑2 reps" |

El campo de peso en el modo entrenamiento se **precarga con la sugerencia**.

### Rutina dinámica (`dynamic.js`, Fase 10)

Al terminar un entrenamiento con la rutina `'ia'`, `adaptRoutineAfterSession()`:

1. **Peso objetivo** — por cada ejercicio entrenado, escribe
   `routine_exercises.weight_kg` con la sugerencia del análisis.
2. **Rotación** — si un ejercicio está **estancado** (3+ sesiones sin subir el
   peso *y* la última con el análisis en `bajar`), lo cambia por otro parecido
   del pool (`findSubstitute`).

El resumen ("Sentadilla con barra: 60 → 62.5 kg", "Venías trabado en X — lo
cambiamos por Y") sale en la pantalla "Entrenamiento completado".

Es **best‑effort**: si algo falla, la rutina queda como estaba y se reintenta
la próxima sesión.

---

## 6. Integración con el entrenador (Fase 11)

En **Mis clientes → un cliente**, sección "Fight Club Training Engine":

- **Evaluación del cliente** — solo lectura (`trainingProfileSummary()` en
  `src/data.js`): objetivo, nivel estimado, experiencia, disponibilidad,
  estilo, músculos priorizados, y las molestias declaradas con su nota.
- **Rutina generada por el motor** — lista de solo lectura, agrupada por día.
- Botón **"Adoptar como mi rutina"** — `routines.adoptAiIntoTrainer()` copia
  esos ejercicios (con series/reps/peso/descanso/día) a la rutina `'trainer'`
  del cliente, reemplazando la actual, para editarla libremente.

El entrenador **no puede editar la evaluación** (pedido: "solo verlo").

---

## 7. Tests

```
npm run test:engine        # node scripts/test-training-engine.mjs
```

Corre el motor contra la biblioteca **real** de 116 ejercicios (parseada de las
migraciones `20260908000200` + `20260918000000`) y el equipamiento real de
Fight Club. Cubre los **14 escenarios del §32**:

1‑3 nivel × días · 4‑7 objetivos · 8 gimnasio con pocas máquinas · 9 ejercicio
excluido (+ sustitución) · 10 máquina desactivada · 11 restricción física ·
12‑14 tiempo de sesión · + el progreso modifica la rutina.

Verifica, por escenario: no aparece equipo inexistente · no aparecen ejercicios
desactivados ni excluidos · se respetan las restricciones · la rutina cabe en
el tiempo · los músculos grandes quedan equilibrados entre sí · se respetan los
días · se generan sustituciones · la progresión sube/mantiene/baja bien · la
adaptación cambia la rutina.

**183 checks, 0 fallos** al cierre de la Fase 12.

---

## 8. Rendimiento (Fase 14)

Todos los módulos del motor son puros y corren en microsegundos —
`filterExercises` recorre los 116 ejercicios un par de veces, `generateRoutine`
hace un scoring greedy por día. Eso no es el cuello de botella; las idas y
vueltas a Supabase sí. Fase 14 las agrupó:

- **`enterClientHome`** — `progress` · rutinas (trainer/personal/ia) ·
  check‑ins · interés de entrenadores · `trainingProfile.get` · excluidos ·
  limitaciones pasaron de ~9 `await` encadenados a **un solo `Promise.all`**.
  `computeEnginePlan` (que reconstruye la tarjeta "Cómo está armada") ya no
  dispara sus propias lecturas — usa las de esa tanda.
- **`startWorkout`** — abrir la sesión (`workouts.start`) y traer el historial
  de progresión (`workouts.recentLogs`) van **en paralelo**; antes eran dos
  round‑trips antes de que se abriera la pantalla.
- **`routines.updateExercises`** (rutina dinámica) — las filas se actualizan
  **en paralelo** (`Promise.all`), no una por una.
- **`saveEvaluationAndGenerate`** — `getSelf` ya no bloquea antes del
  `Promise.all` de refresco.

El motor **funciona offline** (§34): si no hay señal, la generación igual
ocurre (es local) y el guardado en `routines`/`exercise_logs` se encola
(`src/offline.js`); la adaptación post‑sesión es best‑effort y se reintenta.

---

## 9. Cómo extenderlo

### Agregar un ejercicio

`INSERT` en `exercises` con `gym_id = null` (catálogo global) + los 6 campos del
motor: `movement_pattern`, `secondary_muscles`, `contraindicated_joints`,
`is_unilateral`, `is_active`, `required_equipment`. El vocabulario de patrones
está en la migración `20260918000000`; el de conceptos de equipo en
`EQUIPMENT_CONCEPTS` (`src/data.js`).

### Agregar una máquina

Desde **Configuración** (dueño/admin) — el editor de equipamiento deja marcar
qué conceptos ofrece. `inferEquipmentConcepts(name)` en `src/data.js` pre‑marca
según el nombre. `equipment.is_active` la prende/apaga sin borrarla.

### Ajustar volumen / intensidad

- Volumen base por nivel → `BASE_WEEKLY_SETS` en `muscles.js`.
- Multiplicador por objetivo → `GOAL_VOLUME_MULT` en `muscles.js`.
- Reps / RIR / descanso / series por objetivo → `GOAL_PARAMS` en `rules.js`.
- Split por días → `splitFor()` en `rules.js`.
- Reglas de progresión (factores de subida/bajada) → `analyzeExercise()` en
  `progression.js`.

Después de cualquier cambio: `npm run test:engine`.
