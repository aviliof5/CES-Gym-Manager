# Fight Club Training Engine — Auditoría (Fase 1)

> Solo lectura. Ningún archivo de la app fue modificado para producir este documento.
> Fuente: código real en `src/`, `supabase-client.js`, `mock-client.js` y las 35 migraciones de `supabase/migrations/` (verificadas contra el proyecto Supabase `sblujafvppibjbxrmsgc`).

---

## 0. Resumen ejecutivo

**El 70% de la infraestructura que pide el motor YA EXISTE** y está probada en producción. Lo que falta es, sobre todo:

1. **Un formulario de evaluación de verdad** (hoy el "onboarding" recoge 5 datos: peso, altura, edad, 1 nivel, 1 objetivo).
2. **Un motor de reglas + generador** que use ese perfil (hoy: `buildRoutine()` — 16 ejercicios hardcodeados, filtrados por palabra clave contra el equipo del gym).
3. **Relación real equipo↔ejercicio** (hoy `exercises.equipment_name` es texto libre, no está vinculado a la tabla `equipment`).
4. **Progresión basada en rendimiento** (hoy se registra peso/reps por serie, pero nada los lee para ajustar la rutina; no hay RIR/RPE).
5. **Metadatos de ejercicio para sustituciones** (patrón de movimiento, músculos secundarios, alternativas, incompatibilidades, activo/inactivo).

**Nada de lo que hay que agregar es destructivo.** Todo son tablas nuevas, columnas nuevas (`add column if not exists`), o un valor nuevo de enum. Las rutinas "de entrenador" y "personalizada", el modo entrenamiento, las medidas, los récords y los logros se **reutilizan tal cual**.

---

## 1. Arquitectura encontrada

### 1.1 Frontend

- **SPA vanilla JS, sin build step, sin framework.** Módulos ES cargados directo por el navegador (`<script type="module" src="src/router.js">`).
- **Punto de entrada:** `src/router.js` — `SCREENS` (mapa `screen → viewFn`), `render()` (reemplaza `#app` innerHTML entero en cada `setState()`), y wiring de eventos por delegación (`data-a` = acción, `data-v` = argumento, `data-f` = binding a un path de `state`).
- **Estado:** `src/state.js` — un objeto `state` global + `setState(patch)` que hace `Object.assign` y llama `render()`.
- **Acciones:** `src/actions.js` (1991 líneas) — objeto `ACTIONS`, más los `enterXDash()`/`resumeXSession()` que cargan datos y entran a cada panel.
- **Pantallas:** `src/screens/{auth,owner,admin,client,trainer,library,programs,platform}.js` — cada `viewX()` devuelve un string HTML. Sin componentes tipados; helpers compartidos en `src/helpers.js` y `src/data.js`.
- **Datos:** TODO pasa por `window.BolaAPI`. `supabase-client.js` (real) y `mock-client.js` (en memoria, para `test-harness.html`) implementan la MISMA interfaz. **Regla dura del proyecto: mantener paridad real/mock en cada cambio.**
- **Re-render:** full-DOM en cada `setState()`. `router.js` ya preserva foco de input y (desde el fix reciente) posición de scroll.

### 1.2 Backend

- **Supabase**: Postgres + Auth + Storage + RLS. `app_role()`, `app_gym_id()`, `app_role_is_staff()` (admin ∪ owner), `is_client_trainer(client_id)` son los helpers de RLS.
- **Multi-tenant por `gym_id`** en casi toda tabla; cada política se ancla a `app_gym_id()`.
- **La seguridad NUNCA vive en el frontend.** Toda escritura sensible es un RPC `security definer` con el chequeo de rol repetido adentro de la función SQL. Los catálogos que solo administra el staff (ejercicios, clases, equipo, planes) usan RLS directo con `app_role_is_staff()`.
- **Migraciones**: archivos timestamped, secuenciales, **nunca se editan después de crearse**. Un `alter type ... add value` va en su propio archivo (restricción de Postgres).

### 1.3 Roles

