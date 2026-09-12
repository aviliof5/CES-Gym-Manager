/* Bolá — ACTIONS (todo lo que dispara data-a en el HTML generado) + los
   helpers de "entrada a pantalla" que juntan datos antes de cambiar
   state.screen, + el wiring del <input type="file"> oculto que usan las
   fotos. Movido 1:1 desde app.js (Fase 3, ver docs/MIGRATION_PLAN.md).
   `BolaAPI` y `window.CesAds` siguen siendo globals de window, como antes —
   no se import-ean porque supabase-client.js/mock-client.js/ads.js siguen
   siendo <script> clásicos, no módulos (ver docs/MIGRATION_PLAN.md, regla
   29: no se toca BolaAPI en esta fase). */
'use strict';

import { state, setState } from './state.js';
import { friendlyError, splitPhone, enrichClient, buildRoutine, formatDate, money, exercisesForToday } from './helpers.js';
import { DURATION_LABELS, WEEKDAY_NAMES, EVAL_TOTAL_STEPS, deriveLevel, mapGoalToEnum, inferEquipmentConcepts } from './data.js';
import { render, OWNER_INVITE_KEY, GYM_INVITE_KEY } from './router.js';
import { newUuid, isNetworkError, queueAction, getQueueSize, flushQueue, saveSnapshot, loadSnapshot } from './offline.js';
import { generateFullRoutine, buildPlanSpec, filterExercises, analyzeRoutine, adaptRoutineAfterSession } from './training-engine/index.js';

// Conceptos de equipamiento que ofrece el gimnasio HOY: unión de
// equipment.concepts sobre las máquinas ACTIVAS (más 'peso_corporal', que el
// motor da por sentado). Es lo que el filtro de ejercicios cruza con
// exercises.required_equipment. Ver src/training-engine/exercise-filter.js.
function activeGymConcepts() {
  const set = new Set(['peso_corporal']);
  for (const e of state.equipment || []) {
    if (e.isActive === false) continue;
    for (const c of e.concepts || []) set.add(c);
  }
  return [...set];
}

// La "estructura" de la rutina del motor (split, calentamiento, RIR objetivo,
// series/semana por grupo, y qué quedó afuera por falta de equipo) —
// determinista, se puede reconstruir del perfil guardado sin volver a
// generar la rutina. La usa enterClientHome() para que la tarjeta "Cómo está
// armada" siga apareciendo tras recargar la app, no solo al recién generar.
// `p` es un shapeTrainingProfile(). `library`/`gymConcepts` se pasan
// explícitos porque enterClientHome() los tiene como locals antes de
// volcarlos a state. `excludedIds`/`limitations` ya cargados.
function computeEnginePlan(p, { library = [], gymConcepts = [], excludedIds = [], limitations = [] } = {}) {
  if (!p || !p.primaryGoal) return null;
  const engineProfile = {
    level: deriveLevel(p.trainingTimeBucket, p.machineComfort),
    primaryGoal: p.primaryGoal,
    secondaryGoal: p.secondaryGoal || null,
    daysPerWeek: p.daysPerWeek || 3,
    sessionMinutes: p.sessionMinutes || 60,
    preferredStyle: p.preferredStyle || 'indiferente',
    priorityMuscles: p.priorityMuscles || [],
  };
  const filtered = filterExercises({
    library, gymConcepts,
    profile: engineProfile,
    excludedIds, limitations,
  });
  const spec = buildPlanSpec(engineProfile, {
    hasCardioMachine: filtered.hasCardioMachine,
    hasMobility: filtered.hasMobility,
  });
  return { ...spec, rejected: filtered.rejected };
}

// El perfil "de motor" (nivel derivado, objetivo de 9 valores, etc.) a
// partir del training_profile guardado. null si no completó la evaluación.
function engineProfileFrom(p) {
  if (!p || !p.primaryGoal) return null;
  return {
    level: deriveLevel(p.trainingTimeBucket, p.machineComfort),
    primaryGoal: p.primaryGoal,
    secondaryGoal: p.secondaryGoal || null,
    daysPerWeek: p.daysPerWeek || 3,
    sessionMinutes: p.sessionMinutes || 60,
    preferredStyle: p.preferredStyle || 'indiferente',
    priorityMuscles: p.priorityMuscles || [],
  };
}

/* Fase 10 — rutina dinámica. Se llama al TERMINAR un entrenamiento con la
   rutina del motor ('ia'): mira lo que el cliente movió y ajusta la rutina
   para la próxima (sube/baja pesos objetivo, rota ejercicios estancados).
   Best-effort: si algo falla, la rutina queda como estaba y se reintenta la
   próxima sesión. Devuelve { summary:[str], updatedRoutine } o null. */
async function adaptRoutineNow(w) {
  if (!w || w.source !== 'ia') return null;
  try {
    const clientId = state.myClient.id;
    const since = new Date(Date.now() - 120 * 86400000).toISOString();
    const [logs, aiRoutine] = await Promise.all([
      BolaAPI.workouts.recentLogs(clientId, since),
      BolaAPI.routines.getAi(clientId, state.aiGoal),
    ]);
    const rows = (aiRoutine.exercises || []);
    if (!rows.length) return null;

    // Pool para las rotaciones (solo si completó la evaluación).
    let pool = [];
    const ep = engineProfileFrom(state.myTrainingProfile);
    if (ep) {
      try {
        const [excl, lims] = await Promise.all([
          BolaAPI.trainingProfile.listExcludedExercises(clientId),
          BolaAPI.trainingProfile.listLimitations(clientId),
        ]);
        pool = filterExercises({
          library: state.exercisesLib || [], gymConcepts: activeGymConcepts(),
          profile: ep, excludedIds: excl.map(x => x.exerciseId).filter(Boolean), limitations: lims,
        }).pool;
      } catch (_) { pool = []; }
    }

    const trainedNames = new Set((w.exercises || []).map(cleanExName));
    const rirTarget = (state.enginePlan && state.enginePlan.rirTarget) || exRirTarget(w.exercises[0] || {});
    const { weightUpdates, swaps, summary } = adaptRoutineAfterSession({
      routineExercises: rows, cleanName: cleanName,
      allLogs: logs, trainedNames, pool, rirTarget,
    });

    // Traduce los swaps a updates de fila — mismo formato de `text` que el
    // generador (nombre + marca de precaución, sin RIR — ver Fase 13).
    const swapUpdates = swaps.map(s => {
      const caution = s.to.caution ? ` · ⚠ cuidá ${(s.to.cautionJoints || []).join(' / ')}` : '';
      return { id: s.id, text: `${s.to.name}${caution}`, exerciseId: s.to.id || null, weightKg: null };
    });
    const allUpdates = [...weightUpdates, ...swapUpdates];
    if (!allUpdates.length) return { summary: [], updatedRoutine: aiRoutine };

    await BolaAPI.routines.updateExercises(allUpdates);
    // Ya se escribieron los cambios: si el refetch falla, igual mostramos el
    // resumen (la rutina se ve actualizada al recargar).
    const updatedRoutine = await BolaAPI.routines.getAi(clientId, state.aiGoal).catch(() => aiRoutine);
    return { summary, updatedRoutine };
  } catch (_) {
    return null; // nunca romper el "entrenamiento completado" por esto
  }
}

// Handle del setInterval del descanso entre series — módulo-scoped porque
// no es parte del estado serializable, solo un recurso a limpiar (ver
// ACTIONS.startRest/skipRest/nextExercise/exitWorkout, todos pasan por acá
// antes de tocar state.workout para nunca dejar dos timers corriendo).
let restTimerId = null;
function clearRestTimer() {
  if (restTimerId) { clearInterval(restTimerId); restTimerId = null; }
}

// Presencia en el gym (ver src/screens/presence.js) — contador de 2 horas
// del cliente. A diferencia del descanso entre series de arriba, acá no
// hace falta precisión al segundo (se muestra en horas/minutos), así que
// tiquetea cada 30s en vez de cada 1s — mismo patrón, intervalo más largo
// porque la escala de tiempo es mucho mayor. Puramente cosmético: la
// autoridad real es gym_sessions.expires_at + sync_gym_sessions() del
// servidor (no hay cron en este proyecto, ver esa migración) — al llegar a
// 0 acá simplemente se vuelve a pedir la propia sesión, que es cuando de
// verdad se marca vencida y dispara el aviso.
let gymSessionTimerId = null;
function clearGymSessionTimer() {
  if (gymSessionTimerId) { clearInterval(gymSessionTimerId); gymSessionTimerId = null; }
}
function startGymSessionCountdown(expiresAtIso) {
  clearGymSessionTimer();
  const tick = () => {
    const secondsLeft = Math.max(0, Math.round((new Date(expiresAtIso).getTime() - Date.now()) / 1000));
    setState({ myGymSessionSecondsLeft: secondsLeft });
    if (secondsLeft <= 0) { clearGymSessionTimer(); refreshMyGymSession(); }
  };
  tick();
  gymSessionTimerId = setInterval(tick, 30000);
}

// Canales de Realtime (o su equivalente en el mock) abiertos para la
// sesión actual — mismo patrón que restTimerId: recursos vivos, no estado
// serializable. `sessionRealtimeUnsubs` son los que duran todo el panel
// (Inicio del cliente, panel de dueño/admin) — se abren al entrar y se
// cierran en signOut o al volver a entrar (nunca dos corriendo a la vez).
// `chatUnsub` es aparte porque un chat se abre y se cierra sueltas veces
// dentro de la misma sesión, sin tocar los de arriba.
let sessionRealtimeUnsubs = [];
function stopSessionRealtime() {
  sessionRealtimeUnsubs.forEach(fn => { try { fn(); } catch (_) { /* un canal roto no debe tumbar al resto */ } });
  sessionRealtimeUnsubs = [];
}
function watchRealtime(table, filter, onChange) {
  sessionRealtimeUnsubs.push(BolaAPI.realtime.subscribe(table, filter, onChange));
}

let chatUnsub = null;
function stopWatchingChat() {
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
}
function watchChat(conversationId, onChange) {
  stopWatchingChat();
  chatUnsub = BolaAPI.realtime.subscribe('messages', `conversation_id=eq.${conversationId}`, onChange);
}

// ---- refetch handlers: uno por feed, para que el botón manual que ya
// existía (si lo hay) y el canal de Realtime llamen exactamente al mismo
// código — nunca dos versiones de "cómo se refresca esto" por separado. ----

// Pago propio (cobro pendiente + membership_status/expires_at) — lo
// dispara tanto "¿Ya te confirmaron? Actualizar" (a mano) como los canales
// de `payments` y `client_profiles` del propio cliente (pagos y
// suspensión son dos motivos distintos por los que esto puede cambiar).
async function refreshMyPaymentState() {
  if (!state.myClient) return; // ya cerró sesión o cambió de pantalla
  const pendingPayment = await BolaAPI.payments.getPendingForClient(state.myClient.id);
  const [client] = await attachFaceUrls([await BolaAPI.clients.getSelf(state.myProfile.id)]);
  setState({ pendingPayment, myClient: client });
}

// Notificaciones propias del cliente (dueño/admin creó un evento).
async function refreshMyNotifications() {
  if (!state.myClient) return;
  const notifications = await BolaAPI.notifications.listForClient(state.myClient.id);
  setState({ notifications });
}

// Calendario del cliente (clase/sesión nueva, o alguien más reservó o
// canceló) — tab Reservas y "Próxima clase" en Inicio.
async function refreshMyClasses() {
  if (!state.myClient || !state.gym) return;
  const [classesForGym, classSessions, myBookings] = await Promise.all([
    BolaAPI.classes.listForGym(state.gym.id),
    BolaAPI.classes.listSessions(state.gym.id, new Date().toISOString()),
    BolaAPI.classes.listMyBookings(state.myClient.id),
  ]);
  setState({ classesForGym, classSessions, myBookings });
}

// Notificaciones propias del staff (un cliente confirmó su pago por QR).
async function refreshStaffNotifications() {
  if (!state.gym) return;
  const staffNotifications = await BolaAPI.notifications.listForStaff();
  setState({ staffNotifications });
}

// Lista de socios del gimnasio (Socios/Pagos) — otro admin suspendió,
// reactivó o cobró/confirmó un pago mientras vos estabas mirando.
async function refreshOwnerClients() {
  if (!state.gym) return;
  const clientsForGym = await attachFaceUrls(await BolaAPI.clients.listForGym(state.gym.id));
  setState({ clientsForGym });
}

// Check-ins de hoy (Panel/Asistencia) — alguien entró mientras mirabas.
async function refreshOwnerCheckins() {
  if (!state.gym) return;
  const todayCheckins = await BolaAPI.checkins.listTodayForGym(state.gym.id);
  setState({ todayCheckins });
}

// Presencia en el gym (ver src/screens/presence.js) — lista en vivo del
// encargado: un cliente escaneó, o una sesión venció (sync_gym_sessions()
// corre igual, listActiveForGym siempre sincroniza antes de leer). Solo
// pega al servidor si la pantalla está realmente abierta — el canal de
// tiempo real queda suscrito todo el rato que dura el panel (ver
// enterOwnerDash/enterTrainerDash), no solo mientras se mira esta pantalla.
async function refreshGymActiveSessions() {
  if (!state.gym || state.screen !== 'gymPresence') return;
  const gymActiveSessions = await BolaAPI.gymPresence.listActiveForGym(state.gym.id);
  setState({ gymActiveSessions });
}

// El gimnasio cambió (alguien tomó/cerró el turno de encargado) — mismo
// canal de arriba, pero sobre `gyms` en vez de `gym_sessions`.
async function refreshGymRow() {
  if (!state.gym) return;
  const gym = await BolaAPI.gyms.get(state.gym.id);
  setState({ gym });
}

// Sesión propia del cliente — venció (dispara sola, ver
// startGymSessionCountdown) o cambió desde otro dispositivo con la misma
// cuenta. listActiveForGym ya viene filtrado por RLS a "las mías" cuando
// quien llama es un cliente, así que alcanza con buscar la propia.
async function refreshMyGymSession() {
  if (!state.myClient || !state.gym) return;
  const rows = await BolaAPI.gymPresence.listActiveForGym(state.gym.id);
  const mine = rows.find(r => r.clientUserId === state.myClient.id) || null;
  clearGymSessionTimer();
  setState({ myGymSession: mine });
  if (mine) startGymSessionCountdown(mine.expiresAt);
}

// Calendario del dueño/admin — un cliente reservó/canceló, o se creó/
// borró un evento desde otra sesión (otro admin, u otro dispositivo tuyo).
async function refreshOwnerClasses() {
  if (!state.gym) return;
  const [classesForGym, classSessions, classBookingsForGym] = await Promise.all([
    BolaAPI.classes.listForGym(state.gym.id),
    BolaAPI.classes.listSessions(state.gym.id, new Date().toISOString()),
    BolaAPI.classes.listBookingsForGym(state.gym.id),
  ]);
  setState({ classesForGym, classSessions, classBookingsForGym });
}

// Chat — cliente <-> entrenador. Dos slots de estado distintos según quién
// mira (messages/conversationId del cliente, trainerMessages/
// trainerActiveConversationId del entrenador), mismo canal por debajo.
async function refreshClientChatMessages() {
  if (!state.conversationId) return;
  const messages = await BolaAPI.messages.list(state.conversationId);
  setState({ messages });
}
async function refreshTrainerChatMessages() {
  if (!state.trainerActiveConversationId) return;
  const trainerMessages = await BolaAPI.messages.list(state.trainerActiveConversationId);
  setState({ trainerMessages });
}

// ex.reps es texto ("8", "20 min", "circuito" — ver routine_exercises.reps)
// — el campo de "reps hechas" del modo entrenamiento solo se precarga
// cuando es puramente una cifra; si no, se deja vacío (ese ejercicio se
// mide en tiempo o rondas, no en repeticiones).
function defaultReps(ex) {
  return /^\d+$/.test(String((ex && ex.reps) || '').trim()) ? ex.reps : '';
}

// Nombre "limpio" del ejercicio, sin el sufijo " · ⚠ cuidá…" que el motor
// agrega al texto de la rutina (ver generator.js). Se usa para registrar en
// exercise_logs y para cruzar con el historial de progresión.
function cleanName(text) {                 // string -> string
  return String(text || '').split(' · ')[0].trim();
}
function cleanExName(ex) {                  // fila/ejercicio {text} -> string
  return cleanName(ex && ex.text);
}
// RIR objetivo del ejercicio: del texto de la rutina del motor, o del plan
// guardado, o 2 por defecto.
function exRirTarget(ex) {
  const m = String((ex && ex.text) || '').match(/RIR\s+([\d.\-]+)/);
  return m ? m[1] : ((state.enginePlan && state.enginePlan.rirTarget) || '2');
}
// Peso a precargar en "Modo entrenamiento" para un ejercicio: la sugerencia
// del análisis de progresión si la hay, si no el último peso conocido.
function precargaWeight(ex) {
  const p = ex && ex.prog;
  if (p && p.suggestedWeightKg != null) return String(p.suggestedWeightKg);
  return ex && ex.weightKg != null ? String(ex.weightKg) : '';
}

// El campo de correo de la UI solo captura la parte local (ver emailField()
// en helpers.js) — acá se completa con el mismo criterio que
// normalizeEmail() en supabase-client.js, para reconstruir el correo
// completo cuando todo lo que hay a mano es lo que la persona tipeó en el
// campo "usuario" (ej. detectar "correo no confirmado" en login(), donde
// todavía no hay ninguna respuesta de Supabase con el correo completo).
function normalizeEmailLocal(raw) {
  const v = (raw || '').trim();
  return v.includes('@') ? v : `${v}@gmail.com`;
}

// Supabase rechaza signInWithPassword() con este error cuando la cuenta
// existe pero todavía no confirmó su correo — pasa cuando alguien cerró la
// app antes de poner el código (ver viewConfirmCode) y vuelve más tarde a
// intentar loguearse directo, en vez de volver a esa pantalla.
function isUnconfirmedEmailError(err) {
  return !!err && (err.code === 'email_not_confirmed' || /email not confirmed/i.test(err.message || ''));
}

// Manda a la pantalla de código (ver viewConfirmCode) — `role` queda
// guardado para que ACTIONS.verifyConfirmCode sepa qué continuar apenas se
// verifique (null cuando no hay un registro en curso, ver login() arriba).
function goToConfirmCode(email, role) {
  setState({ busy: false, screen: 'confirmCode', confirmEmail: email, confirmRole: role, confirmCode: '', confirmCodeResent: false });
}

/* ==================== resiliencia a mala señal (src/offline.js) ====================
   Ver el comentario largo de ese archivo para el porqué. Acá solo vive lo
   que es específico de ESTA app: qué handler le corresponde a cada tipo de
   acción encolada, y un helper para las LECTURAS que deben caer a la
   última copia guardada en vez de romper la pantalla entera. */

// Uno por cada `kind` que algún ACTIONS.xxx encola con queueAction() más
// abajo — recibe exactamente el mismo payload que se guardó, y repite la
// llamada a BolaAPI tal cual se hubiera hecho con señal en el momento.
const QUEUE_HANDLERS = {
  workoutStart: ({ sessionId, clientUserId, gymId, source }) => BolaAPI.workouts.start(clientUserId, gymId, source, sessionId),
  workoutLogSet: ({ sessionId, clientUserId, exerciseName, setNumber, reps, weightKg, rir }) => BolaAPI.workouts.logSet(sessionId, clientUserId, exerciseName, setNumber, reps, weightKg, rir),
  workoutFinish: ({ sessionId, clientUserId }) => BolaAPI.workouts.finish(sessionId, clientUserId),
  checkin: ({ clientUserId }) => BolaAPI.checkins.checkIn(clientUserId),
  // Solo CONFIRMAR un cobro que ya existe — generar uno nuevo necesita
  // señal en el momento (ver el comentario grande en src/offline.js sobre
  // por qué eso se dejó afuera a propósito).
  confirmPayment: ({ paymentId }) => BolaAPI.payments.confirm(paymentId),
};

// Se llama al reconectar, al arrancar la app y cada tanto en segundo plano
// (ver router.js) — nunca hace falta que la persona toque nada para que
// esto se dispare.
export async function flushPendingQueue() {
  await flushQueue(QUEUE_HANDLERS, size => setState({ pendingSyncCount: size }));
  setState({ pendingSyncCount: getQueueSize() });
}

// Envuelve una lectura (BolaAPI.xxx.listForGym, etc.) para que un fallo de
// RED caiga a la última copia guardada (ver saveSnapshot/loadSnapshot en
// src/offline.js) en vez de tumbar toda la pantalla — un fallo que NO es
// de red (permisos, dato corrupto) se deja pasar tal cual, porque
// reintentar con datos viejos no lo arregla y ocultarlo sería engañoso.
// `key` tiene que ser única por gimnasio/cliente (ver los call sites) para
// que dos gimnasios/cuentas no compartan la copia guardada del otro.
// Exportada: router.js la reusa en boot() (arranque de un entrenador ya
// logueado) en vez de reinventar el mismo patrón ahí.
export async function loadWithFallback(key, fetcher) {
  try {
    const data = await fetcher();
    saveSnapshot(key, data);
    return { data, stale: false };
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const cached = loadSnapshot(key);
    if (cached) return { data: cached.data, stale: true };
    throw err; // no hay nada guardado — no queda otra que mostrar el error real
  }
}