| Rol | Puede (relevante al motor) |
|---|---|
| `client` | Ve su rutina (IA / entrenador / personalizada), la ejecuta, registra series. Arma su propia rutina "personalizada". Edita su perfil físico (peso/altura/edad/nivel/objetivo/plan). |
| `trainer` | Ve solo sus clientes asignados (`client_profiles.trainer_user_id = auth.uid()`). Arma/edita la rutina "trainer" del cliente. Aplica un programa entero. Ve progreso (fotos, medidas, récords). |
| `admin` / `owner` | Administra el catálogo del gimnasio: ejercicios propios, equipo, planes, clases. `owner` además aprueba admins. |

### 1.4 Offline / PWA

- `src/offline.js`: cola de escrituras fallidas por red (`queueAction`/`flushQueue`) + snapshots de lecturas (`saveSnapshot`/`loadSnapshot`).
- El modo entrenamiento ya usa la cola: crea la sesión con un UUID elegido en el cliente y encola `logSet`/`finish` en orden.
- **Implicación para el motor:** la generación de rutina debe correr en el cliente (JS determinista), no en un RPC — así funciona sin señal (coincide con §29 del pedido).

---

## 2. Tablas existentes relevantes

### 2.1 Se reutilizan tal cual

| Tabla | Forma | Uso actual | Uso en el motor |
|---|---|---|---|
| `client_profiles` | `user_id` PK, `gym_id`, `plan_id`, `trainer_user_id`, `face_photo_key`, `weight`, `height`, `age`, `level` (enum `experience_level`), `goal` (enum `training_goal`), `membership_*` | Perfil del cliente | Datos físicos base. **El motor NO toca `membership_*` ni `plan_id`.** |
| `routines` | `id`, `client_user_id`, `source` (enum: `ia`/`trainer`/`personal`), `goal`, `author_user_id` | 1 rutina IA por cliente+goal · 1 trainer por cliente · 1 personal por cliente | El motor escribe en `source='ia'` (o un valor nuevo, ver §5). |
| `routine_exercises` | `id`, `routine_id`, `position`, `text`, `exercise_id` (FK), `sets`, `reps` (texto), `weight_kg`, `rest_seconds`, `day_label`, `day_of_week` (0-6) | Ejercicios de una rutina, ya estructurados y con soporte semanal | El generador escribe filas acá. **Ya soporta rutina multi-día.** |
| `workout_sessions` | `id`, `client_user_id`, `gym_id`, `source`, `started_at`, `finished_at` | Sesión de entrenamiento real | Registro de entrenamiento — se reutiliza el flujo entero de `viewWorkout`. |
| `exercise_logs` | `id`, `workout_session_id`, `client_user_id`, `exercise_name` (texto), `set_number`, `reps`, `weight_kg` | Cada serie marcada en el modo entrenamiento | Fuente del análisis de rendimiento. **Falta RIR/RPE — ver §5.** |
| `body_measurements` | `client_user_id`+`taken_at` unique, `weight_kg`, `body_fat_pct`, `waist_cm`, `chest_cm`, `arm_cm`, `thigh_cm` | Serie histórica de medidas (tab Progreso) | Composición corporal. **Falta `hip_cm` (cadera) — ver §5.** |
| `exercises` | `id`, `gym_id` (null = catálogo global), `name`, `muscle_group`, `equipment_name` (**texto libre**), `media_key`, `description`, `level`, `goal`, `kind`, `suggested_sets/reps/rest_seconds`, `muscle_worked`, `purpose`, `best_practices[]`, `common_mistakes[]`, `diagram_pattern` | Biblioteca de 90 ejercicios reales | **Base del motor.** Le faltan varios campos (ver §5). |
| `program_templates` + `program_template_items` | 10 programas; P01-P05 con día a día (97 asignaciones), P06-P10 vacíos | Catálogo de solo lectura; el entrenador puede "aplicar" uno | El motor puede usar los programas como **estructura de referencia** (Full Body / Upper-Lower / PPL). |
| `equipment` | `id`, `gym_id`, `name`, `photo_key` | Lista de máquinas del gym (el dueño/admin la administra, con foto) | **Punto de partida de "GYM EQUIPMENT".** Le falta `is_active` y la relación con ejercicios (ver §5). |
| `achievements` (1003) + `client_achievements` | `evaluate_achievements()` calcula 12 métricas por cliente de una pasada: `workouts`, `total_volume_kg`, `exercise_max_weight` (jsonb por ejercicio), `exercise_sessions`, `exercise_variety`, `personal_records`, mediciones… | Logros / medallas | **Regalo:** la lógica de volumen total, variedad de ejercicios y peso máximo por ejercicio YA está calculada server-side. El motor de progresión puede apoyarse en esto. |
| `get_personal_records(client_id)` RPC | Devuelve `{exercise_name, max_weight_kg, achieved_at}` — el peso máximo por nombre de ejercicio | Tab Progreso, detalle de cliente del entrenador | Señal directa de progresión. |

### 2.2 Enums existentes (append-only)

- `experience_level`: `principiante`, `intermedio`, `avanzado`
- `training_goal`: `perder_peso`, `ganar_musculo`, `resistencia`, `tonificar`  ← **el motor quiere 9 objetivos**
- `routine_source`: `ia`, `trainer`, `personal`

---

## 3. Lo que ya existe del "motor" (y sus límites)

### 3.1 Generador actual: `buildRoutine()` en `src/helpers.js`

```js
export function buildRoutine(goal, equipmentNames) {
  const lib = EXERCISE_LIB[goal] || [];          // 4 ejercicios hardcodeados por goal (data.js)
  const eqLower = equipmentNames.map(e => e.toLowerCase());
  const matched = lib.filter(ex => ex.kw === null || eqLower.some(e => e.includes(ex.kw)));
  return (matched.length ? matched : lib).map(...);  // fallback: si nada matchea, devuelve todo igual
}
```

- **`EXERCISE_LIB`** (`src/data.js`): 16 entradas totales (4 goals × 4), con `text`, `kw` (palabra clave de equipo), `sets`, `reps` (texto), `restSeconds`. **No usa la tabla `exercises` de 90 ejercicios.**
- **Acción `generateRoutine`** (`src/actions.js:724`): llama `buildRoutine(state.aiGoal, state.equipment.map(e => e.name))` → `BolaAPI.routines.generateAi()` → borra e inserta `routine_exercises` de la rutina `source='ia'`.
- **UI:** `viewClientRutina()` (`src/screens/client.js:485`), pestaña "Con IA": chips de meta + botón "**Generar rutina con IA**" + lista resultante.
  - **← ESTE es el punto exacto donde el pedido quiere insertar el Training Engine.**

### 3.2 Modo entrenamiento (se reutiliza entero)

- `startWorkout(source)` → `exercisesForToday()` filtra por `day_of_week` si la rutina es semanal → abre `workout_sessions` (con UUID cliente, resiliente a offline) → pantalla `viewWorkout`.
- Por ejercicio: campo peso + campo reps, checkboxes por serie, timer de descanso (usa `rest_seconds` de la rutina, ya no 60 fijo), `logSet` por serie marcada.
- `finishWorkout` → `finish_workout_session()` RPC → `evaluate_achievements()`.
- **Falta:** capturar RIR/RPE por serie; no hay "análisis" post-sesión más allá de recalcular récords/logros.

### 3.3 Rutina del entrenador y "personalizada" (NO se tocan)

- Entrenador: `viewTrainerClientes()` detalle → form ejercicio-por-ejercicio (selector de biblioteca + sets/reps/peso/descanso/día) o "aplicar programa".
- Cliente: pestaña "Personalizada", mismo form.
- **RLS clave:** `routine_exercises` política `"write exercises via owned routine"` → un **entrenador puede editar los ejercicios de CUALQUIER rutina de su cliente asignado** (incluida la `ia`/motor), aunque solo puede *crear* la fila `routines` de tipo `trainer`. Esto habilita "la IA propone, el entrenador modifica" (§25) casi sin trabajo nuevo de permisos.

---

## 4. Funcionalidades reutilizables (no duplicar)