export const ACTIONS = {
  goto: v => setState({ screen: v, error: '' }),
  togglePasswordVisibility: () => setState({ showPassword: !state.showPassword }),

  signOut: async () => {
    stopSessionRealtime();
    stopWatchingChat();
    clearGymSessionTimer();
    await BolaAPI.auth.signOut();
    // Ver OWNER_INVITE_KEY/GYM_INVITE_KEY en router.js — no dejar una
    // invitación pegada al navegador para la próxima cuenta que se loguee ahí.
    try { localStorage.removeItem(OWNER_INVITE_KEY); localStorage.removeItem(GYM_INVITE_KEY); } catch (_) {}
    if (window.CesAds) window.CesAds.hideBanner();
    Object.assign(state, {
      screen: 'landing', session: null, myProfile: null, gym: null, error: '',
      myClient: null, myClientPlan: null, myClientTrainer: null, myTrainer: null,
      activeCharge: null, trainerSelectedClientId: null, trainerSelectedClientDetail: null,
    });
    render();
  },

  // Login único (Etapa 1 del rediseño) — reemplaza ownerSignIn/adminSignIn/
  // clientSignIn/trainerSignIn, que eran el mismo BolaAPI.auth.signIn()
  // cuatro veces con cuatro campos de error separados. Ahora se loguea
  // primero y se rutea SEGÚN el rol que ya trae la cuenta — nadie elige de
  // antemano en qué formulario escribir su contraseña.
  login: async () => {
    setState({ busy: true, loginError: '' });
    try {
      await BolaAPI.auth.signIn({ email: state.loginEmail, password: state.loginPassword });
    } catch (err) {
      if (isUnconfirmedEmailError(err)) {
        // No hay draft de registro en memoria (pudo haber cerrado la app
        // hace días) — confirmRole queda null a propósito, ver
        // ACTIONS.verifyConfirmCode.
        goToConfirmCode(normalizeEmailLocal(state.loginEmail), null);
        return;
      }
      setState({ busy: false, loginError: friendlyError(err) });
      return;
    }
    // loadWithFallback acá no es por si ESTA llamada falla (recién se logueó
    // con señal, no tendría sentido que getMyProfile() fallara ahora mismo) —
    // es para que quede guardada una copia YA desde el primer login, y no
    // recién en el próximo boot() con sesión guardada. Sin esto, alguien que
    // se loguea una vez y abre la app de nuevo sin señal ANTES de que boot()
    // llegue a guardar su propia copia, se quedaba sin nada de dónde resumir.
    const profile = (await loadWithFallback('myProfile', () => BolaAPI.auth.getMyProfile())).data;
    setState({ loginEmail: '', loginPassword: '' });
    await routeAfterLogin(profile);
  },

  // Confirmación de correo por código (ver viewConfirmCode en screens/
  // auth.js) — reemplaza el link "Confirmar mi correo" que Supabase mandaba
  // por defecto. verifyOtp() confirma Y loguea en el mismo paso (a
  // diferencia del link viejo, que solo confirmaba — había que volver a
  // loguearse a mano después). confirmRole distingue si esto es la
  // continuación directa de un registro recién hecho en esta misma sesión
  // (retoma el paso exacto donde quedó, con inviteGym/inviteRole todavía en
  // memoria) o si viene de login() detectando una cuenta sin confirmar
  // (nada en memoria — se resuelve como cualquier login normal).
  verifyConfirmCode: async () => {
    setState({ busy: true, error: '' });
    let result;
    try {
      result = await BolaAPI.auth.verifyEmailCode({ email: state.confirmEmail, token: state.confirmCode.trim() });
      if (!result || !result.session) throw new Error('No pudimos verificar el código. Probá de nuevo.');
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
      return;
    }
    const role = state.confirmRole;
    setState({ confirmEmail: '', confirmCode: '', confirmRole: null, confirmCodeResent: false });
    if (role) { await continueAfterEmailConfirmed(role); return; }
    const profile = (await loadWithFallback('myProfile', () => BolaAPI.auth.getMyProfile())).data;
    await routeAfterLogin(profile);
  },
  resendConfirmCode: async () => {
    setState({ busy: true, error: '', confirmCodeResent: false });
    try {
      await BolaAPI.auth.resendConfirmCode(state.confirmEmail);
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
      return;
    }
    setState({ busy: false, confirmCodeResent: true });
  },

  // "Olvidé mi contraseña" — mismo patrón de 3 pasos que confirmCode
  // arriba, ver viewForgotPassword/viewForgotPasswordCode/
  // viewForgotPasswordReset en screens/auth.js.
  goToForgotPassword: () => setState({
    screen: 'forgotPassword', error: '',
    forgotEmail: state.loginEmail, forgotCode: '', forgotCodeResent: false, forgotNewPassword: '', forgotNewPassword2: '',
  }),
  requestPasswordReset: async () => {
    setState({ busy: true, error: '' });
    try {
      await BolaAPI.auth.requestPasswordReset(state.forgotEmail);
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
      return;
    }
    setState({ busy: false, screen: 'forgotPasswordCode', forgotCode: '', forgotCodeResent: false });
  },
  resendForgotCode: async () => {
    setState({ busy: true, error: '', forgotCodeResent: false });
    try {
      await BolaAPI.auth.requestPasswordReset(state.forgotEmail);
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
      return;
    }
    setState({ busy: false, forgotCodeResent: true });
  },
  // verifyOtp(type:'recovery') ya deja logueada la sesión con el código
  // correcto (igual que verifyConfirmCode con type:'signup') — acá solo
  // se manda al paso 3 a elegir la contraseña nueva, todavía no se toca.
  verifyForgotCode: async () => {
    setState({ busy: true, error: '' });
    try {
      const result = await BolaAPI.auth.verifyPasswordResetCode({ email: state.forgotEmail, token: state.forgotCode.trim() });
      if (!result || !result.session) throw new Error('No pudimos verificar el código. Probá de nuevo.');
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
      return;
    }
    setState({ busy: false, screen: 'forgotPasswordReset', forgotCode: '' });
  },
  saveNewPassword: async () => {
    if (state.forgotNewPassword !== state.forgotNewPassword2) {
      setState({ error: 'Las contraseñas no coinciden.' });
      return;
    }
    setState({ busy: true, error: '' });
    try {
      await BolaAPI.auth.updatePassword(state.forgotNewPassword);
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
      return;
    }
    const profile = await BolaAPI.auth.getMyProfile();
    setState({ forgotEmail: '', forgotNewPassword: '', forgotNewPassword2: '' });
    await routeAfterLogin(profile);
  },

  // Fase 16: el alta de administrador ya es solo por link de invitación de
  // un gimnasio (viewAdminReg solo se llega desde viewInviteWelcome con el
  // rol ya resuelto) — nunca cae al selector público de gimnasios.
  adminSignUp: async () => {
    setState({ busy: true, error: '' });
    const a = state.adminReg;
    const result = await BolaAPI.auth.signUpAdmin({ ...a, phone: a.phonePrefix + a.phone });
    if (!result || !result.session) {
      goToConfirmCode((result && result.user && result.user.email) || normalizeEmailLocal(a.email), 'admin');
      return;
    }
    await continueAfterEmailConfirmed('admin');
  },

  /* ---- owner registration (crea el gimnasio) ---- */
  ownerSignUp: async () => {
    setState({ busy: true, error: '' });
    const r = state.ownerReg;
    const result = await BolaAPI.auth.signUpOwner({ ...r, phone: r.phonePrefix + r.phone });
    if (!result || !result.session) {
      goToConfirmCode((result && result.user && result.user.email) || normalizeEmailLocal(r.email), 'owner');
      return;
    }
    await continueAfterEmailConfirmed('owner');
  },
  ownerCreateGym: async () => {
    setState({ busy: true, error: '' });
    // Fase 16: create_gym() ahora exige un owner_invite válido y sin usar
    // (ver docs/SECURITY_AUDIT.md) — sin state.ownerInviteToken el RPC
    // rechaza con un error claro que se muestra igual que cualquier otro.
    const gymId = await BolaAPI.gyms.create({ ...state.gymReg, ownerInviteToken: state.ownerInviteToken });
    try { localStorage.removeItem(OWNER_INVITE_KEY); } catch (_) {}
    const gym = await BolaAPI.gyms.get(gymId);
    setState({ busy: false, gym, screen: 'ownerReg3', equipment: [], plans: [] });
  },
  addEquipmentFromInput: async () => {
    const v = state.newEquipment.trim();
    if (!v) return;
    const row = await BolaAPI.equipment.add(state.gym.id, v, inferEquipmentConcepts(v));
    setState({ equipment: state.equipment.concat(row), newEquipment: '' });
  },
  addEquipment: async v => {
    const row = await BolaAPI.equipment.add(state.gym.id, v, inferEquipmentConcepts(v));
    setState({ equipment: state.equipment.concat(row) });
  },
  removeEquipment: async id => {
    await BolaAPI.equipment.remove(id);
    setState({ equipment: state.equipment.filter(e => e.id !== id) });
  },
  // Fase 5 del Training Engine — activo/inactivo + conceptos por máquina.
  toggleEquipmentActive: async id => {
    const e = state.equipment.find(x => x.id === id);
    if (!e) return;
    const next = !(e.isActive !== false);
    setState({ equipment: state.equipment.map(x => x.id === id ? { ...x, isActive: next } : x) });
    try { await BolaAPI.equipment.setActive(id, next); }
    catch (err) { setState({ equipment: state.equipment.map(x => x.id === id ? { ...x, isActive: !next } : x), error: friendlyError(err) }); }
  },
  openEquipmentConcepts: id => {
    const e = state.equipment.find(x => x.id === id);
    if (!e) return;
    const start = (e.concepts && e.concepts.length) ? e.concepts : inferEquipmentConcepts(e.name);
    setState({ equipmentEditingConceptsId: id, equipmentConceptsDraft: [...start] });
  },
  closeEquipmentConcepts: () => setState({ equipmentEditingConceptsId: null, equipmentConceptsDraft: [] }),
  toggleEquipmentConcept: token => {
    const cur = state.equipmentConceptsDraft;
    setState({ equipmentConceptsDraft: cur.includes(token) ? cur.filter(t => t !== token) : [...cur, token] });
  },
  saveEquipmentConcepts: async id => {
    const concepts = [...state.equipmentConceptsDraft];
    setState({
      equipment: state.equipment.map(x => x.id === id ? { ...x, concepts } : x),
      equipmentEditingConceptsId: null, equipmentConceptsDraft: [],
    });
    try { await BolaAPI.equipment.setConcepts(id, concepts); }
    catch (err) { setState({ error: friendlyError(err) }); }
  },

  setPlanDuration: v => setState({ newPlanDuration: v }),
  savePlan: async () => {
    const { newPlanName, newPlanPrice, newPlanDuration, editingPlanId } = state;
    if (!newPlanName.trim() || !newPlanPrice) return;
    const payload = { name: newPlanName.trim(), price: Number(newPlanPrice), duration: newPlanDuration.toLowerCase() };
    if (editingPlanId) {
      const updated = await BolaAPI.plans.update(editingPlanId, payload);
      setState({
        plans: state.plans.map(p => p.id === editingPlanId ? updated : p),
        newPlanName: '', newPlanPrice: '', newPlanDuration: 'Mensual', editingPlanId: null,
      });
    } else {
      const created = await BolaAPI.plans.add(state.gym.id, payload);
      setState({ plans: state.plans.concat(created), newPlanName: '', newPlanPrice: '' });
    }
  },
  editPlan: v => {
    const p = state.plans.find(x => x.id === v);
    if (!p) return;
    setState({ editingPlanId: p.id, newPlanName: p.name, newPlanPrice: String(p.price), newPlanDuration: DURATION_LABELS[p.duration] || 'Mensual' });
  },
  cancelEditPlan: () => setState({ editingPlanId: null, newPlanName: '', newPlanPrice: '', newPlanDuration: 'Mensual' }),
  deletePlan: async v => {
    await BolaAPI.plans.remove(v);
    const patch = { plans: state.plans.filter(p => p.id !== v) };
    if (state.editingPlanId === v) Object.assign(patch, { editingPlanId: null, newPlanName: '', newPlanPrice: '', newPlanDuration: 'Mensual' });
    setState(patch);
  },

  ownerDashFromReg: async () => {
    await enterOwnerDash();
  },

  ownerTab: v => setState({ ownerTab: v }),
  copyInviteLink: async link => {
    try {
      await navigator.clipboard.writeText(link);
    } catch (err) {
      // Sin permiso/soporte de portapapeles (poco común, pero no es motivo
      // para romper la pantalla) -- el código sigue visible igual en la
      // tarjeta, así que solo avisamos que el copiado automático falló para
      // que el dueño sepa que tiene que copiarlo a mano.
      console.error('No se pudo copiar el link de invitación:', err);
      setState({ inviteLinkCopyFailed: true });
      setTimeout(() => setState({ inviteLinkCopyFailed: false }), 2500);
      return;
    }
    setState({ inviteLinkCopied: true });
    setTimeout(() => setState({ inviteLinkCopied: false }), 2000);
  },

  // Fase 16 — rota el código de invitación de un rol (ej. si se filtró) sin
  // afectar a los otros dos. El gate real es regenerate_gym_invite() en el
  // servidor (exige app_role_is_staff()) — acá solo se refleja el nuevo
  // código en la tarjeta correspondiente.
  regenerateGymInvite: async role => {
    const code = await BolaAPI.gyms.regenerateInvite(role);
    setState({ gymInvites: { ...state.gymInvites, [role]: code } });
  },

  // Panel de plataforma (src/screens/platform.js, solo profile.role ===
  // 'platform_admin') — genera el link de un solo uso para que un dueño
  // nuevo pueda registrarse. El gate real es create_owner_invite() en el
  // servidor (exige app_is_platform_admin()); acá solo se arma el link para
  // copiar/mostrar como QR (ver src/qr.js).
  generatePlatformInvite: async () => {
    setState({ busy: true, error: '' });
    try {
      const token = await BolaAPI.platform.createOwnerInvite(state.platformInviteNote);
      const link = `${window.location.origin}${window.location.pathname}?owner_invite=${token}`;
      setState({ busy: false, platformInviteLink: link, platformInviteNote: '' });
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
    }
  },

  setBillingFilter: v => setState({ billingFilter: v }),

  approveTrainer: async v => {
    await BolaAPI.trainers.approve(v);
    const trainersForGym = await BolaAPI.trainers.listForGym(state.gym.id);
    setState({ trainersForGym });
  },
  rejectTrainer: async v => {
    await BolaAPI.trainers.reject(v);
    const trainersForGym = await BolaAPI.trainers.listForGym(state.gym.id);
    setState({ trainersForGym });
  },

  // Exclusivo del dueño (el servidor lo exige en approve_admin/reject_admin;
  // acá solo se refresca la lista tras el cambio).
  approveAdmin: async v => {
    await BolaAPI.admins.approve(v);
    const gymAdminsForGym = await BolaAPI.admins.listForGym(state.gym.id);
    setState({ gymAdminsForGym });
  },
  rejectAdmin: async v => {
    await BolaAPI.admins.reject(v);
    const gymAdminsForGym = await BolaAPI.admins.listForGym(state.gym.id);
    setState({ gymAdminsForGym });
  },

  // Check-in manual desde la lista de clientes — sigue existiendo como
  // alternativa a "Escanear QR" (ver goto:scanCheckin / handleCheckinScan
  // más abajo, y src/qr.js) para cuando no hay cámara a mano o el cliente
  // no tiene el código a la vista. Mismo RPC en ambos casos.
  checkInClient: async clientId => {
    const nowIso = new Date().toISOString();
    try {
      const row = await BolaAPI.checkins.checkIn(clientId);
      const todayCheckins = await BolaAPI.checkins.listTodayForGym(state.gym.id);
      // También se agrega a attendanceEvents (Asistencia), cargado una sola
      // vez al entrar al panel — si no, un check-in hecho durante la misma
      // sesión no aparecería en el calendario hasta volver a entrar.
      setState({ todayCheckins, attendanceEvents: [...state.attendanceEvents, { client_user_id: clientId, created_at: row.created_at }] });
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      // Sin señal: se registra igual en la pantalla (el "✓ Hoy" aparece de
      // una) y se encola para mandarse sola apenas vuelva la conexión — ver
      // src/offline.js. Nadie se queda esperando frente al mostrador.
      queueAction('checkin', { clientUserId: clientId });
      setState({
        pendingSyncCount: getQueueSize(),
        todayCheckins: [...state.todayCheckins, { client_user_id: clientId, created_at: nowIso }],
        attendanceEvents: [...state.attendanceEvents, { client_user_id: clientId, created_at: nowIso }],
      });
    }
  },
  clearScanStatus: () => setState({ scanStatus: null }),
  // Limpia el error/toast de una visita anterior a esta pantalla antes de
  // entrar — si no, un fallo de cámara viejo (p. ej. "permiso denegado")
  // quedaría pegado en pantalla un instante mientras router.js reintenta
  // pedir la cámara de nuevo (ver ensureQrScanner en src/qr.js).
  goToScanCheckin: () => setState({ screen: 'scanCheckin', scanError: '', scanStatus: null, error: '' }),
  // Mismo patrón, del lado del cliente — ver ACTIONS.handlePaymentScan y
  // viewClientScanPayment en screens/client.js.
  goToScanPayment: () => setState({ screen: 'scanPayment', scanError: '', scanStatus: null, error: '' }),

  /* ---- Presencia en el gym (pantalla nueva, ver src/screens/presence.js) ----
     Compartida por owner/admin/entrenador. Un solo QR físico del gimnasio:
     el staff lo escanea para quedar de encargado, el cliente lo escanea
     para arrancar su sesión de 2h — ver scan_gym_qr() en la migración y
     handleGymPresenceScan más abajo, que es el mismo handler para ambos
     casos (el servidor decide qué rama corre según el rol de quien llama). */
  openGymPresence: async () => {
    const gymActiveSessions = await BolaAPI.gymPresence.listActiveForGym(state.gym.id);
    setState({ presenceReturn: state.screen, screen: 'gymPresence', gymActiveSessions, gymQrExpanded: false });
  },
  closeGymPresence: () => setState({ screen: state.presenceReturn || 'ownerDash', presenceReturn: null }),
  toggleGymQrExpanded: () => setState({ gymQrExpanded: !state.gymQrExpanded }),
  goToScanGymPresence: () => setState({ screen: 'scanGymPresence', presenceScanReturn: state.screen, scanError: '', scanStatus: null, error: '' }),
  exitScanGymPresence: () => setState({ screen: state.presenceScanReturn || 'clientHome', presenceScanReturn: null, scanError: '', scanStatus: null }),
  // Solo el propio encargado (o el dueño, que puede forzarlo) — ver
  // end_encargado_shift() en el servidor.
  endEncargadoShift: async () => {
    await BolaAPI.gymPresence.endShift();
    const gym = await BolaAPI.gyms.get(state.gym.id);
    setState({ gym });
  },

  generateCharge: async clientId => {
    const c = state.clientsForGym.map(enrichClient).find(x => x.id === clientId);
    if (!c) return;
    const paymentId = await BolaAPI.payments.createCashCharge(clientId);
    setState({ activeCharge: { paymentId, clientId, clientName: c.name, amount: c.amount }, chargeQrExpanded: false });
  },
  cancelCharge: async () => {
    if (!state.activeCharge) return;
    await BolaAPI.payments.cancel(state.activeCharge.paymentId);
    setState({ activeCharge: null, chargeQrExpanded: false });
  },
  confirmCharge: async () => {
    if (!state.activeCharge) return;
    const paymentId = state.activeCharge.paymentId;
    try {
      await BolaAPI.payments.confirm(paymentId);
      const clientsForGym = await attachFaceUrls(await BolaAPI.clients.listForGym(state.gym.id));
      setState({ clientsForGym, activeCharge: null, chargeQrExpanded: false });
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      // El cobro YA existe (se generó con señal) — solo falta avisarle al
      // servidor que se confirmó, así que esto sí se puede encolar sin
      // riesgo (no hace falta un ID nuevo). Ver src/offline.js sobre por
      // qué generar un cobro NUEVO sin señal no está cubierto.
      queueAction('confirmPayment', { paymentId });
      setState({ pendingSyncCount: getQueueSize(), activeCharge: null, chargeQrExpanded: false });
    }
  },
  // El QR del cobro (ver viewOwnerSocios) solo se genera de este lado — el
  // cliente ya no dibuja el suyo, lo escanea (ver goToScanPayment más
  // arriba). Esto solo lo agranda a pantalla completa para que sea más
  // fácil de leer desde el mostrador — mismo dato, mismo QR.
  toggleChargeQrExpanded: () => setState({ chargeQrExpanded: !state.chargeQrExpanded }),

  /* ---- Etapa 2: "Socios" — buscar/filtrar + suspender/reactivar ---- */
  setOwnerClientStatusFilter: v => setState({ ownerClientStatusFilter: v }),
  promptSuspendClient: clientId => setState({ ownerSuspendingClientId: clientId, ownerSuspendReason: '' }),
  cancelSuspendClient: () => setState({ ownerSuspendingClientId: null, ownerSuspendReason: '' }),
  confirmSuspendClient: async () => {
    if (!state.ownerSuspendingClientId) return;
    await BolaAPI.clients.suspend(state.ownerSuspendingClientId, state.ownerSuspendReason);
    const clientsForGym = await attachFaceUrls(await BolaAPI.clients.listForGym(state.gym.id));
    setState({ clientsForGym, ownerSuspendingClientId: null, ownerSuspendReason: '' });
  },
  unsuspendClient: async clientId => {
    await BolaAPI.clients.unsuspend(clientId);
    const clientsForGym = await attachFaceUrls(await BolaAPI.clients.listForGym(state.gym.id));
    setState({ clientsForGym });
  },

  /* ---- Etapa 2: "Entrenadores" — activar/desactivar ---- */
  toggleTrainerActive: async trainerId => {
    const t = state.trainersForGym.find(x => x.id === trainerId);
    if (!t) return;
    await BolaAPI.trainers.setActive(trainerId, !t.isActive);
    const trainersForGym = await BolaAPI.trainers.listForGym(state.gym.id);
    setState({ trainersForGym });
  },

  /* ---- Etapa 2: "Asistencia" (calendario, reemplaza el "Tráfico" inventado) ---- */
  setAttendanceSelectedDay: day => setState({ attendanceSelectedDay: Number(day) }),

  /* ---- Etapa 2: "Configuración" (moneda, marca) ---- */
  saveGymConfig: async () => {
    const d = state.gymConfigDraft;
    setState({ busy: true, error: '' });
    try {
      await BolaAPI.gyms.updateSettings(state.gym.id, {
        currency: d.currency, brandName: d.brandName, brandColor: d.brandColor,
        name: d.name, address: d.address, hours: d.hours,
      });
      const gym = await BolaAPI.gyms.get(state.gym.id);
      setState({ busy: false, gym });
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
    }
  },

  /* ---- selección de gimnasio (cliente y entrenador) ---- */
  selectGym: v => setState({ selectedGymId: v }),
  confirmGymAndJoin: async () => {
    if (!state.selectedGymId) return;
    setState({ busy: true, error: '' });
    try {
      await BolaAPI.gyms.join(state.selectedGymId);
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
      return;
    }
    const gym = await BolaAPI.gyms.get(state.selectedGymId);
    const next = state.gymPickerNext;
    if (next === 'clientSignUp') {
      await continueClientSignUpAfterGym(gym);
    } else if (next === 'trainerSignUp') {
      continueTrainerSignUpAfterGym();
    } else if (next === 'adminSignUp') {
      continueAdminSignUpAfterGym();
    } else if (next === 'clientResume') {
      const profile = await BolaAPI.auth.getMyProfile();
      state.myProfile = profile;
      await continueClientResume(profile);
    } else if (next === 'trainerResume') {
      const profile = await BolaAPI.auth.getMyProfile();
      await continueTrainerSignIn(profile);
    } else if (next === 'adminResume') {
      const profile = await BolaAPI.auth.getMyProfile();
      await continueAdminSignIn(profile);
    }
  },

  confirmRequiredFacePhoto: async () => {
    const file = state.clientReg.photoFile;
    if (!file) return;
    setState({ busy: true, error: '' });
    try {
      const path = BolaAPI.photos.facePath(state.gym.id, state.myProfile.id);
      await BolaAPI.photos.upload(path, file);
      await BolaAPI.clients.setFacePhotoKey(state.myProfile.id, path);
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
      return;
    }
    await continueAfterFacePhoto();
  },

  /* ---- client registration ---- */
  clientSignUp: async () => {
    setState({ busy: true, error: '' });
    const c = state.clientReg;
    const result = await BolaAPI.auth.signUpClient({ name: c.name, email: c.email, phone: c.phonePrefix + c.phone, password: c.password });
    if (!result || !result.session) {
      goToConfirmCode((result && result.user && result.user.email) || normalizeEmailLocal(c.email), 'client');
      return;
    }
    await continueAfterEmailConfirmed('client');
  },
  setLevel: v => setState({ clientPhysicalReg: { ...state.clientPhysicalReg, level: v } }),
  setRegGoal: v => setState({ clientPhysicalReg: { ...state.clientPhysicalReg, goal: v }, aiGoal: v }),
  savePhysicalAndContinue: async () => {
    await BolaAPI.clients.updatePhysical(state.myProfile.id, state.clientPhysicalReg);
    await ACTIONS.goClientReg3();
  },
  goClientReg3: () => setState({ screen: 'clientReg3' }),
  selectPlan: v => setState({ selectedPlanId: v }),
  choosePlanAndContinue: async () => {
    await BolaAPI.clients.choosePlan(state.myProfile.id, state.selectedPlanId);
    const approvedTrainersForReg = await BolaAPI.trainers.listApprovedForGym(state.gym.id);
    setState({ approvedTrainersForReg, screen: 'clientReg4' });
  },
  chooseWantTrainer: () => setState({ wantsTrainer: true }),
  chooseNoTrainer: () => setState({ wantsTrainer: false, selectedTrainerId: null }),
  selectTrainer: v => setState({ selectedTrainerId: v }),
  finishClientReg: async () => {
    setState({ busy: true, error: '' });
    await BolaAPI.clients.chooseTrainer(state.myProfile.id, state.wantsTrainer ? state.selectedTrainerId : null);
    setState({ busy: false });
    await enterClientHome();
  },

  /* ---- client home ---- */
  selectClientTab: async tab => {
    setState({ clientTab: tab });
    if (tab === 'pago') {
      const pendingPayment = await BolaAPI.payments.getPendingForClient(state.myClient.id);
      setState({ pendingPayment });
    }
  },
  goPayTab: () => ACTIONS.selectClientTab('pago'),
  // A diferencia de goPayTab (que solo cambia de tab DENTRO de clientHome,
  // para cuando ya estás ahí — ver el aviso de "vence en 5 días"),
  // viewClientScanPayment es una pantalla top-level propia (mismo patrón que
  // scanCheckin del lado del dueño) — "volver" tiene que restaurar screen
  // a clientHome además de la tab, o si no se queda pegado en scanPayment.
  // router.js corta la cámara solo (ver QR_SCAN_SCREENS en render()) apenas
  // detecta que `screen` dejó de ser una pantalla de escaneo.
  exitScanPayment: () => setState({ screen: 'clientHome', clientTab: 'pago', scanError: '', scanStatus: null }),
  refreshPendingPayment: refreshMyPaymentState,
  setRoutineSource: v => setState({ routineSource: v }),

  /* ---- Fight Club Training Engine: formulario de evaluación (Fase 3) ----
     Ver src/screens/evaluation.js. El botón "Generar rutina con IA" abre
     este formulario; al terminar guarda el perfil (training_profiles +
     client_exercise_preferences + client_limitations) y corre el motor
     determinista (Fases 6-7, src/training-engine/) para armar la rutina. */
  openEvaluation: () => {
    const p = state.myTrainingProfile;
    const phys = (state.myClient && state.myClient.physical) || {};
    setState({
      screen: 'clientEvaluation',
      evalStep: p ? EVAL_TOTAL_STEPS : 1,   // si ya la hizo, va directo al resumen
      error: '',
      evalDraft: {
        sex: (p && p.sex) || '',
        primaryGoal: (p && p.primaryGoal) || '',
        secondaryGoal: (p && p.secondaryGoal) || '',
        trainingTimeBucket: (p && p.trainingTimeBucket) || '',
        machineComfort: (p && p.machineComfort) || '',
        daysPerWeek: (p && p.daysPerWeek) || null,
        sessionMinutes: (p && p.sessionMinutes) || null,
        preferredStyle: (p && p.preferredStyle) || '',
        priorityMuscles: (p && p.priorityMuscles) ? [...p.priorityMuscles] : [],
        somatotype: (p && p.somatotype) || '',
        weight: phys.weight != null ? String(phys.weight) : '',
        height: phys.height != null ? String(phys.height) : '',
        age: phys.age != null ? String(phys.age) : '',
        limitationJoints: state.evalLimitationsLoaded ? [...state.evalLimitationsLoaded] : [],
        hasPain: state.evalHasPainLoaded ?? null,
      },
      evalExcluded: state.evalExcludedLoaded ? [...state.evalExcludedLoaded] : [],
      evalPainfulNote: state.evalPainfulNoteLoaded || '',
      evalExerciseQuery: '',
    });
    // Carga en paralelo lo que ya haya guardado de excluidos/limitaciones
    // (no bloquea abrir la pantalla — si tarda, aparecen en el próximo render).
    Promise.all([
      BolaAPI.trainingProfile.listExcludedExercises(state.myClient.id),
      BolaAPI.trainingProfile.listLimitations(state.myClient.id),
    ]).then(([excl, lims]) => {
      const joints = [...new Set(lims.map(l => l.joint).filter(j => j && j !== 'ninguna'))];
      const painRow = lims.find(l => l.painfulMovement);
      setState({
        evalExcludedLoaded: excl.map(x => ({ exerciseId: x.exerciseId, exerciseName: x.exerciseName })),
        evalLimitationsLoaded: joints, evalHasPainLoaded: lims.length ? !!painRow : null,
        evalPainfulNoteLoaded: (painRow && painRow.note) || '',
        evalExcluded: excl.map(x => ({ exerciseId: x.exerciseId, exerciseName: x.exerciseName })),
        evalDraft: { ...state.evalDraft, limitationJoints: joints, hasPain: lims.length ? !!painRow : state.evalDraft.hasPain },
        evalPainfulNote: (painRow && painRow.note) || state.evalPainfulNote,
      });
    }).catch(() => {});
  },
  closeEvaluation: () => setState({ screen: 'clientHome', clientTab: 'rutina' }),
  evalNext: () => setState({ evalStep: Math.min(EVAL_TOTAL_STEPS, state.evalStep + 1) }),
  evalBack: () => setState({ evalStep: Math.max(1, state.evalStep - 1) }),
  // Desde el resumen (paso 8): saltar a un paso concreto para ajustarlo.
  evalGoStep: v => setState({ evalStep: Math.max(1, Math.min(EVAL_TOTAL_STEPS, Number(v) || 1)) }),
  evalSet: v => {
    const i = v.indexOf(':');
    const field = i === -1 ? v : v.slice(0, i);
    let val = i === -1 ? '' : v.slice(i + 1);
    if (field === 'daysPerWeek' || field === 'sessionMinutes') val = val ? Number(val) : null;
    if (field === 'hasPain') val = val === 'si';
    setState({ evalDraft: { ...state.evalDraft, [field]: val } });
  },
  evalToggleMuscle: id => {
    const cur = state.evalDraft.priorityMuscles;
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    setState({ evalDraft: { ...state.evalDraft, priorityMuscles: next } });
  },
  evalToggleJoint: id => {
    const cur = state.evalDraft.limitationJoints;
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    setState({ evalDraft: { ...state.evalDraft, limitationJoints: next } });
  },
  evalToggleExcluded: exerciseId => {
    const cur = state.evalExcluded;
    if (cur.some(x => x.exerciseId === exerciseId)) {
      setState({ evalExcluded: cur.filter(x => x.exerciseId !== exerciseId) });
    } else {
      const ex = (state.exercisesLib || []).find(e => e.id === exerciseId);
      setState({ evalExcluded: [...cur, { exerciseId, exerciseName: ex ? ex.name : '' }] });
    }
  },
  saveEvaluationAndGenerate: async () => {
    setState({ busy: true, error: '' });
    const d = state.evalDraft;
    try {
      await BolaAPI.trainingProfile.save(state.myClient.id, state.gym.id, {
        sex: d.sex || null, primaryGoal: d.primaryGoal, secondaryGoal: d.secondaryGoal || null,
        trainingTimeBucket: d.trainingTimeBucket || null, machineComfort: d.machineComfort || null,
        daysPerWeek: d.daysPerWeek ?? null, sessionMinutes: d.sessionMinutes ?? null,
        preferredStyle: d.preferredStyle || null, priorityMuscles: d.priorityMuscles || [],
        somatotype: d.somatotype || null,
      });
      await BolaAPI.trainingProfile.setExcludedExercises(state.myClient.id,
        state.evalExcluded.map(x => ({ exerciseId: x.exerciseId, exerciseName: x.exerciseName, preference: 'excluido' })));
      // Una fila de limitación por articulación elegida. Si marcó dolor pero
      // ninguna articulación, va una fila 'otra'. Sin nada = "ninguna" (0 filas).
      const painfulNote = d.hasPain === true ? (state.evalPainfulNote.trim() || null) : null;
      let limRows = d.limitationJoints.map(j => ({ joint: j, painfulMovement: d.hasPain === true, note: painfulNote }));
      if (!limRows.length && d.hasPain === true) limRows = [{ joint: 'otra', painfulMovement: true, note: painfulNote }];
      await BolaAPI.trainingProfile.setLimitations(state.myClient.id, limRows);

      // Sincroniza el perfil "grueso" que usa el resto de la app: nivel
      // derivado de experiencia+comodidad, objetivo mapeado al enum de 4, y
      // peso/altura/edad si los cargó acá.
      const level = deriveLevel(d.trainingTimeBucket, d.machineComfort);
      const goal4 = mapGoalToEnum(d.primaryGoal);
      await BolaAPI.clients.updatePhysical(state.myProfile.id, {
        weight: d.weight ? Number(d.weight) : (state.myClient.physical.weight ?? null),
        height: d.height ? Number(d.height) : (state.myClient.physical.height ?? null),
        age: d.age ? Number(d.age) : (state.myClient.physical.age ?? null),
        level, goal: goal4,
      });

      // Generación: motor de entrenamiento determinista (Fases 6-7). Sin IA
      // externa ni internet — reglas locales sobre la biblioteca real y el
      // equipamiento activo del gimnasio (pedido §29). El objetivo que usa el
      // motor es el de la evaluación (9 valores), no el enum de 4.
      const engineProfile = {
        level,
        primaryGoal: d.primaryGoal,
        secondaryGoal: d.secondaryGoal || null,
        daysPerWeek: d.daysPerWeek || 3,
        sessionMinutes: d.sessionMinutes || 60,
        preferredStyle: d.preferredStyle || 'indiferente',
        priorityMuscles: d.priorityMuscles || [],
      };
      const { entries, plan, filtered } = generateFullRoutine({
        library: state.exercisesLib || [],
        gymConcepts: activeGymConcepts(),
        profile: engineProfile,
        excludedIds: state.evalExcluded.map(x => x.exerciseId).filter(Boolean),
        limitations: limRows,
      });
      // Red de seguridad: si el pool quedó vacío (gimnasio sin conceptos
      // cargados, biblioteca sin metadatos del motor) cae al generador viejo
      // para no dejar al cliente sin rutina.
      const finalEntries = entries.length ? entries : buildRoutine(goal4, state.equipment.map(e => e.name));
      await BolaAPI.routines.generateAi(state.myClient.id, goal4, finalEntries);
      const [aiRoutine, myTrainingProfile, selfRaw] = await Promise.all([
        BolaAPI.routines.getAi(state.myClient.id, goal4),
        BolaAPI.trainingProfile.get(state.myClient.id),
        BolaAPI.clients.getSelf(state.myProfile.id),
      ]);
      const [client] = await attachFaceUrls([selfRaw]);
      const myClientPlan = state.plans.find(p => p.id === client.planId) || state.myClientPlan;
      setState({
        busy: false, screen: 'clientHome', clientTab: 'rutina', routineSource: 'ia',
        aiGoal: goal4, aiRoutine, myTrainingProfile, myClient: client, myClientPlan,
        enginePlan: entries.length ? { ...plan, rejected: filtered.rejected } : null,
      });
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
    }
  },

  // "10 clientes interesados" (sección 11 del pedido original) — el
  // mínimo real lo exige approve_trainer() en el servidor, esto solo marca
  // el interés propio y refresca el conteo que ve todo el gimnasio.
  markTrainerInterest: async candidateId => {
    await BolaAPI.trainers.markInterest(candidateId);
    const trainerInterest = await BolaAPI.trainers.listInterestForGym(state.gym.id);
    setState({ trainerInterest });
  },
  unmarkTrainerInterest: async candidateId => {
    await BolaAPI.trainers.unmarkInterest(candidateId);
    const trainerInterest = await BolaAPI.trainers.listInterestForGym(state.gym.id);
    setState({ trainerInterest });
  },

  /* ---- workout: temporizador de descanso + marcar series (sección 8 del
     pedido original) — Etapa 2: ahora abre una fila real en
     workout_sessions y cada serie marcada se guarda en exercise_logs (peso
     y reps reales), no solo un check en memoria. ---- */
  startWorkout: async source => {
    const routine = (source === 'trainer' ? state.trainerRoutineForMe : source === 'personal' ? state.myPersonalRoutine : state.aiRoutine) || { exercises: [] };
    // Si la rutina es semanal (algún ejercicio con día asignado), arranca
    // solo lo que le toca a HOY — "lo que te toca el día" — no la semana
    // entera de una sola vez. Una rutina sin días asignados (con IA, o
    // armada sin elegir día) sigue funcionando exactamente igual que antes.
    let exercises = exercisesForToday(routine.exercises || []);
    if (!exercises.length) return;
    clearRestTimer();
    // El ID de la sesión se elige ACÁ, no lo asigna el servidor — así,
    // aunque no haya señal en este momento, se puede seguir entrenando y
    // marcando series con ESTE mismo ID; cuando vuelva la señal, se manda
    // primero la creación de la sesión y después cada serie encolada, en
    // orden (ver src/offline.js y QUEUE_HANDLERS.workoutStart más arriba).
    // Funciona porque workout_sessions se inserta directo (no por RPC) y su
    // política RLS no exige que el ID lo genere el servidor.
    const sessionId = newUuid();
    // Fase 14 — abrir la sesión y traer el historial de progresión (Fase 9)
    // van en paralelo: son independientes y antes eran dos idas y vueltas
    // encadenadas antes de que se abriera la pantalla.
    const since = new Date(Date.now() - 120 * 86400000).toISOString();
    const [logs] = await Promise.all([
      BolaAPI.workouts.recentLogs(state.myClient.id, since).catch(() => []),
      BolaAPI.workouts.start(state.myClient.id, state.gym.id, source, sessionId).catch(err => {
        if (!isNetworkError(err)) throw err;
        queueAction('workoutStart', { sessionId, clientUserId: state.myClient.id, gymId: state.gym.id, source });
        setState({ pendingSyncCount: getQueueSize() });
      }),
    ]);
    // Análisis de progresión: subir/mantener/bajar el peso por ejercicio
    // según lo último que movió. Puro y determinista (progression.js).
    try {
      const rows = exercises.map(e => ({ name: cleanExName(e), reps: e.reps, rirTarget: exRirTarget(e) }));
      const prog = analyzeRoutine(rows, logs || []);
      exercises = exercises.map(e => ({ ...e, prog: prog.get(cleanExName(e)) || null }));
    } catch (_) { /* sin historial → sin sugerencias, se entrena igual */ }
    const first = exercises[0] || {};
    setState({
      screen: 'workout',
      workout: {
        sessionId, exercises, source, index: 0, doneSets: {}, restSecondsLeft: 0, finished: false,
        weightInput: precargaWeight(first), repsInput: defaultReps(first), rirInput: '',
      },
    });
  },
  setWorkoutRir: v => {
    const w = state.workout;
    if (!w) return;
    // toca de nuevo el mismo valor -> lo borra (queda sin registrar)
    setState({ workout: { ...w, rirInput: String(w.rirInput) === String(v) ? '' : String(v) } });
  },
  // El campo de peso/reps es UNO por ejercicio (no por serie): se precarga
  // con el último peso conocido y se puede ajustar antes de marcar cada
  // serie (data-f="workout.weightInput"/"workout.repsInput", el setPath
  // genérico de router.js ya sabe fusionar 2 niveles) — así "Modo
  // entrenamiento" registra lo que de verdad se levantó, no solo un check,
  // sin necesitar un formulario por serie.
  toggleSet: async setNum => {
    const w = state.workout;
    if (!w) return;
    const num = Number(setNum); // data-v siempre llega como string
    const key = w.index;
    const current = new Set(w.doneSets[key] instanceof Set ? w.doneSets[key] : []);
    const marking = !current.has(num); // true = se está marcando, false = desmarcando
    if (marking) current.add(num); else current.delete(num);
    setState({ workout: { ...w, doneSets: { ...w.doneSets, [key]: current } } });
    // Descanso después de CADA serie que se marca (no al desmarcarla) — con
    // el descanso propio de ESE ejercicio (rest_seconds), ya no 60s fijos.
    if (marking) {
      const ex = w.exercises[key] || {};
      const weightKg = w.weightInput !== '' && w.weightInput != null ? Number(w.weightInput) : null;
      const repsNum = w.repsInput !== '' && w.repsInput != null ? Number(w.repsInput) : null;
      const rir = w.rirInput !== '' && w.rirInput != null ? Number(w.rirInput) : null;
      const logName = cleanExName(ex);
      try {
        await BolaAPI.workouts.logSet(w.sessionId, state.myClient.id, logName, num, repsNum, weightKg, rir);
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        queueAction('workoutLogSet', { sessionId: w.sessionId, clientUserId: state.myClient.id, exerciseName: logName, setNumber: num, reps: repsNum, weightKg, rir });
        setState({ pendingSyncCount: getQueueSize() });
      }
      ACTIONS.startRest(ex.restSeconds);
    }
  },
  toggleSimpleDone: async () => {
    const w = state.workout;
    if (!w) return;
    const key = w.index;
    const wasDone = w.doneSets[key] === true;
    setState({ workout: { ...w, doneSets: { ...w.doneSets, [key]: !wasDone } } });
    if (!wasDone) {
      const ex = w.exercises[key] || {};
      const weightKg = w.weightInput !== '' && w.weightInput != null ? Number(w.weightInput) : null;
      const rir = w.rirInput !== '' && w.rirInput != null ? Number(w.rirInput) : null;
      const logName = cleanExName(ex);
      try {
        await BolaAPI.workouts.logSet(w.sessionId, state.myClient.id, logName, 1, null, weightKg, rir);
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        queueAction('workoutLogSet', { sessionId: w.sessionId, clientUserId: state.myClient.id, exerciseName: logName, setNumber: 1, reps: null, weightKg, rir });
        setState({ pendingSyncCount: getQueueSize() });
      }
    }
  },
  startRest: seconds => {
    clearRestTimer();
    const w = state.workout;
    if (!w) return;
    const secs = Number(seconds) || 60;
    setState({ workout: { ...w, restSecondsLeft: secs } });
    restTimerId = setInterval(() => {
      const cur = state.workout;
      if (!cur || cur.restSecondsLeft <= 1) {
        clearRestTimer();
        if (cur) setState({ workout: { ...cur, restSecondsLeft: 0 } });
        return;
      }
      setState({ workout: { ...cur, restSecondsLeft: cur.restSecondsLeft - 1 } });
    }, 1000);
  },
  skipRest: () => {
    clearRestTimer();
    const w = state.workout;
    if (w) setState({ workout: { ...w, restSecondsLeft: 0 } });
  },
  nextExercise: async () => {
    const w = state.workout;
    if (!w) return;
    clearRestTimer();
    if (w.index + 1 >= w.exercises.length) {
      try {
        await BolaAPI.workouts.finish(w.sessionId, state.myClient.id);
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        // finish_workout_session() corre DESPUÉS de workoutStart y de
        // cada workoutLogSet en la cola (mismo orden en que se encolaron),
        // así que cuando por fin haya señal, la sesión y sus series ya van
        // a existir para cuando le toque el turno a esto — ver flushQueue.
        queueAction('workoutFinish', { sessionId: w.sessionId, clientUserId: state.myClient.id });
        setState({ pendingSyncCount: getQueueSize() });
      }
      // Refresca lo que "Progreso"/"Logros" muestran, para que al volver ya
      // reflejen este entrenamiento recién cerrado sin recargar toda la
      // app — si esto falla por red, se deja lo que ya había en memoria
      // (se van a poner al día solos la próxima vez que carguen bien,
      // p. ej. porque evaluate_achievements() corre server-side recién
      // cuando finish_workout_session() se termine de sincronizar).
      let personalRecords = state.personalRecords, workoutsThisMonth = state.workoutsThisMonth, myAchievements = state.myAchievements;
      try {
        [personalRecords, workoutsThisMonth, myAchievements] = await Promise.all([
          BolaAPI.workouts.getPersonalRecords(state.myClient.id),
          BolaAPI.workouts.countThisMonth(state.myClient.id),
          BolaAPI.achievements.listForClient(state.myClient.id),
        ]);
      } catch (err) {
        if (!isNetworkError(err)) throw err;
      }
      // Fase 10 — la rutina del motor se adapta sola con lo que se acaba de
      // entrenar (pesos objetivo, rotar estancados). Best-effort.
      const adapt = await adaptRoutineNow(w);
      setState({
        workout: { ...w, finished: true, restSecondsLeft: 0, adaptSummary: (adapt && adapt.summary) || [] },
        personalRecords, workoutsThisMonth, myAchievements,
        aiRoutine: (adapt && adapt.updatedRoutine) || state.aiRoutine,
      });
    } else {
      const next = w.exercises[w.index + 1] || {};
      setState({ workout: { ...w, index: w.index + 1, restSecondsLeft: 0, weightInput: precargaWeight(next), repsInput: defaultReps(next), rirInput: '' } });
    }
  },
  prevExercise: () => {
    const w = state.workout;
    if (!w || w.index === 0) return;
    clearRestTimer();
    const prev = w.exercises[w.index - 1] || {};
    setState({ workout: { ...w, index: w.index - 1, restSecondsLeft: 0, weightInput: precargaWeight(prev), repsInput: defaultReps(prev), rirInput: '' } });
  },
  exitWorkout: () => {
    clearRestTimer();
    setState({ screen: 'clientHome', workout: null });
  },

  /* ---- Etapa 2: reservas de clases ---- */
  selectReservasDay: day => setState({ reservasSelectedDay: Number(day) }),
  bookClass: async sessionId => {
    setState({ busy: true, error: '' });
    try {
      await BolaAPI.classes.book(sessionId);
      const myBookings = await BolaAPI.classes.listMyBookings(state.myClient.id);
      setState({ busy: false, myBookings });
    } catch (e) {
      setState({ busy: false, error: friendlyError(e) });
    }
  },
  cancelBooking: async bookingId => {
    setState({ busy: true, error: '' });
    try {
      await BolaAPI.classes.cancelBooking(bookingId);
      const myBookings = await BolaAPI.classes.listMyBookings(state.myClient.id);
      setState({ busy: false, myBookings });
    } catch (e) {
      setState({ busy: false, error: friendlyError(e) });
    }
  },

  /* ---- Editar perfil (Perfil del cliente) — antes foto/peso/altura/edad/
     nivel/objetivo/plan quedaban fijos para siempre, seteados una sola vez
     en el registro. ---- */
  openEditProfile: () => {
    const client = state.myClient;
    setState({
      screen: 'clientEditProfile',
      editProfileDraft: {
        weight: client.physical.weight != null ? String(client.physical.weight) : '',
        height: client.physical.height != null ? String(client.physical.height) : '',
        age: client.physical.age != null ? String(client.physical.age) : '',
        level: client.physical.level || 'principiante', goal: client.physical.goal || 'perder_peso',
        photoFile: null, photoPreviewUrl: '',
      },
      editProfileSelectedPlanId: client.planId,
    });
  },
  closeEditProfile: () => setState({ screen: 'clientHome', clientTab: 'perfil' }),
  setEditLevel: v => setState({ editProfileDraft: { ...state.editProfileDraft, level: v } }),
  setEditGoal: v => setState({ editProfileDraft: { ...state.editProfileDraft, goal: v } }),
  selectEditPlan: v => setState({ editProfileSelectedPlanId: v }),
  saveEditProfile: async () => {
    setState({ busy: true, error: '' });
    const d = state.editProfileDraft;
    try {
      if (d.photoFile) {
        const path = BolaAPI.photos.facePath(state.gym.id, state.myProfile.id);
        await BolaAPI.photos.upload(path, d.photoFile);
        await BolaAPI.clients.setFacePhotoKey(state.myProfile.id, path);
      }
      await BolaAPI.clients.updatePhysical(state.myProfile.id, {
        weight: d.weight ? Number(d.weight) : null, height: d.height ? Number(d.height) : null, age: d.age ? Number(d.age) : null,
        level: d.level, goal: d.goal,
      });
      // El plan solo se toca si de verdad cambió — createCashCharge()
      // vuelve a leer el plan actual del cliente cada vez que el staff
      // genera un cobro nuevo, así que esto ya alcanza para que el
      // próximo cobro salga con el precio/duración del plan elegido acá.
      if (state.editProfileSelectedPlanId && state.editProfileSelectedPlanId !== state.myClient.planId) {
        await BolaAPI.clients.choosePlan(state.myProfile.id, state.editProfileSelectedPlanId);
      }
      const [client] = await attachFaceUrls([await BolaAPI.clients.getSelf(state.myProfile.id)]);
      const myClientPlan = state.plans.find(p => p.id === client.planId) || null;
      setState({
        busy: false, myClient: client, myClientPlan, screen: 'clientHome', clientTab: 'perfil',
        editProfileDraft: { ...d, photoFile: null, photoPreviewUrl: '' },
      });
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
    }
  },

  /* ---- Etapa 2: medidas corporales (Progreso) ---- */
  saveMeasurement: async () => {
    const d = state.measurementDraft;
    const values = {
      weight_kg: d.weight_kg ? Number(d.weight_kg) : null,
      body_fat_pct: d.body_fat_pct ? Number(d.body_fat_pct) : null,
      waist_cm: d.waist_cm ? Number(d.waist_cm) : null,
      chest_cm: d.chest_cm ? Number(d.chest_cm) : null,
      arm_cm: d.arm_cm ? Number(d.arm_cm) : null,
      thigh_cm: d.thigh_cm ? Number(d.thigh_cm) : null,
    };
    await BolaAPI.measurements.recordToday(state.myClient.id, values);
    const bodyMeasurements = await BolaAPI.measurements.listForClient(state.myClient.id);
    setState({ bodyMeasurements, measurementDraft: { weight_kg: '', body_fat_pct: '', waist_cm: '', chest_cm: '', arm_cm: '', thigh_cm: '' } });
  },

  /* ---- Etapa 2: calificar a mi entrenador (Perfil) ---- */
  setTrainerRatingStars: n => setState({ trainerRatingDraft: { ...state.trainerRatingDraft, rating: Number(n) } }),
  saveTrainerRating: async () => {
    if (!state.myClientTrainer || !state.trainerRatingDraft.rating) return;
    await BolaAPI.trainerReviews.rate(state.myClientTrainer.id, state.trainerRatingDraft.rating, state.trainerRatingDraft.text.trim());
    const myTrainerRating = (await BolaAPI.trainerReviews.listForTrainer(state.myClientTrainer.id)).find(r => r.client_user_id === state.myClient.id) || null;
    setState({ myTrainerRating });
  },

  /* ---- Etapa 2: mensajes con mi entrenador (Perfil) ---- */
  openTrainerChat: async () => {
    if (!state.myClientTrainer) return;
    const conversationId = await BolaAPI.messages.getOrCreateConversation(state.myClientTrainer.id);
    const messages = await BolaAPI.messages.list(conversationId);
    setState({ screen: 'clientChat', conversationId, messages });
    // Le llega el mensaje del entrenador mientras tiene el chat abierto, sin
    // recargar ni volver a entrar.
    watchChat(conversationId, refreshClientChatMessages);
  },
  closeTrainerChat: () => { stopWatchingChat(); setState({ screen: 'clientHome' }); },
  sendMessage: async () => {
    const text = state.messageDraft.trim();
    if (!text || !state.conversationId) return;
    await BolaAPI.messages.send(state.conversationId, text);
    const messages = await BolaAPI.messages.list(state.conversationId);
    setState({ messages, messageDraft: '' });
  },

  addProgress: async () => {
    const row = await BolaAPI.progress.ensureToday(state.myClient.id);
    const already = state.progressList.some(p => p.id === row.id);
    const progressList = already ? state.progressList : [{ ...row, url: null }, ...state.progressList];
    setState({ progressList });
  },

  setStarRating: v => setState({ newCommentRating: Number(v) }),
  addComment: async () => {
    const text = state.newCommentText.trim();
    if (!text) return;
    await BolaAPI.reviews.add(state.gym.id, state.myClient.id, state.newCommentRating, text);
    const reviews = await BolaAPI.reviews.listForGym(state.gym.id);
    setState({ reviews, newCommentText: '', newCommentRating: 5 });
  },

  pickPhoto: v => openPhotoPicker(v),

  /* ---- trainer auth ---- */
  // Fase 16: mismo cambio que adminSignUp — solo por link, ya no cae al
  // selector público de gimnasios.
  trainerSignUp: async () => {
    setState({ busy: true, error: '' });
    const r = state.trainerReg;
    const result = await BolaAPI.auth.signUpTrainer({ ...r, phone: r.phonePrefix + r.phone });
    if (!result || !result.session) {
      goToConfirmCode((result && result.user && result.user.email) || normalizeEmailLocal(r.email), 'trainer');
      return;
    }
    await continueAfterEmailConfirmed('trainer');
  },
  /* ---- trainer dashboard ---- */
  trainerTab: v => setState({ trainerTab: v }),
  setTrainerSelectedDay: day => setState({ trainerSelectedDay: Number(day) }),
  openClientDetail: async clientId => {
    const emptyDraft = { exerciseId: '', text: '', sets: '', reps: '', weightKg: '', restSeconds: '60' };
    setState({ trainerSelectedClientId: clientId, trainerRoutineDraft: emptyDraft });
    const selected = (state.trainerClients || []).find(c => c.id === clientId);
    const goal = (selected && selected.physical && selected.physical.goal) || 'perder_peso';
    const [progressRaw, routine, measurements, prs, trainingProfile, engineRoutine, limitations] = await Promise.all([
      BolaAPI.progress.listForClient(clientId),
      BolaAPI.routines.getTrainer(clientId),
      BolaAPI.measurements.listForClient(clientId),
      BolaAPI.workouts.getPersonalRecords(clientId),
      // Fase 11 — perfil de evaluación (solo lectura, RLS "trainer read-only")
      BolaAPI.trainingProfile.get(clientId).catch(() => null),
      BolaAPI.routines.getAi(clientId, goal).catch(() => ({ id: null, exercises: [] })),
      BolaAPI.trainingProfile.listLimitations(clientId).catch(() => []),
    ]);
    const progress = await attachSignedUrls(progressRaw);
    setState({ trainerSelectedClientDetail: { progress, routine, measurements, prs, trainingProfile, engineRoutine, limitations } });
  },
  closeClientDetail: () => setState({ trainerSelectedClientId: null, trainerSelectedClientDetail: null }),

  // Fase 11 — el entrenador copia la rutina que el motor le generó al
  // cliente a SU rutina ('trainer'), para editarla como propia. Reemplaza la
  // rutina de entrenador actual (mismo criterio que aplicar un programa).
  adoptAiRoutine: async () => {
    const clientId = state.trainerSelectedClientId;
    if (!clientId) return;
    setState({ busy: true, error: '' });
    try {
      await BolaAPI.routines.adoptAiIntoTrainer(clientId, state.myTrainer.id);
      const routine = await BolaAPI.routines.getTrainer(clientId);
      setState({ busy: false, trainerSelectedClientDetail: { ...state.trainerSelectedClientDetail, routine } });
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
    }
  },
  // Elegir un ejercicio de la biblioteca precarga su nombre en `text` (el
  // resumen de respaldo) — el entrenador puede seguir editando sets/reps/
  // peso/descanso libremente antes de agregarlo.
  selectRoutineExercise: exerciseId => {
    const ex = state.exercisesLib.find(e => e.id === exerciseId);
    setState({ trainerRoutineDraft: { ...state.trainerRoutineDraft, exerciseId, text: ex ? ex.name : '' } });
  },
  addTrainerRoutineExercise: async () => {
    const d = state.trainerRoutineDraft;
    const text = d.text.trim();
    if (!text || !state.trainerSelectedClientId) return;
    const dayOfWeek = d.dayOfWeek !== '' ? Number(d.dayOfWeek) : null;
    await BolaAPI.routines.addTrainerExercise(state.trainerSelectedClientId, state.myTrainer.id, {
      text, exerciseId: d.exerciseId || null,
      sets: d.sets ? Number(d.sets) : null, reps: d.reps ? d.reps : null,
      weightKg: d.weightKg ? Number(d.weightKg) : null, restSeconds: d.restSeconds ? Number(d.restSeconds) : 60,
      dayOfWeek, dayLabel: dayOfWeek != null ? WEEKDAY_NAMES[dayOfWeek] : null,
    });
    const routine = await BolaAPI.routines.getTrainer(state.trainerSelectedClientId);
    setState({ trainerRoutineDraft: { exerciseId: '', text: '', sets: '', reps: '', weightKg: '', restSeconds: '60', dayOfWeek: '' }, trainerSelectedClientDetail: { ...state.trainerSelectedClientDetail, routine } });
  },
  removeTrainerRoutineExercise: async exerciseId => {
    await BolaAPI.routines.removeExercise(exerciseId);
    const routine = await BolaAPI.routines.getTrainer(state.trainerSelectedClientId);
    setState({ trainerSelectedClientDetail: { ...state.trainerSelectedClientDetail, routine } });
  },

  /* ---- Rutina "Personalizada" — el cliente arma la suya (mismo patrón
     que "Crear rutina" del entrenador, de a un ejercicio, con día de la
     semana opcional para que quede semanal). ---- */
  selectPersonalRoutineExercise: exerciseId => {
    const ex = state.exercisesLib.find(e => e.id === exerciseId);
    setState({ personalRoutineDraft: { ...state.personalRoutineDraft, exerciseId, text: ex ? ex.name : '' } });
  },
  addPersonalRoutineExercise: async () => {
    const d = state.personalRoutineDraft;
    const text = d.text.trim();
    if (!text || !state.myClient) return;
    const dayOfWeek = d.dayOfWeek !== '' ? Number(d.dayOfWeek) : null;
    setState({ busy: true, error: '' });
    try {
      await BolaAPI.routines.addPersonalExercise(state.myClient.id, {
        text, exerciseId: d.exerciseId || null,
        sets: d.sets ? Number(d.sets) : null, reps: d.reps ? d.reps : null,
        weightKg: d.weightKg ? Number(d.weightKg) : null, restSeconds: d.restSeconds ? Number(d.restSeconds) : 60,
        dayOfWeek, dayLabel: dayOfWeek != null ? WEEKDAY_NAMES[dayOfWeek] : null,
      });
      const myPersonalRoutine = await BolaAPI.routines.getPersonal(state.myClient.id);
      setState({ busy: false, personalRoutineDraft: { exerciseId: '', text: '', sets: '', reps: '', weightKg: '', restSeconds: '60', dayOfWeek: '' }, myPersonalRoutine });
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
    }
  },
  removePersonalRoutineExercise: async exerciseId => {
    await BolaAPI.routines.removeExercise(exerciseId);
    const myPersonalRoutine = await BolaAPI.routines.getPersonal(state.myClient.id);
    setState({ myPersonalRoutine });
  },

  /* ---- Etapa 2: mensajes con clientes asignados ---- */
  openTrainerConversation: async clientId => {
    const conv = state.trainerConversations.find(c => c.clientId === clientId);
    if (!conv) return;
    const trainerMessages = await BolaAPI.messages.list(conv.conversationId);
    setState({ trainerActiveConversationId: conv.conversationId, trainerMessages, trainerMessageDraft: '' });
    watchChat(conv.conversationId, refreshTrainerChatMessages);
  },
  closeTrainerConversation: () => { stopWatchingChat(); setState({ trainerActiveConversationId: null, trainerMessages: [] }); },
  sendTrainerMessage: async () => {
    const text = state.trainerMessageDraft.trim();
    if (!text || !state.trainerActiveConversationId) return;
    await BolaAPI.messages.send(state.trainerActiveConversationId, text);
    const trainerMessages = await BolaAPI.messages.list(state.trainerActiveConversationId);
    setState({ trainerMessages, trainerMessageDraft: '' });
  },

  saveTrainerProfile: async () => {
    const { specialty, price } = state.trainerProfileDraft;
    await BolaAPI.trainers.updateProfile(state.myTrainer.id, { specialty: specialty.trim() || state.myTrainer.specialty, price: Number(price) || 0 });
    setState({ myTrainer: { ...state.myTrainer, specialty: specialty.trim() || state.myTrainer.specialty, price: Number(price) || 0 } });
  },

  /* ---- Etapa 2: "Biblioteca de ejercicios" (pantalla transversal #23,
     compartida por los 3 roles) ---- */
  openExerciseLibrary: () => setState({ libraryReturn: state.screen, screen: 'exerciseLibrary', libraryQuery: '', libraryMuscleFilter: 'todos', libraryLevelFilter: 'todos', libraryExpandedId: null }),
  closeExerciseLibrary: () => setState({ screen: state.libraryReturn || 'clientHome', libraryReturn: null }),
  setLibraryMuscleFilter: v => setState({ libraryMuscleFilter: v }),
  setLibraryLevelFilter: v => setState({ libraryLevelFilter: v }),
  openLibraryDetail: id => setState({ libraryExpandedId: id }),
  closeLibraryDetail: () => setState({ libraryExpandedId: null }),
  addLibraryExercise: async () => {
    const d = state.libraryDraft;
    if (!d.name.trim()) return;
    setState({ busy: true, error: '' });
    try {
      await BolaAPI.exercisesLib.add(state.gym.id, { name: d.name.trim(), muscleGroup: d.muscleGroup.trim() || 'General', equipmentName: d.equipmentName.trim(), description: d.description.trim() });
      const exercisesLib = await BolaAPI.exercisesLib.list(state.gym.id);
      setState({ busy: false, exercisesLib, libraryDraft: { name: '', muscleGroup: '', equipmentName: '', description: '' } });
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
    }
  },

  /* ---- Programas de entrenamiento (plantillas — ver
     supabase/migrations/20260908000300_program_templates.sql). Mismo
     screen para los 3 roles; `context` distingue "solo mirar" (null,
     cliente/entrenador consultando) de "elegir uno para armar la rutina de
     este cliente" ('trainer', abierto desde "Crear rutina"). ---- */
  openProgramTemplates: context => setState({ programReturn: state.screen, screen: 'programTemplates', programExpandedId: null, programApplyContext: context || null }),
  closeProgramTemplates: () => setState({ screen: state.programReturn || 'clientHome', programReturn: null, programApplyContext: null }),
  openProgramDetail: id => setState({ programExpandedId: id }),
  closeProgramDetail: () => setState({ programExpandedId: null }),
  applyProgramTemplate: async programId => {
    if (state.programApplyContext !== 'trainer' || !state.trainerSelectedClientId || !state.myTrainer) return;
    const items = state.programTemplateItems
      .filter(it => it.programId === programId)
      .sort((a, b) => (a.dayPosition - b.dayPosition) || (a.position - b.position))
      .map(it => ({ dayLabel: it.dayLabel, exerciseId: it.exerciseId, exerciseName: it.exerciseName, sets: it.sets, reps: it.reps, restSeconds: it.restSeconds }));
    if (!items.length) return;
    setState({ busy: true, error: '' });
    try {
      await BolaAPI.routines.applyProgramTemplate(state.trainerSelectedClientId, state.myTrainer.id, items);
      const routine = await BolaAPI.routines.getTrainer(state.trainerSelectedClientId);
      setState({
        busy: false, screen: state.programReturn || 'trainerDash', programReturn: null, programApplyContext: null, programExpandedId: null,
        trainerSelectedClientDetail: { ...state.trainerSelectedClientDetail, routine },
      });
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
    }
  },

  /* ---- Calendario de eventos (dueño/admin) — crean clase+sesión de una
     vez y ven quién reservó cada una. Reserva en sí la sigue haciendo el
     cliente desde su tab "Reservas" (book_class, ya existía); esto es solo
     la mitad que faltaba: crear el evento y ver las reservas hechas. ---- */
  openOwnerCalendar: () => setState({ ownerCalendarReturn: state.screen, screen: 'ownerCalendar', ownerCalendarSelectedDay: null, showEventForm: false }),
  closeOwnerCalendar: () => setState({ screen: state.ownerCalendarReturn || 'ownerDash', ownerCalendarReturn: null }),
  selectOwnerCalendarDay: day => setState({ ownerCalendarSelectedDay: day }),
  toggleEventForm: () => setState({ showEventForm: !state.showEventForm, error: '' }),
  createEvent: async () => {
    const d = state.eventDraft;
    const name = d.name.trim();
    if (!name || !d.date || !d.time) { setState({ error: 'Completá el nombre, la fecha y la hora.' }); return; }
    const startsAtIso = new Date(`${d.date}T${d.time}`).toISOString();
    const price = d.price.trim() ? Number(d.price) : null;
    setState({ busy: true, error: '' });
    try {
      const sessionId = await BolaAPI.classes.createEvent(state.gym.id, {
        name, description: d.description.trim() || null, trainerUserId: d.trainerUserId || null,
        durationMinutes: Number(d.durationMinutes) || 60, capacity: Number(d.capacity) || 20, price, startsAtIso,
      });
      const [classesForGym, classSessions] = await Promise.all([
        BolaAPI.classes.listForGym(state.gym.id),
        BolaAPI.classes.listSessions(state.gym.id),
      ]);
      // Le llega a todos los socios del gimnasio (notify_gym_clients, ver
      // migración) — si falla (por ejemplo sin señal) el evento ya quedó
      // creado igual, así que no lo tratamos como error bloqueante.
      const body = `${formatDate(d.date)} a las ${d.time}${price ? ` · ${money(price)}` : ''}${d.description.trim() ? ` — ${d.description.trim()}` : ''}`;
      try {
        await BolaAPI.notifications.notifyGymClients(`Nuevo evento: ${name}`, body, 'event_created', sessionId);
      } catch (err) {
        if (!isNetworkError(err)) throw err;
      }
      setState({
        busy: false, classesForGym, classSessions, showEventForm: false,
        eventDraft: { name: '', description: '', trainerUserId: '', date: '', time: '', durationMinutes: '60', capacity: '20', price: '' },
      });
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
    }
  },
  /* ---- Logros — filtro por categoría y, en fuerza/cardio, por ejercicio
     (ver viewClientLogros en client.js). ---- */
  setLogrosCategory: cat => setState({ logrosCategoryFilter: cat, logrosExerciseFilter: null }),
  setLogrosExercise: name => setState({ logrosExerciseFilter: name || null }),

  removeEvent: async sessionId => {
    setState({ busy: true, error: '' });
    try {
      await BolaAPI.classes.removeSession(sessionId);
      const [classesForGym, classSessions, classBookingsForGym] = await Promise.all([
        BolaAPI.classes.listForGym(state.gym.id),
        BolaAPI.classes.listSessions(state.gym.id),
        BolaAPI.classes.listBookingsForGym(state.gym.id),
      ]);
      setState({ busy: false, classesForGym, classSessions, classBookingsForGym });
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
    }
  },

  /* ---- Notificaciones del cliente (dueño/admin le avisa de un evento
     nuevo — ver notify_gym_clients() y ACTIONS.createEvent). ---- */
  openNotifications: () => setState({ notificationsReturn: state.screen, screen: 'notifications' }),
  closeNotifications: () => setState({ screen: state.notificationsReturn || 'clientHome', notificationsReturn: null }),
  markNotificationRead: async notificationId => {
    const n = state.notifications.find(x => x.id === notificationId);
    if (!n || n.readAt) return;
    // Optimista: se ve leída al toque, sin esperar la vuelta del servidor.
    setState({ notifications: state.notifications.map(x => x.id === notificationId ? { ...x, readAt: new Date().toISOString() } : x) });
    try {
      await BolaAPI.notifications.markRead(notificationId);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  },

  /* ---- Notificaciones del staff (dirección contraria: el cliente confirma
     su propio pago escaneando el QR del mostrador -> le llega a dueño y
     admins quién generó el cobro y hasta cuándo es válido, ver
     confirm_cash_payment()). ---- */
  openStaffNotifications: () => setState({ staffNotificationsReturn: state.screen, screen: 'staffNotifications' }),
  closeStaffNotifications: () => setState({ screen: state.staffNotificationsReturn || 'ownerDash', staffNotificationsReturn: null }),
  markStaffNotificationRead: async notificationId => {
    const n = state.staffNotifications.find(x => x.id === notificationId);
    if (!n || n.readAt) return;
    setState({ staffNotifications: state.staffNotifications.map(x => x.id === notificationId ? { ...x, readAt: new Date().toISOString() } : x) });
    try {
      await BolaAPI.notifications.markStaffRead(notificationId);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  },
};

/* ============================ screen-entry helpers ============================ */
// Cada una de estas junta los datos que la pantalla necesita ANTES de
// cambiar `screen`, así las funciones de vista no tienen que lidiar con
// datos a medio cargar.

// Rutea después de ACTIONS.login (Etapa 1) según el rol que ya trae la
// cuenta — el reemplazo de tener 4 acciones de sign-in casi idénticas, cada
// una comprobando "¿sos vos, dueño/admin/cliente/entrenador?" a mano. Cada
// rama reutiliza exactamente la misma función de reanudación que ya usaba
// su propio sign-in, así que el comportamiento (incluyendo los flujos
// interrumpidos por confirmación de correo) no cambia, solo cómo se llega.
export async function routeAfterLogin(profile) {
  state.myProfile = profile;
  // Rol dedicado, sin gimnasio — entra directo a su propio panel, ver
  // supabase/migrations/20260905000500_platform_admin_role.sql.
  if (profile.role === 'platform_admin') { await enterPlatformDash(); return; }
  if (profile.role === 'owner') { await resumeOwnerSession(profile); return; }
  if (profile.role === 'admin') { await resumeAdminSession(profile); return; }
  if (profile.role === 'client') { await resumeClientSession(profile); return; }
  if (profile.role === 'trainer') {
    if (!profile.gym_id) { await loadGymPicker('trainerResume'); return; }
    await continueTrainerSignIn(profile);
    return;
  }
  // No debería pasar — todo profile real tiene uno de los 5 roles — pero
  // ante un dato inesperado, no dejar a nadie logueado sin panel a donde ir.
  await BolaAPI.auth.signOut();
  setState({ busy: false, screen: 'login', loginError: 'No pudimos identificar el rol de esta cuenta.' });
}

// Reanuda la sesión de un dueño ya logueado. Si se quedó a mitad del
// asistente (tiene cuenta pero nunca llamó a create_gym), lo manda al paso
// del gimnasio en vez de a un panel que no puede existir sin gym_id.
export async function resumeOwnerSession(profile) {
  if (!profile.gym_id) {
    setState({
      screen: 'ownerReg2', busy: false,
      ownerReg: { name: profile.name, email: (profile.email || '').replace(/@gmail\.com$/i, ''), ...splitPhone(profile.phone), password: '' },
    });
    return;
  }
  state.gym = (await loadWithFallback(`gym:${profile.gym_id}`, () => BolaAPI.gyms.get(profile.gym_id))).data;
  await enterOwnerDash();
}

// Reanuda la sesión de un administrador ya logueado — mismo patrón que un
// entrenador: si no tiene gym_id todavía, el join quedó interrumpido por la
// confirmación de correo; si ya tiene gym_id, revisa su status en gym_admins.
export async function resumeAdminSession(profile) {
  if (!profile.gym_id) {
    await loadGymPicker('adminResume');
    return;
  }
  await continueAdminSignIn(profile);
}

// Igual que arriba pero para cliente. gym_id normalmente ya está seteado
// (se une al gimnasio justo después de crear la cuenta, ver clientSignUp),
// salvo que el signUp haya quedado interrumpido por la confirmación de
// correo — ahí el join nunca se ejecutó, y hay que elegir gimnasio acá.
// plan_id puede faltar si no llegó al paso 3.
export async function resumeClientSession(profile) {
  if (!profile.gym_id) {
    await loadGymPicker('clientResume');
    return;
  }
  await continueClientResume(profile);
}

export async function continueClientResume(profile) {
  state.gym = (await loadWithFallback(`gym:${profile.gym_id}`, () => BolaAPI.gyms.get(profile.gym_id))).data;
  // loadWithFallback y no un fetch directo: alguien que ya se registró del
  // todo (el caso normal de "abrir la app de nuevo") casi nunca cambia
  // facePhotoKey/planId, así que una copia de la última vez alcanza para
  // decidir el mismo "seguí a Inicio" sin depender de que haya señal justo
  // en este primer instante de abrir la app.
  const client = (await loadWithFallback(`clientSelf:${profile.id}`, () => BolaAPI.clients.getSelf(profile.id))).data;
  if (!client.facePhotoKey) {
    // El alta original quedó interrumpida antes de subir la foto (ver
    // ACTIONS.confirmRequiredFacePhoto) — es obligatoria, así que se pide
    // acá antes de seguir, sin importar en qué paso haya quedado el resto.
    setState({
      screen: 'clientPhotoRequired', busy: false,
      clientReg: { ...state.clientReg, photoFile: null, photoPreviewUrl: null },
    });
    return;
  }
  await continueAfterFacePhoto(client);
}

export async function continueAfterFacePhoto(client) {
  const c = client || await BolaAPI.clients.getSelf(state.myProfile.id);
  if (!c.planId) {
    const plans = await BolaAPI.plans.list(state.gym.id);
    setState({ screen: 'clientReg3', busy: false, plans });
    return;
  }
  await enterClientHome();
}

// Qué sigue apenas hay sesión confirmada — sea porque signUp() la dio
// directo (proyecto sin "Confirm email") o porque se acaba de verificar el
// código de la pantalla confirmCode (ver ACTIONS.verifyConfirmCode). Un
// solo lugar para las 4 ramas por rol, para no duplicar (ni desincronizar)
// el "qué sigue" entre el caso con sesión inmediata y el caso confirmado
// por código.
async function continueAfterEmailConfirmed(role) {
  if (role === 'owner') {
    // viewOwnerDash necesita myProfile.role para decidir si muestra la tab
    // de aprobar administradores — se setea acá, no solo al final del
    // asistente, para que esté disponible durante todo el registro.
    const profile = await BolaAPI.auth.getMyProfile();
    setState({ busy: false, screen: 'ownerReg2', myProfile: profile });
    return;
  }
  if (role === 'admin') {
    if (await tryJoinViaGymInvite('adminSignUp', 'admin')) return;
    setState({ busy: false, error: 'Necesitás un link de invitación de administrador de un gimnasio para registrarte — pedíselo al dueño.' });
    return;
  }
  if (role === 'trainer') {
    if (await tryJoinViaGymInvite('trainerSignUp', 'trainer')) return;
    setState({ busy: false, error: 'Necesitás un link de invitación de entrenador de un gimnasio para registrarte — pedíselo al dueño o a un administrador.' });
    return;
  }
  // 'client': si llegó desde un link/QR de invitación (?invite=XXXXX) de
  // rol cliente, se une directo a ESE gimnasio sin pasar por el selector
  // manual. Cualquier problema (código de otro rol, ya no válido, etc.) cae
  // al selector de siempre — nunca deja a alguien varado por un link roto.
  if (await tryJoinViaGymInvite('clientSignUp', 'client')) return;
  await loadGymPicker('clientSignUp');
}

// Intenta unirse directo al gimnasio/rol resuelto en el arranque (ver
// router.js resolveGymInviteFromUrl), sin pasar por el selector manual. Ya
// no vuelve a pegarle al servidor para resolver el código — eso ya pasó
// antes del primer render — solo usa lo que quedó en
// state.inviteGym/inviteRole. `expectedRole` deja afuera un link de otro
// rol (ej. alguien abre un link de entrenador pero se registró como
// cliente) — cae al llamador de siempre en ese caso. Devuelve true si se
// unió (y ya avanzó a la pantalla que corresponde), false si no había
// invitación válida para este rol o falló el join — en cuyo caso el
// llamador decide qué hacer (cliente cae al selector manual; admin/
// entrenador ya no tienen ese selector, ver ACTIONS.adminSignUp/trainerSignUp).
async function tryJoinViaGymInvite(next, expectedRole) {
  if (!state.inviteGym || state.inviteRole !== expectedRole) return false;
  try {
    await BolaAPI.gyms.join(state.inviteGym.id);
    try { localStorage.removeItem(GYM_INVITE_KEY); } catch (_) {}
    if (next === 'clientSignUp') await continueClientSignUpAfterGym(state.inviteGym);
    else if (next === 'adminSignUp') await continueAdminSignUpAfterGym();
    else if (next === 'trainerSignUp') continueTrainerSignUpAfterGym();
    return true;
  } catch (err) {
    console.error('No se pudo unir por link de invitación:', err);
    return false;
  }
}

// Trae la lista de gimnasios y muestra la pantalla de selección. `next`
// identifica qué flujo retomar una vez que el usuario elija uno y confirme
// — ver ACTIONS.confirmGymAndJoin.
export async function loadGymPicker(next) {
  const gymList = await BolaAPI.gyms.listAll();
  setState({ gymList, selectedGymId: null, gymPickerNext: next, screen: 'gymPicker', busy: false, error: '' });
}

export async function continueClientSignUpAfterGym(gym) {
  const c = state.clientReg;
  const profile = await BolaAPI.auth.getMyProfile();
  const path = BolaAPI.photos.facePath(gym.id, profile.id);
  await BolaAPI.photos.upload(path, c.photoFile);
  await BolaAPI.clients.setFacePhotoKey(profile.id, path);
  const plans = await BolaAPI.plans.list(gym.id);
  setState({ busy: false, myProfile: profile, gym, plans, screen: 'clientReg2' });
}

// El link de invitación de administrador que se acaba de usar (ver
// tryJoinViaGymInvite) ES la aprobación del dueño (join_gym() ya deja
// gym_admins.status='approved' para este caso, ver la migración
// 20260908000000_admin_auto_approve.sql) — así que en vez de forzar la
// pantalla de "pendiente" a ciegas como antes, se reusa el mismo chequeo
// de estado que ya hacía el login (continueAdminSignIn) para que ambos
// caminos entren directo al panel cuando corresponde.
export async function continueAdminSignUpAfterGym() {
  setState({ adminReg: { name: '', email: '', phone: '', phonePrefix: '+53', password: '' } });
  const profile = await BolaAPI.auth.getMyProfile();
  await continueAdminSignIn(profile);
}

export async function continueAdminSignIn(profile) {
  // El gimnasio en sí (nombre/dirección) se puede cachear sin riesgo, pero
  // OJO: gymAdminsForGym de la línea siguiente NO pasa por loadWithFallback
  // a propósito — es el chequeo de "¿ya me aprobaron?" y usar una copia
  // vieja ahí podría dejar entrar a alguien pendiente/rechazado, o al
  // revés, trabar a alguien ya aprobado. Ese sí necesita señal de verdad.
  const gym = (await loadWithFallback(`gym:${profile.gym_id}`, () => BolaAPI.gyms.get(profile.gym_id))).data;
  const gymAdminsForGym = await BolaAPI.admins.listForGym(gym.id);
  const myEntry = gymAdminsForGym.find(a => a.id === profile.id);
  if (!myEntry || myEntry.status === 'pending') {
    setState({ busy: false, screen: 'adminPending', pendingAdminName: profile.name, myProfile: profile });
    return;
  }
  if (myEntry.status === 'rejected') {
    await BolaAPI.auth.signOut();
    setState({ busy: false, screen: 'login', loginError: 'Tu solicitud fue rechazada. Contacta al dueño del gimnasio.' });
    return;
  }
  state.myProfile = profile;
  state.gym = gym;
  await enterOwnerDash();
}

export function continueTrainerSignUpAfterGym() {
  const r = state.trainerReg;
  setState({
    busy: false, screen: 'trainerPending', pendingTrainerName: r.name,
    trainerReg: { name: '', email: '', phone: '', phonePrefix: '+53', password: '', specialty: '', price: '' },
  });
}

export async function continueTrainerSignIn(profile) {
  const gym = await BolaAPI.gyms.get(profile.gym_id);
  const trainersForGym = await BolaAPI.trainers.listForGym(gym.id);
  const myTrainer = trainersForGym.find(t => t.id === profile.id);
  if (!myTrainer || myTrainer.status === 'pending') {
    setState({ busy: false, screen: 'trainerPending', pendingTrainerName: profile.name, myProfile: profile });
    return;
  }
  if (myTrainer.status === 'rejected') {
    await BolaAPI.auth.signOut();
    setState({ busy: false, screen: 'login', loginError: 'Tu solicitud fue rechazada. Contacta al administrador.' });
    return;
  }
  await enterTrainerDash(profile, gym, myTrainer);
}

// Callback de src/qr.js cuando la cámara de la pantalla "Escanear QR" lee
// un código — llamado directo por router.js (no pasa por el dispatcher de
// data-a porque no lo dispara un click, lo dispara un frame de video). Las
// validaciones de acá (payload bien formado, mismo gimnasio, cliente
// existente) son solo para dar un mensaje claro en pantalla — la que de
// verdad importa es la de siempre: check_in_client() exige
// app_role_is_staff() del lado del servidor, así que aunque alguien
// fabricara un QR a mano con el user_id de otro gimnasio, el RPC lo
// rechaza igual (gym_id se deriva de auth.uid(), nunca del texto leído).
export async function handleCheckinScan(payload) {
  let data;
  try { data = JSON.parse(payload); } catch (_) { data = null; }
  if (!data || data.t !== 'checkin' || !data.u) {
    setState({ scanStatus: { ok: false, text: 'Ese código no es un QR de check-in de Fight Club Gym Manager.' } });
    return;
  }
  if (data.gym !== state.gym.id) {
    setState({ scanStatus: { ok: false, text: 'Ese código es de otro gimnasio.' } });
    return;
  }
  const client = state.clientsForGym.find(c => c.id === data.u);
  if (!client) {
    setState({ scanStatus: { ok: false, text: 'No encontramos a ese cliente en tu gimnasio.' } });
    return;
  }
  if (state.todayCheckins.some(chk => chk.client_user_id === client.id)) {
    setState({ scanStatus: { ok: true, text: `${client.name} ya tiene el check-in de hoy registrado.` } });
    return;
  }
  try {
    const row = await BolaAPI.checkins.checkIn(client.id);
    const todayCheckins = await BolaAPI.checkins.listTodayForGym(state.gym.id);
    if (navigator.vibrate) { try { navigator.vibrate(80); } catch (_) { /* no disponible, no es crítico */ } }
    setState({ todayCheckins, attendanceEvents: [...state.attendanceEvents, { client_user_id: client.id, created_at: row.created_at }], scanStatus: { ok: true, text: `✓ ${client.name} registrado.` } });
  } catch (err) {
    if (isNetworkError(err)) {
      // El cliente y el "todavía no tiene check-in de hoy" ya se validaron
      // arriba con lo que había en memoria — se puede encolar sin riesgo.
      const nowIso = new Date().toISOString();
      queueAction('checkin', { clientUserId: client.id });
      setState({
        pendingSyncCount: getQueueSize(),
        todayCheckins: [...state.todayCheckins, { client_user_id: client.id, created_at: nowIso }],
        attendanceEvents: [...state.attendanceEvents, { client_user_id: client.id, created_at: nowIso }],
        scanStatus: { ok: true, text: `✓ ${client.name} registrado (se sincroniza solo).` },
      });
      return;
    }
    setState({ scanStatus: { ok: false, text: friendlyError(err) } });
  }
}

// Callback de src/qr.js para la pantalla "Escanear QR" del CLIENTE (ver
// viewClientScanPayment en screens/client.js) — el QR ahora solo se genera
// del lado del dueño/admin (ver viewOwnerSocios), el cliente lo escanea
// para confirmar su propio pago en vez de esperar a que el staff lo
// confirme a mano. Mismas validaciones "solo para un mensaje claro en
// pantalla" que handleCheckinScan de arriba — la que de verdad importa es
// confirm_cash_payment() en el servidor, que solo deja confirmar al staff
// o al propio dueño de ese cobro (nunca un cliente ajeno).
export async function handlePaymentScan(payload) {
  let data;
  try { data = JSON.parse(payload); } catch (_) { data = null; }
  if (!data || data.t !== 'payment' || !data.id) {
    setState({ scanStatus: { ok: false, text: 'Ese código no es un QR de cobro de Fight Club Gym Manager.' } });
    return;
  }
  try {
    const payment = await BolaAPI.payments.getById(data.id);
    if (!payment || payment.client_user_id !== state.myClient.id) {
      setState({ scanStatus: { ok: false, text: 'Ese código no es tu cobro — pedile al mostrador que te muestre el tuyo.' } });
      return;
    }
    if (payment.status !== 'pending') {
      setState({ scanStatus: { ok: false, text: 'Ese cobro ya fue confirmado antes.' } });
      return;
    }
    try {
      await BolaAPI.payments.confirm(data.id);
      const [client] = await attachFaceUrls([await BolaAPI.clients.getSelf(state.myProfile.id)]);
      if (navigator.vibrate) { try { navigator.vibrate(80); } catch (_) { /* no disponible, no es crítico */ } }
      // confirm_cash_payment() ya dejó membership_expires_at seteado según
      // el plan (diario/mensual/anual, ver la migración payment_qr_flip) —
      // se lo muestra de una para que quede claro hasta cuándo pagó, sin
      // que tenga que ir a buscarlo a otra pantalla.
      const vigencia = client.membershipExpiresAt ? ` Tu plan queda vigente hasta el ${formatDate(client.membershipExpiresAt)}.` : '';
      setState({ myClient: client, pendingPayment: null, scanStatus: { ok: true, text: `✓ Pago confirmado.${vigencia}` } });
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      // Ya se validó arriba (con señal) que es SU cobro y que sigue
      // pendiente — encolar acá no corre el riesgo de confirmar algo sin
      // haber verificado antes de qué se trata. La vigencia recién se sabe
      // cuando confirm_cash_payment() de verdad corra (con señal), así que
      // acá el mensaje se queda genérico.
      queueAction('confirmPayment', { paymentId: data.id });
      setState({ pendingSyncCount: getQueueSize(), pendingPayment: null, scanStatus: { ok: true, text: '✓ Vamos a confirmar tu pago apenas vuelva la señal.' } });
    }
  } catch (err) {
    setState({ scanStatus: { ok: false, text: friendlyError(err) } });
  }
}

// Callback de src/qr.js para la pantalla "Escanear QR" de Presencia en el
// gym (ver src/screens/presence.js) — MISMO handler tanto si escanea un
// cliente (arranca su sesión de 2h) como si escanea el staff/un entrenador
// (queda de encargado de turno): es un solo QR físico del gimnasio, y
// scan_gym_qr() en el servidor decide qué rama corre según app_role() de
// quien llama, nunca según lo que vino en el texto del QR (mismo criterio
// que handleCheckinScan/handlePaymentScan arriba). Las validaciones de acá
// (JSON bien formado, mismo gimnasio) son solo para un mensaje claro en
// pantalla — el gimnasio real que usa el RPC es siempre app_gym_id() del
// que escanea, nunca el `gym` del payload.
export async function handleGymPresenceScan(payload) {
  let data;
  try { data = JSON.parse(payload); } catch (_) { data = null; }
  if (!data || data.t !== 'gym_presence' || !data.gym) {
    setState({ scanStatus: { ok: false, text: 'Ese código no es el QR de acceso de este gimnasio.' } });
    return;
  }
  if (data.gym !== state.gym.id) {
    setState({ scanStatus: { ok: false, text: 'Ese código es de otro gimnasio.' } });
    return;
  }
  try {
    const result = await BolaAPI.gymPresence.scan();
    if (navigator.vibrate) { try { navigator.vibrate(80); } catch (_) { /* no disponible, no es crítico */ } }
    if (result.kind === 'encargado') {
      const gym = await BolaAPI.gyms.get(state.gym.id);
      setState({ gym, scanStatus: { ok: true, text: 'Listo — ahora sos el encargado de turno.' } });
    } else {
      setState({
        myGymSession: { id: result.sessionId, clientUserId: state.myClient.id, startedAt: new Date().toISOString(), expiresAt: result.expiresAt, status: 'active' },
        scanStatus: { ok: true, text: '✓ Check-in registrado — tenés 2 horas.' },
      });
      startGymSessionCountdown(result.expiresAt);
    }
  } catch (err) {
    setState({ scanStatus: { ok: false, text: friendlyError(err) } });
  }
}

// Entrada compartida por el dueño y por un administrador ya aprobado —
// paridad total (ver docs/ROLES_AND_PERMISSIONS.md). viewOwnerDash decide
// internamente si muestra la tab de aprobar administradores según el rol.
// Panel de plataforma (rol dedicado 'platform_admin', ver
// src/screens/platform.js) — no tiene gimnasio ni tabbar, una sola pantalla.
export async function enterPlatformDash() {
  const platformGyms = await BolaAPI.platform.listGyms();
  setState({ screen: 'platformDash', busy: false, platformGyms });
}

export async function enterOwnerDash() {
  // Ver loadWithFallback más arriba: si alguna de estas falla por RED, cae
  // a la última copia guardada en vez de dejar a todo el panel sin poder
  // abrir — esto es justamente lo que resuelve "el administrador no puede
  // ver quién pagó con mala señal" (clientsForGym trae membership_status).
  // Antes esto era un Promise.all directo: un solo fallo tumbaba las 9
  // lecturas juntas, incluida la que importa.
  const gymId = state.gym.id;
  const [clientsRes, trainersRes, plansRes, equipmentRes, reviewsRes, adminsRes, checkinsRes, interestRes, invitesRes] = await Promise.all([
    loadWithFallback(`clientsForGym:${gymId}`, () => BolaAPI.clients.listForGym(gymId)),
    loadWithFallback(`trainersForGym:${gymId}`, () => BolaAPI.trainers.listForGym(gymId)),
    loadWithFallback(`plans:${gymId}`, () => BolaAPI.plans.list(gymId)),
    loadWithFallback(`equipment:${gymId}`, () => BolaAPI.equipment.list(gymId)),
    loadWithFallback(`reviews:${gymId}`, () => BolaAPI.reviews.listForGym(gymId)),
    loadWithFallback(`gymAdminsForGym:${gymId}`, () => BolaAPI.admins.listForGym(gymId)),
    loadWithFallback(`todayCheckins:${gymId}`, () => BolaAPI.checkins.listTodayForGym(gymId)),
    loadWithFallback(`trainerInterest:${gymId}`, () => BolaAPI.trainers.listInterestForGym(gymId)),
    loadWithFallback(`gymInvites:${gymId}`, () => BolaAPI.gyms.getInvites(gymId)),
  ]);
  const trainersForGym = trainersRes.data, plans = plansRes.data,
    reviews = reviewsRes.data, gymAdminsForGym = adminsRes.data, todayCheckins = checkinsRes.data, trainerInterest = interestRes.data, gymInvites = invitesRes.data;
  // Foto de rostro de cada socio (ver attachFaceUrls) — Socios la muestra
  // en vez del círculo de iniciales cuando existe.
  const clientsForGym = await attachFaceUrls(clientsRes.data);
  // Foto de cada máquina (ver attachEquipmentPhotos) — Configuración la
  // muestra junto al nombre.
  const equipment = await attachEquipmentPhotos(equipmentRes.data);
  const coreStale = [clientsRes, trainersRes, plansRes, equipmentRes, reviewsRes, adminsRes, checkinsRes, interestRes, invitesRes].some(r => r.stale);

  // Etapa 2 — rating real por entrenador aprobado (Entrenadores/Reportes),
  // asistencia del mes actual (Asistencia, reemplaza el "Tráfico" inventado)
  // y el borrador de Configuración precargado con lo que el gimnasio ya tiene.
  // Estas tres son secundarias (no bloquean ver socios/pagos) — si fallan
  // por red, se quedan con lo que ya había en memoria en vez de romper
  // toda la entrada al panel.
  const approvedTrainers = trainersForGym.filter(t => t.status === 'approved');
  let trainerRatingsById = state.trainerRatingsById;
  try {
    const ratingsEntries = await Promise.all(approvedTrainers.map(async t => {
      const rows = await BolaAPI.trainerReviews.listForTrainer(t.id);
      const count = rows.length;
      const avg = count ? rows.reduce((sum, r) => sum + r.rating, 0) / count : null;
      return [t.id, { avg, count }];
    }));
    trainerRatingsById = Object.fromEntries(ratingsEntries);
  } catch (err) {
    if (!isNetworkError(err)) throw err;
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const attendanceRes = await loadWithFallback(`attendanceEvents:${gymId}:${monthStart}`, () => BolaAPI.checkins.listRangeForGym(gymId, monthStart, monthEnd));
  const exercisesLibRes = await loadWithFallback(`exercisesLib:${gymId}`, () => BolaAPI.exercisesLib.list(gymId));
  const programTemplatesRes = await loadWithFallback(`programTemplates`, () => BolaAPI.programTemplates.list());
  const programTemplateItemsRes = await loadWithFallback(`programTemplateItems`, () => BolaAPI.programTemplates.listItems());
  // Calendario: mismas classesForGym/classSessions que ya cargan cliente
  // ("Reservas") y entrenador ("Calendario") — acá se suma quién reservó
  // cada sesión, que solo dueño/admin puede ver (RLS: "staff reads bookings
  // in their gym").
  const classesRes = await loadWithFallback(`classesForGym:${gymId}`, () => BolaAPI.classes.listForGym(gymId));
  const classSessionsRes = await loadWithFallback(`classSessions:${gymId}`, () => BolaAPI.classes.listSessions(gymId));
  const classBookingsRes = await loadWithFallback(`classBookingsForGym:${gymId}`, () => BolaAPI.classes.listBookingsForGym(gymId));
  // Quién cobró un pago que el cliente confirmó solo (escaneando el QR),
  // y hasta cuándo quedó válido — ver confirm_cash_payment().
  const staffNotificationsRes = await loadWithFallback(`staffNotifications:${gymId}`, () => BolaAPI.notifications.listForStaff());

  Object.assign(state, {
    screen: 'ownerDash', ownerTab: 'panel', clientsForGym, trainersForGym, plans, equipment, reviews, gymAdminsForGym, todayCheckins, trainerInterest, gymInvites,
    trainerRatingsById, attendanceEvents: attendanceRes.data, attendanceSelectedDay: null, exercisesLib: exercisesLibRes.data,
    programTemplates: programTemplatesRes.data, programTemplateItems: programTemplateItemsRes.data,
    classesForGym: classesRes.data, classSessions: classSessionsRes.data, classBookingsForGym: classBookingsRes.data,
    staffNotifications: staffNotificationsRes.data,
    ownerClientQuery: '', ownerClientStatusFilter: 'todos', ownerSuspendingClientId: null, ownerSuspendReason: '',
    gymConfigDraft: {
      currency: state.gym.currency || 'USD', brandName: state.gym.brand_name || '', brandColor: state.gym.brand_color || '',
      name: state.gym.name || '', address: state.gym.address || '', hours: state.gym.hours || '',
    },
    dataStale: coreStale || attendanceRes.stale || exercisesLibRes.stale || programTemplatesRes.stale || programTemplateItemsRes.stale
      || classesRes.stale || classSessionsRes.stale || classBookingsRes.stale || staffNotificationsRes.stale,
    busy: false,
  });
  if (window.CesAds) window.CesAds.hideBanner();
  // Igual que enterClientHome: se entera solo de todo lo que puede
  // cambiar sin que él lo haga acá — un socio le confirma un pago por QR,
  // otro admin suspende/reactiva o cobra a alguien, entra un check-in, o
  // se reserva/cancela/crea algo del calendario.
  stopSessionRealtime();
  watchRealtime('staff_notifications', `recipient_user_id=eq.${state.myProfile.id}`, refreshStaffNotifications);
  watchRealtime('client_profiles', `gym_id=eq.${gymId}`, refreshOwnerClients);
  watchRealtime('payments', `gym_id=eq.${gymId}`, refreshOwnerClients);
  watchRealtime('checkin_events', `gym_id=eq.${gymId}`, refreshOwnerCheckins);
  watchRealtime('classes', `gym_id=eq.${gymId}`, refreshOwnerClasses);
  watchRealtime('class_sessions', `gym_id=eq.${gymId}`, refreshOwnerClasses);
  watchRealtime('class_bookings', `gym_id=eq.${gymId}`, refreshOwnerClasses);
  // Presencia en el gym (ver src/screens/presence.js) — un cliente escaneó,
  // una sesión venció, o cambió quién es el encargado de turno.
  watchRealtime('gym_sessions', `gym_id=eq.${gymId}`, refreshGymActiveSessions);
  watchRealtime('gyms', `id=eq.${gymId}`, refreshGymRow);
  render();
}

// Junta TODO lo que necesita Inicio del cliente — separado de
// enterClientHome() para poder envolver la tanda entera en un fallback a la
// última copia guardada (ver más abajo) sin desarmar esta parte, que
// prácticamente no cambió desde antes de que existiera ese fallback.
async function buildClientHomeBundle() {
  const clientRaw = await BolaAPI.clients.getSelf(state.myProfile.id);
  // Su propia foto de rostro (ver attachFaceUrls) — Perfil la muestra en
  // vez del círculo de iniciales cuando existe.
  const [client] = await attachFaceUrls([clientRaw]);
  const [plans, trainersForGym, reviews, equipmentRaw, exercisesLib, programTemplates, programTemplateItems] = await Promise.all([
    BolaAPI.plans.list(state.gym.id),
    BolaAPI.trainers.listForGym(state.gym.id),
    BolaAPI.reviews.listForGym(state.gym.id),
    BolaAPI.equipment.list(state.gym.id),
    // Biblioteca de ejercicios (ver libraryLink() en viewClientRutina) — antes
    // no se cargaba acá y abrir "Ver biblioteca de ejercicios" rompía la app
    // para el cliente (state.exercisesLib quedaba undefined).
    BolaAPI.exercisesLib.list(state.gym.id),
    // Programas de entrenamiento (catálogo global, solo lectura para el cliente).
    BolaAPI.programTemplates.list(),
    BolaAPI.programTemplates.listItems(),
  ]);
  // Foto de cada máquina (ver attachEquipmentPhotos) — "Máquinas disponibles
  // en tu gym" (Inicio) las muestra con foto en vez de solo el nombre.
  const equipment = await attachEquipmentPhotos(equipmentRaw);
  const plan = plans.find(p => p.id === client.planId) || null;
  const trainer = client.trainerUserId ? trainersForGym.find(t => t.id === client.trainerUserId) : null;
  // Fase 14 — todas estas lecturas son independientes entre sí: una sola
  // tanda en paralelo en vez de ~9 idas y vueltas encadenadas. Incluye
  // `myTrainingProfile` (perfil de evaluación) y los datos que la tarjeta
  // "Cómo está armada" necesita (Fase 8).
  const [progressRaw, trainerRoutineForMe, myPersonalRoutine, aiRoutine, checkinHistory, trainerInterest, myTrainingProfile, engExcluded, engLimitations] = await Promise.all([
    BolaAPI.progress.listForClient(client.id),
    trainer ? BolaAPI.routines.getTrainer(client.id) : Promise.resolve(null),
    BolaAPI.routines.getPersonal(client.id),
    BolaAPI.routines.getAi(client.id, client.physical.goal || 'perder_peso'),
    BolaAPI.checkins.listForClient(client.id, 5),
    BolaAPI.trainers.listInterestForGym(state.gym.id),
    BolaAPI.trainingProfile.get(client.id),
    BolaAPI.trainingProfile.listExcludedExercises(client.id).catch(() => []),
    BolaAPI.trainingProfile.listLimitations(client.id).catch(() => []),
  ]);
  const progressList = await attachSignedUrls(progressRaw);
  // La tarjeta "Cómo está armada" reconstruida del perfil guardado (Fase 8),
  // así sigue tras recargar. computeEnginePlan es puro y rápido.
  let enginePlan = null;
  if (myTrainingProfile) {
    try {
      enginePlan = computeEnginePlan(myTrainingProfile, {
        library: exercisesLib,
        gymConcepts: (equipment || []).filter(e => e.isActive !== false)
          .flatMap(e => e.concepts || []).concat('peso_corporal'),
        excludedIds: engExcluded.map(x => x.exerciseId).filter(Boolean),
        limitations: engLimitations,
      });
    } catch (_) { enginePlan = null; }
  }

  // Etapa 2 — clases/reservas, logros, medidas/récords y (si tiene
  // entrenador asignado) su propia calificación existente sobre él.
  const [classesForGym, classSessions, myBookings, achievementsCatalog, myAchievements, bodyMeasurements, personalRecords, workoutsThisMonth, notifications] = await Promise.all([
    BolaAPI.classes.listForGym(state.gym.id),
    BolaAPI.classes.listSessions(state.gym.id, new Date().toISOString()),
    BolaAPI.classes.listMyBookings(client.id),
    BolaAPI.achievements.listCatalog(),
    BolaAPI.achievements.listForClient(client.id),
    BolaAPI.measurements.listForClient(client.id),
    BolaAPI.workouts.getPersonalRecords(client.id),
    BolaAPI.workouts.countThisMonth(client.id),
    BolaAPI.notifications.listForClient(client.id),
  ]);
  const myTrainerRating = trainer
    ? (await BolaAPI.trainerReviews.listForTrainer(trainer.id)).find(r => r.client_user_id === client.id) || null
    : null;
  // Antes esto quedaba en null hasta que el cliente tocara la tab "Pago" a
  // mano (selectClientTab la recién ahí la pedía) — un cliente vencido/
  // pendiente que entraba directo a Inicio no se enteraba de si YA tenía un
  // cobro esperando. Con el bloqueo de app (ver viewClientHome) que lo manda
  // derecho a Pago apenas entra, cargarlo acá es obligatorio, no cosmético.
  const pendingPayment = await BolaAPI.payments.getPendingForClient(client.id);

  // Presencia en el gym (ver src/screens/presence.js) — si ya tenía una
  // sesión activa (por ejemplo, escaneó y cerró la app), sigue mostrando el
  // contador al volver a entrar. listActiveForGym ya viene filtrado por RLS
  // a "las mías" cuando quien llama es un cliente.
  const gymSessionsForMe = await BolaAPI.gymPresence.listActiveForGym(state.gym.id).catch(() => []);
  const myGymSession = gymSessionsForMe.find(s => s.clientUserId === client.id) || null;

  return {
    screen: 'clientHome', clientTab: 'inicio',
    myClient: client, myClientPlan: plan, myClientTrainer: trainer,
    plans, trainersForGym, reviews, equipment, exercisesLib, programTemplates, programTemplateItems, progressList, trainerRoutineForMe, myPersonalRoutine, checkinHistory, trainerInterest,
    aiGoal: client.physical.goal || 'perder_peso', aiRoutine, routineSource: 'ia', myTrainingProfile, enginePlan,
    classesForGym, classSessions, myBookings, achievementsCatalog, myAchievements, bodyMeasurements, personalRecords, workoutsThisMonth, notifications,
    myTrainerRating, trainerRatingDraft: { rating: myTrainerRating ? myTrainerRating.rating : 0, text: myTrainerRating ? (myTrainerRating.text || '') : '' },
    conversationId: null, messages: [], messageDraft: '',
    pendingPayment, myGymSession,
  };
}

// Pedido: que la sesión "se quede abierta" sin conexión — antes, si CUALQUIERA
// de las ~25 lecturas de buildClientHomeBundle() fallaba por mala señal (el
// caso típico: abrir la app en el gym con wifi débil), enterClientHome()
// entero fallaba, eso subía hasta boot()/resumeClientSession() y terminaba
// mandando al cliente a la pantalla de login — con la que además no puede
// hacer nada sin señal. Ahora, si falla por RED, se muestra la última copia
// completa guardada (mismo patrón que loadWithFallback, pero para todo el
// paquete de una vez: son ~25 lecturas relacionadas entre sí, separarlas una
// por una en loadWithFallback individuales no vale la complejidad extra) —
// con el aviso de "puede no estar al día" (staleDataBanner, ya usado en el
// panel de dueño). Si nunca se guardó nada en este dispositivo (primera vez
// que entra y ya sin señal), no hay de dónde sacar una copia — ahí sí no
// queda otra que mostrar el error real más arriba, en boot().
export async function enterClientHome() {
  const cacheKey = `clientHomeBundle:${state.myProfile.id}`;
  let bundle, dataStale;
  try {
    bundle = await buildClientHomeBundle();
    saveSnapshot(cacheKey, bundle);
    dataStale = false;
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const cached = loadSnapshot(cacheKey);
    if (!cached) throw err;
    bundle = cached.data;
    dataStale = true;
  }

  Object.assign(state, bundle, { busy: false, dataStale });
  const client = state.myClient;
  if (window.CesAds) window.CesAds.showBanner();
  // Se entera solo, sin recargar la página, de todo lo que le puede cambiar
  // mientras está adentro sin que él haga nada: le confirman el pago (o lo
  // suspenden/reactivan), le llega una notificación de un evento nuevo, o
  // se crea/reserva/cancela algo del calendario. stopSessionRealtime()
  // primero por si entra dos veces seguidas a Inicio. Sin señal esto no
  // logra conectar — no hace falta protegerlo especialmente: reintenta solo
  // cuando vuelva (ver BolaAPI.realtime del lado del cliente real).
  stopSessionRealtime();
  watchRealtime('payments', `client_user_id=eq.${client.id}`, refreshMyPaymentState);
  watchRealtime('client_profiles', `user_id=eq.${client.id}`, refreshMyPaymentState);
  watchRealtime('notifications', `client_user_id=eq.${client.id}`, refreshMyNotifications);
  watchRealtime('classes', `gym_id=eq.${state.gym.id}`, refreshMyClasses);
  watchRealtime('class_sessions', `gym_id=eq.${state.gym.id}`, refreshMyClasses);
  // class_bookings NO tiene política de lectura por gimnasio para un
  // cliente (solo "self reads own bookings") — filtra por su propia
  // reserva, no por gym_id como las otras dos (ver 20260905000300, RLS de
  // class_bookings). Nota para el mock: bookClass/cancelBooking ya
  // refrescan myBookings solos apenas el propio cliente reserva/cancela
  // (no necesitan este canal); si una sesión se borra del todo, eso
  // dispara el canal de `class_sessions` de arriba, que igual re-lee
  // myBookings — así que este canal específico casi nunca hace falta en
  // la práctica, pero se deja por las dudas (ej. si algún día el staff
  // cancela una reserva puntual sin borrar la sesión entera).
  watchRealtime('class_bookings', `client_user_id=eq.${client.id}`, refreshMyClasses);
  // Presencia en el gym (ver src/screens/presence.js) — la propia sesión
  // venció, o cambió desde otro dispositivo con la misma cuenta.
  watchRealtime('gym_sessions', `client_user_id=eq.${client.id}`, refreshMyGymSession);
  if (state.myGymSession) startGymSessionCountdown(state.myGymSession.expiresAt); else clearGymSessionTimer();
  render();
}

export async function enterTrainerDash(profile, gym, myTrainer) {
  const clientsRaw = (await BolaAPI.clients.listForGym(gym.id)).filter(c => c.trainerUserId === myTrainer.id);
  const plans = await BolaAPI.plans.list(gym.id);
  // Foto de rostro de cada cliente asignado (ver attachFaceUrls) — "Mis
  // clientes" la muestra en vez del círculo de iniciales cuando existe.
  const clientsWithFace = await attachFaceUrls(clientsRaw);
  const trainerClients = clientsWithFace.map(c => ({
    ...c,
    plan: (plans.find(p => p.id === c.planId) || { name: '—' }).name,
  }));

  // Etapa 2 — biblioteca de ejercicios y programas de entrenamiento (para
  // "Crear rutina"), las sesiones de las clases que este entrenador dicta
  // (Panel/Calendario), una conversación por cliente asignado (Mensajes) y
  // su propio rating (Perfil).
  const [exercisesLib, programTemplates, programTemplateItems, allClasses, allSessions, trainerReviewsList] = await Promise.all([
    BolaAPI.exercisesLib.list(gym.id),
    BolaAPI.programTemplates.list(),
    BolaAPI.programTemplates.listItems(),
    BolaAPI.classes.listForGym(gym.id),
    BolaAPI.classes.listSessions(gym.id, new Date().toISOString()),
    BolaAPI.trainerReviews.listForTrainer(myTrainer.id),
  ]);
  const myClassIds = new Set(allClasses.filter(c => c.trainer_user_id === myTrainer.id).map(c => c.id));
  const trainerClassSessions = allSessions.filter(s => myClassIds.has(s.class_id));
  const trainerConversations = await Promise.all(
    trainerClients.map(async c => ({ clientId: c.id, clientName: c.name, conversationId: await BolaAPI.messages.getOrCreateConversation(c.id) }))
  );

  Object.assign(state, {
    screen: 'trainerDash', trainerTab: 'panel', myProfile: profile, gym, myTrainer, trainerClients,
    trainerProfileDraft: { specialty: myTrainer.specialty, price: String(myTrainer.price) },
    trainerSelectedClientId: null, trainerSelectedClientDetail: null, trainerClientQuery: '', busy: false,
    exercisesLib, programTemplates, programTemplateItems, trainerClassSessions, trainerReviewsList, trainerConversations,
    trainerActiveConversationId: null, trainerMessages: [], trainerMessageDraft: '',
  });
  if (window.CesAds) window.CesAds.hideBanner();
  // Presencia en el gym (ver src/screens/presence.js) — un entrenador
  // aprobado puede ser encargado de turno, así que necesita lo mismo que
  // owner/admin en enterOwnerDash: el panel de entrenador no tenía ningún
  // canal de tiempo real hasta ahora.
  stopSessionRealtime();
  watchRealtime('gym_sessions', `gym_id=eq.${gym.id}`, refreshGymActiveSessions);
  watchRealtime('gyms', `id=eq.${gym.id}`, refreshGymRow);
  render();
}

export async function attachSignedUrls(rows) {
  return Promise.all(rows.map(async r => ({
    ...r,
    url: r.storage_key ? await BolaAPI.photos.signedUrl(r.storage_key) : null,
  })));
}

// Igual idea que attachSignedUrls, pero para la foto de rostro de un
// cliente (client_profiles.face_photo_key) — se sube una sola vez al
// registrarse (ver confirmRequiredFacePhoto) y nunca cambia, así que a
// diferencia de las fotos de progreso conviene cachear la signed URL en
// memoria: la lista de socios/clientes se refresca seguido (cobrar, marcar
// entrada, suspender…) y sin esto se le pediría a Storage una URL nueva
// para cada foto en cada uno de esos refrescos, solo para mostrar la
// misma imagen de siempre. No persiste entre sesiones — no hace falta,
// dura lo mismo que la pestaña abierta.
const faceUrlCache = new Map(); // facePhotoKey -> signedUrl
export async function attachFaceUrls(clients) {
  return Promise.all(clients.map(async c => {
    if (!c.facePhotoKey) return c;
    if (faceUrlCache.has(c.facePhotoKey)) return { ...c, faceUrl: faceUrlCache.get(c.facePhotoKey) };
    try {
      const faceUrl = await BolaAPI.photos.signedUrl(c.facePhotoKey);
      faceUrlCache.set(c.facePhotoKey, faceUrl);
      return { ...c, faceUrl };
    } catch (err) {
      // Storage caído/objeto borrado: no vale la pena romper toda la lista
      // por una foto — cae al ícono de iniciales de siempre (ver avatar()
      // en helpers.js).
      return c;
    }
  }));
}

// Igual idea que attachFaceUrls, pero para la foto de cada máquina/equipo
// (equipment.photo_key, ver 20260916000000_equipment_photos.sql) — se sube
// una sola vez desde Configuración y prácticamente nunca cambia, así que
// también conviene cachear la signed URL (dueño/admin recargan Panel/Socios
// seguido, y ahora el cliente la ve en Inicio en cada entrada al home).
const equipmentUrlCache = new Map(); // photoKey -> signedUrl
export async function attachEquipmentPhotos(equipmentList) {
  return Promise.all(equipmentList.map(async e => {
    if (!e.photoKey) return e;
    if (equipmentUrlCache.has(e.photoKey)) return { ...e, photoUrl: equipmentUrlCache.get(e.photoKey) };
    try {
      const photoUrl = await BolaAPI.photos.signedUrl(e.photoKey);
      equipmentUrlCache.set(e.photoKey, photoUrl);
      return { ...e, photoUrl };
    } catch (err) {
      return e;
    }
  }));
}

/* ============================ photo picking ============================ */

const filePicker = document.getElementById('filePicker');
let photoTarget = null;

function openPhotoPicker(target) {
  photoTarget = target;
  filePicker.value = '';
  filePicker.click();
}

filePicker.addEventListener('change', async () => {
  const file = filePicker.files && filePicker.files[0];
  if (!file || !photoTarget) return;
  const target = photoTarget;
  photoTarget = null;

  if (target === 'face') {
    // Diferido: todavía no hay usuario/gimnasio para armar la ruta de
    // almacenamiento — se sube de verdad en clientSignUp().
    const previewUrl = URL.createObjectURL(file);
    setState({ clientReg: { ...state.clientReg, photoFile: file, photoPreviewUrl: previewUrl } });
    return;
  }

  if (target === 'editface') {
    // Ídem, pero desde "Editar perfil" (ver ACTIONS.saveEditProfile) — ya
    // hay sesión, pero se sube recién al guardar, no apenas se elige (así
    // "Cancelar"/volver atrás no deja una foto a medio subir).
    const previewUrl = URL.createObjectURL(file);
    setState({ editProfileDraft: { ...state.editProfileDraft, photoFile: file, photoPreviewUrl: previewUrl } });
    return;
  }

  if (target.startsWith('equipment:')) {
    // Foto de una máquina ya creada (ver equipmentEditor() en screens/owner.js
    // — a diferencia de la foto de rostro, acá no hay borrador: se sube
    // apenas se elige, mismo criterio que las fotos de progreso.
    const equipmentId = target.split(':')[1];
    try {
      setState({ busy: true });
      const path = BolaAPI.photos.equipmentPath(state.gym.id, equipmentId);
      await BolaAPI.photos.upload(path, file);
      await BolaAPI.equipment.setPhotoKey(equipmentId, path);
      const photoUrl = await BolaAPI.photos.signedUrl(path);
      setState({
        busy: false,
        equipment: state.equipment.map(e => e.id === equipmentId ? { ...e, photoKey: path, photoUrl } : e),
      });
    } catch (err) {
      setState({ busy: false, error: friendlyError(err) });
    }
    return;
  }

  const progressId = target.split(':')[1];
  try {
    setState({ busy: true });
    const path = BolaAPI.photos.progressPath(state.gym.id, state.myClient.id, new Date().toISOString().slice(0, 10));
    await BolaAPI.photos.upload(path, file);
    await BolaAPI.progress.setPhoto(progressId, path);
    const url = await BolaAPI.photos.signedUrl(path);
    setState({
      busy: false,
      progressList: state.progressList.map(p => p.id === progressId ? { ...p, storage_key: path, url } : p),
    });
  } catch (err) {
    setState({ busy: false, error: friendlyError(err) });
  }
});