| Necesidad del pedido | Ya existe como | Reutilizar |
|---|---|---|
| Registro de entrenamiento (peso/reps/series) | `workout_sessions` + `exercise_logs` + `viewWorkout` | Sí, entero. Solo agregar RIR/RPE. |
| Historial / récords | `get_personal_records()` + tab Progreso + detalle de cliente del entrenador | Sí |
| Composición corporal | `body_measurements` + `measurementForm()` (compartido Progreso/Editar perfil) | Sí, +`hip_cm` |
| Biblioteca de ejercicios estructurada | `exercises` (90) + `viewExerciseLibrary` + `src/diagrams.js` (21 patrones, 2 etapas) | Sí |
| "Fotos/vídeo del ejercicio" | Ilustraciones esquemáticas por `diagram_pattern` (política del proyecto: nunca inventar fotos reales) | Sí — el motor muestra el diagrama del ejercicio |
| Estructura multi-día de rutina | `routine_exercises.day_label` + `day_of_week` + `exercisesForToday()` | Sí |
| Programas Full Body / Upper-Lower / PPL | `program_templates` (P01-P05 con contenido) | Sí, como referencia de estructura |
| Entrenador revisa/edita la rutina generada | RLS `"write exercises via owned routine"` + form del detalle de cliente | Sí |
| Admin administra máquinas con foto | Editor de equipo en Configuración (`equipmentEditor()` en `owner.js`) | Sí, se extiende |
| Admin agrega ejercicios propios | Sección staff de `viewExerciseLibrary` | Sí, se extiende |
| Generación offline, sin IA externa | `buildRoutine()` ya es JS cliente determinista | Sí — se reemplaza el algoritmo, no el lugar |
| Perfil de entrenamiento persistente | *(no existe)* | Nuevo — `training_profiles` |
| Volumen semanal / solapamiento muscular | *(no existe en generación)* — pero `evaluate_achievements` ya sabe sumar volumen | Motor nuevo, se apoya en datos ya calculados |

---

## 5. Posibles conflictos y cómo se resuelven

| Conflicto | Detalle | Resolución propuesta (no destructiva) |
|---|---|---|
| **`training_goal` tiene 4 valores, el motor quiere 9** | Enum append-only; no se puede usar un valor nuevo en la misma transacción que lo agrega | **NO tocar el enum.** Guardar `primary_goal`/`secondary_goal` como `text` en la tabla nueva `training_profiles`. `client_profiles.goal` queda como está (lo usa el resto de la app); el motor deriva de él si el perfil nuevo no existe. |
| **`experience_level` tiene 3 valores, el motor quiere 6 buckets de tiempo + 3 de comodidad** | Ídem | `training_profiles` guarda `training_time_bucket` y `machine_comfort` como `text`; el motor **deriva** el `level` (principiante/intermedio/avanzado) de ambos y lo sincroniza a `client_profiles.level` (que ya tiene setter). |
| **`exercises.equipment_name` es texto libre, no FK a `equipment`** | El motor necesita "solo ejercicios cuyo equipo tiene el gym" | Tabla puente nueva `exercise_equipment` (exercise_id ↔ equipment_concept) + `equipment` gana `concept` (texto normalizado). El admin mapea "mi máquina X" → concepto. Fallback mientras no esté mapeado: match difuso por nombre (lo que se hace hoy en `buildRoutine` con `kw`). |
| **`exercise_logs` no tiene RIR/RPE** | El motor de progresión lo necesita | `add column rir smallint`, `add column rpe numeric(3,1)` — nullable, no rompe nada. El modo entrenamiento suma un campo opcional. |
| **`body_measurements` no tiene cadera** | Pedido §5 la lista | `add column hip_cm numeric(5,1)` nullable. `measurementForm()` suma el campo. |
| **La rutina "IA" se sobrescribe entera en cada `generateAi()`** | Si el entrenador editó la rutina del motor, regenerar la borra | El motor escribe en un `source` propio (`routine_source` gana `'engine'`, en su archivo de migración aparte) **o** se agrega un flag `routines.locked_by_trainer`. Propuesta: `source='engine'`, y "Adoptar como rutina de entrenador" copia a `source='trainer'` para que el entrenador la tome. |
| **`mock-client.js` debe mantener paridad** | Regla del proyecto | Cada RPC/tabla nueva se implementa igual en el mock. El motor (JS puro) corre idéntico contra ambos. |
| **`routines` no tiene política UPDATE** | `updated_at` nunca se bumpea (bug preexistente menor) | Se puede agregar de paso una política UPDATE para self/trainer; no bloquea nada. |
| **Somatotipo** | El pedido pide no usarlo como criterio rígido (§12, §30) | `training_profiles.somatotype` como `text` puramente descriptivo; el motor **no lo usa** para decidir ejercicios ni cargas. |
| **Diagnóstico de lesiones** | Prohibido (§11, §31) | Las lesiones/dolores son **restricciones conservadoras**: el motor excluye patrones de movimiento marcados como riesgosos para esa articulación y muestra el disclaimer fijo. Nunca afirma que algo "es seguro" ni "cura". |
| **`app.js` en la raíz** | Archivo viejo, la app real está en `src/` | No se toca. El motor va en `src/training-engine/`. |

---

## 6. Estructura del contenido de ejercicio: qué hay vs. qué pide §13

| Campo pedido | Estado |
|---|---|
| id, nombre, descripción, músculo principal, equipamiento, nivel, tipo | ✅ `exercises` |
| instrucciones / buenas prácticas / errores comunes | ✅ `best_practices[]`, `common_mistakes[]`, `purpose`, `muscle_worked` |
| imagen / vídeo | ⚠️ `media_key` existe pero vacío a propósito; hay `diagram_pattern` (ilustración esquemática) — el proyecto **no usa fotos reales que no tiene** |
| patrón de movimiento | ⚠️ parcial: `diagram_pattern` (21 patrones) sirve como proxy; conviene un `movement_pattern` explícito (empuje horizontal/vertical, tracción, dominante de rodilla/cadera, core, etc.) |
| músculos secundarios | ❌ nuevo (`secondary_muscles text[]`) |
| unilateral/bilateral | ⚠️ a veces está en `kind` ("Unilateral"); conviene `is_unilateral boolean` |
| progresiones / regresiones | ❌ nuevo (`progression_of` / lista) — puede quedar para una fase posterior |
| alternativas / incompatibilidades | ❌ nuevo (`alternatives uuid[]` o se derivan por músculo+patrón; `contraindicated_for text[]` = articulaciones) |
| activo/inactivo | ❌ nuevo (`is_active boolean default true`) |
| posición inicial / ejecución / respiración | ⚠️ `best_practices` cubre parte; se puede estructurar más adelante |

**Nota:** varias de estas se pueden **derivar** en vez de guardar (p. ej. "alternativas de X" = otros ejercicios con mismo `muscle_group` + `movement_pattern` + `level` ≤). Eso reduce el trabajo de carga de datos.

---

## 7. Propuesta de integración (arquitectura)

### 7.1 Módulos nuevos (todo cliente, determinista, offline-friendly)

```
src/training-engine/
  profile-questions.js   -- definición declarativa del formulario + textos de ayuda por pregunta
  training-profile.js    -- leer/guardar training_profiles vía BolaAPI; derivar level/goal
  exercise-filter.js     -- filtra exercises por: equipo del gym, nivel, objetivo, preferencias,
                            músculos prioritarios, restricciones, excluidos
  rules.js               -- MOTOR DE REGLAS: dado (objetivo, nivel, días, minutos) -> estructura
                            (Full Body / Upper-Lower / PPL / ...), volumen objetivo por grupo,
                            rango de reps, descanso, RIR objetivo
  generator.js           -- toma estructura + pool filtrado -> distribuye ejercicios por día,
                            controla solapamiento muscular y tiempo total de sesión
  substitution.js        -- reemplaza un ejercicio conservando músculo+patrón+nivel+estímulo
  progression.js         -- analiza exercise_logs recientes (reps/peso/RIR) -> sube/mantiene/baja
                            carga o volumen para la próxima sesión
  engine.js              -- orquestador: perfil -> rules -> filter -> generator -> escribe routine
```

- `ACTIONS.generateRoutine` (el botón "Generar rutina con IA") pasa a llamar `engine.generate()` en vez de `buildRoutine()`.
- El resultado se guarda en `routine_exercises` (source `engine`), con `day_label`/`day_of_week` para rutina semanal — **la UI de rutina y el modo entrenamiento ya saben mostrarlo**.

### 7.2 Base de datos nueva (borrador — se detalla en Fase 3)

| Tabla / columna | Tipo | Notas |
|---|---|---|
| `training_profiles` | tabla nueva, PK `user_id` (1:1 client) | sexo, `training_time_bucket`, `machine_comfort`, `primary_goal`, `secondary_goal`, `days_per_week`, `session_minutes`, `preferred_style`, `priority_muscles text[]`, `somatotype`, `evaluated_at`, `updated_at` |
| `client_exercise_preferences` | tabla nueva | `client_user_id`, `exercise_id` o `exercise_name`, `kind` (`excluded` / `disliked`) |
| `client_limitations` | tabla nueva | `client_user_id`, `joint` (hombro/codo/muñeca/espalda/cadera/rodilla/tobillo/otra), `note`, `painful_movement bool` |
| `exercises.+` | columnas | `secondary_muscles text[]`, `movement_pattern text`, `is_unilateral bool`, `is_active bool default true`, `contraindicated_joints text[]` |
| `equipment.+` | columnas | `is_active bool default true`, `concept text` (concepto normalizado para mapear a ejercicios) |
| `exercise_equipment` | tabla puente nueva | `exercise_id`, `equipment_concept` — qué equipo requiere cada ejercicio |
| `exercise_logs.+` | columnas | `rir smallint`, `rpe numeric(3,1)` |
| `body_measurements.+` | columna | `hip_cm numeric(5,1)` |
| `routine_source` | valor nuevo `'engine'` | archivo de migración aparte (restricción Postgres) |
| `training_rules` | *(opcional)* tabla nueva | si se quiere que el admin edite reglas sin deploy; MVP puede tenerlas en `rules.js` |

Todas con RLS siguiendo los patrones existentes:
- `training_profiles` / `client_*`: self read/write + `is_client_trainer()` read (y write para el entrenador, a decidir).
- `exercises.+` / `equipment.+` / `exercise_equipment`: lectura para miembros del gym, escritura `app_role_is_staff()`.

### 7.3 UI nueva / modificada (mantiene la identidad visual actual)

| Pantalla | Cambio |
|---|---|
| **Onboarding cliente** (`viewClientReg2`) | Se amplía a la evaluación completa (o se agrega un paso opcional "evaluación detallada" post-registro). Cada pregunta con su texto de ayuda/tooltip usando el sistema visual actual. |
| **Editar perfil** (`viewClientEditProfile`) | Suma la sección de evaluación (ya edita peso/medidas/plan). |
| **Rutina → "Con IA"** (`viewClientRutina`) | El botón pasa a "Generar mi rutina" y corre el motor. Muestra estructura (Día 1/2/3…), calentamiento, ejercicios con series/reps/descanso/RIR, y por qué se eligió cada uno. |
| **Modo entrenamiento** (`viewWorkout`) | Campo RIR/RPE opcional por serie. Al terminar, resumen + "la próxima subimos X" cuando la progresión lo indique. |
| **Detalle de cliente (entrenador)** (`viewTrainerClientes`) | Ve el perfil de evaluación + la rutina generada + puede editarla (ya puede vía RLS) o "adoptarla como rutina de entrenador". |
| **Configuración (admin/dueño)** | El editor de equipo suma activo/inactivo + "asignar ejercicios". La biblioteca suma activo/inactivo por ejercicio + los campos nuevos. |
| **Biblioteca de ejercicios** | Sin cambios grandes; el motor la consume. |

---

## 8. Cómo se evita romper lo existente

1. **Cero `DROP`, cero cambio de forma en tablas usadas por el frontend.** Todo es `add column if not exists`, tablas nuevas, o `add value` de enum en archivo propio.
2. **La rutina de entrenador y la personalizada no se tocan** — el motor solo reemplaza el algoritmo detrás del botón "Generar con IA".
3. **`buildRoutine()`/`EXERCISE_LIB` quedan como fallback** hasta que el motor esté probado; se borran recién al final.
4. **Paridad `supabase-client.js` ↔ `mock-client.js`** en cada paso; el motor (JS puro) se testea contra el mock sin backend real.
5. **Migraciones se aplican a producción solo cuando lo pidas explícitamente**, con verificación en vivo antes/después (patrón de todas las sesiones anteriores).
6. **El motor corre en el cliente** → funciona offline, no depende de ninguna API externa (§29, §34).
7. **Nada de diagnóstico médico** — lesiones = restricciones conservadoras + disclaimer.

---

## 9. Plan por fases (propuesta)

Cada fase = 1 o más PRs chicos, probados en `test-harness.html`, mergeados, y (si tocan DB) migración aplicada a producción con tu OK.

| Fase | Entrega | DB | Riesgo |
|---|---|---|---|
| **1** | Este documento | — | — |
| **2** | `training_profiles` + `client_exercise_preferences` + `client_limitations` (tablas, RLS, API real+mock) | migración | bajo (todo nuevo) |
| **3** | Formulario de evaluación (onboarding ampliado + sección en Editar perfil) que llena esas tablas | — | bajo |
| **4** | Columnas nuevas en `exercises` + `equipment` + `exercise_equipment` + `exercise_logs.rir/rpe` + `body_measurements.hip_cm` + seed de metadatos para los 90 ejercicios globales | migración grande | medio (mucho dato, pero aditivo) |
| **5** | Admin: gestión de máquinas (activo/inactivo, asignar ejercicios, instrucciones) + biblioteca (activo/inactivo, campos nuevos) | — | bajo |
| **6** | `exercise-filter.js` + `rules.js` (motor de reglas) + tests de los 14 escenarios del pedido §32 | — | medio |
| **7** | `generator.js` + `substitution.js` — genera la rutina real y la escribe en `routine_exercises` (`source='engine'`) | migración (`add value 'engine'`) | medio |
| **8** | Reemplazar el botón "Generar con IA" por el motor; UI de rutina generada (estructura, calentamiento, RIR) | — | medio |
| **9** | RIR/RPE en el modo entrenamiento + `progression.js` (análisis de rendimiento) | — | medio |
| **10** | Rutina dinámica: la próxima sesión/semana se adapta según `progression.js` | — | alto (es lo más delicado) |
| **11** | Entrenador: ver perfil + rutina generada, editar, "adoptar como rutina de entrenador" | quizá política UPDATE en `routines` | bajo |
| **12** | Batería de tests completa (§32) + `TRAINING_ENGINE.md` (documentación) | — | — |
| **13-14** | Repaso UX/UI + optimización | — | — |

**Estimación honesta:** son ~10-12 PRs reales. No entra en una sesión. La Fase 2+3 ya te da el formulario de evaluación funcionando y guardando datos; la Fase 6-8 es el motor generando de verdad.

---

## 10. Decisiones que necesito de vos antes de la Fase 2

1. **Formulario de evaluación:** ¿va en el onboarding (todos los clientes nuevos lo hacen) o como paso opcional "evaluación detallada" que el cliente inicia desde Rutina/Perfil? (Recomiendo: opcional al principio, para no alargar el registro; el motor usa defaults derivados del perfil básico si no está.)
2. **`source` de la rutina del motor:** ¿`'engine'` nuevo (más limpio, migración de enum aparte) o reusar `'ia'` (cero migración de enum)? (Recomiendo `'engine'`.)
3. **Metadatos de los 90 ejercicios (Fase 4):** los completo yo con criterio de entrenamiento estándar (patrón de movimiento, músculos secundarios, articulaciones a cuidar) y vos revisás, ¿o tenés una planilla como la `Fight_Club_Gym_Base_Datos_Entrenamiento.xlsx` con esos datos?
4. **Equipo real de Fight Club:** ¿la lista actual de `equipment` del gimnasio en producción ya es la real y completa, o hay que armar primero el mapa máquina→concepto→ejercicios con datos reales?
5. **¿El entrenador puede editar el perfil de evaluación del cliente**, o solo verlo?

---

## 11. Archivos que se tocarán (referencia)

**Nuevos:** `src/training-engine/*.js`, `src/screens/evaluation.js` (o ampliar `client.js`), `supabase/migrations/2026091700000*_training_engine_*.sql` (varias), `docs/TRAINING_ENGINE.md`.

**Modificados:** `src/actions.js` (acción `generateRoutine`, acciones de perfil/evaluación, RIR en workout), `src/screens/client.js` (`viewClientRutina`, `viewWorkout`, `viewClientEditProfile`, onboarding), `src/screens/trainer.js` (detalle de cliente), `src/screens/library.js` + `src/screens/owner.js` (gestión de máquinas/ejercicios), `src/state.js` (estado del formulario y del motor), `src/router.js` (pantalla de evaluación si es aparte), `supabase-client.js` + `mock-client.js` (API nueva, en paridad), `src/data.js` (retirar `EXERCISE_LIB` al final).

**No se tocan:** `app.js`, `sw.js`, `config.js`, `capacitor.config.json`, toda la lógica de auth/pagos/check-in/clases/logros/mensajes.
