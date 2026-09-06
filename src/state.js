/* Bolá — estado global de la app + setState().
   Movido 1:1 desde app.js (Fase 3, ver docs/MIGRATION_PLAN.md). `render` se
   importa de router.js: es un import circular con router.js (que a su vez
   importa `state`/`setState` de acá), pero es seguro en ES modules — ninguno
   de los dos módulos llama a un export del otro durante su propia
   evaluación de nivel superior, solo dentro de funciones que se invocan
   después de que todo el grafo de módulos terminó de cargar. */
'use strict';

import { render } from './router.js';

export const state = {
  screen: 'boot',
  session: null,
  myProfile: null,   // {id, role, gym_id, name, email, phone}
  gym: null,          // {id, name, address, hours, invite_code}
  // Código de invitación leído de la URL al arrancar (?invite=XXXXX, ver
  // router.js) — sección 10 del pedido original ("Invitación de clientes"),
  // generalizado en la Fase 16 a los 3 roles (gym_invites). No es un token
  // de acceso, solo evita el selector manual de gimnasio/habilita el modo
  // "Registrarme" del rol que corresponda cuando alguien llega desde el
  // link/QR de su gimnasio — join_gym() sigue siendo el gate real.
  inviteGym: null,   // gimnasio resuelto desde ?invite=CODE
  inviteRole: null,  // 'admin'|'trainer'|'client' resuelto junto con inviteGym
  // Token de ?owner_invite=TOKEN (Fase 16) — a diferencia de inviteGym/
  // inviteRole, este SÍ es un gate de seguridad real: sin un token válido y
  // sin usar, create_gym() rechaza en el servidor (ver docs/SECURITY_AUDIT.md).
  ownerInviteToken: null,
  gymInvites: null, // {client, admin, trainer} códigos de ESTE gimnasio — lo carga el dueño/admin (ver enterOwnerDash)
  // Panel de plataforma (rol dedicado 'platform_admin', ver
  // src/screens/platform.js) — platformGyms es la lista de todos los
  // gimnasios + su dueño, cargada al entrar (ver enterPlatformDash).
  platformInviteNote: '', platformInviteLink: '', platformGyms: [],
  inviteLinkCopied: false, // feedback transitorio del botón "Copiar link" del dueño
  inviteLinkCopyFailed: false, // idem, cuando el portapapeles del navegador deniega el permiso
  busy: false,
  error: '',
  offline: !navigator.onLine,
  showPassword: false,

  // Resiliencia a mala señal (ver src/offline.js) — pendingSyncCount es
  // cuántas acciones (marcar serie, check-in, confirmar cobro) quedaron
  // en la cola local esperando que vuelva la conexión; dataStale marca
  // que la pantalla actual está mostrando la última copia guardada de
  // socios/admins/etc en vez de datos recién bajados (ver
  // loadWithFallback en actions.js, usado en enterOwnerDash). Ninguno de
  // los dos bloquea la pantalla — son solo avisos (ver pendingSyncBanner/
  // staleDataBanner en helpers.js).
  pendingSyncCount: 0,
  dataStale: false,

  ownerTab: 'panel',
  clientTab: 'inicio',
  trainerTab: 'clientes',

  // Etapa 1 del rediseño (ver docs/plans, "aqui-esta-el-logo"): login único
  // para los 4 roles — signIn() ya era el mismo RPC para todos, la única
  // diferencia era 4 pantallas separadas repitiendo el mismo formulario.
  // La app lee profile.role después de loguear y rutea sola (ver
  // routeAfterLogin en actions.js). Reemplaza ownerLoginEmail/adminLoginEmail/
  // clientLoginEmail/trainerLoginEmail + sus *AuthMode (el toggle
  // login/registro también desaparece: el registro ahora es siempre por
  // invitación — o sin ella solo para cliente — nunca un modo de esta pantalla).
  loginEmail: '', loginPassword: '', loginError: '',

  // Confirmación de correo por código (pantalla "confirmCode", ver
  // screens/auth.js viewConfirmCode + ACTIONS.verifyConfirmCode/
  // resendConfirmCode en actions.js) — Supabase manda un código de 6
  // dígitos en el correo de "Confirm signup" en vez del link de siempre.
  // confirmRole distingue el caso fresco (recién hizo Xsignup en esta misma
  // sesión, con inviteGym/inviteRole todavía en memoria) del caso "abandonó
  // la pantalla y volvió más tarde a loguearse" (confirmRole null — ahí no
  // hay nada en memoria y se resuelve como cualquier login, ver
  // routeAfterLogin/resumeOwnerSession/resumeAdminSession/resumeClientSession).
  confirmEmail: '', confirmCode: '', confirmRole: null, confirmCodeResent: false,

  // Dueño: crea el gimnasio — antes lo hacía "admin", ver docs/MIGRATION_PLAN.md Fase 4.
  ownerReg: { name: '', email: '', phone: '', phonePrefix: '+53', password: '' },
  gymReg: { name: '', address: '', hours: '' },

  // Administrador: se une a un gimnasio YA creado por el dueño y queda
  // pendiente de aprobación — mismo patrón que un entrenador (ver trainerReg
  // más abajo). adminReg no necesita specialty/price, a diferencia de trainerReg.
  adminReg: { name: '', email: '', phone: '', phonePrefix: '+53', password: '' },
  pendingAdminName: '',
  gymAdminsForGym: [],   // gym_admins de ESTE gimnasio — lo carga el dueño para aprobar/rechazar
  todayCheckins: [],       // check-ins de HOY en este gimnasio — [{client_user_id, created_at}], para el badge "✓ Hoy" en la tab Clientes
  // Pantalla "Escanear QR" (ver src/qr.js + src/screens/owner.js
  // viewScanCheckin) — scanStatus es el toast transitorio del último código
  // leído ({ok:boolean, text:string}), scanError es un problema de cámara
  // (permiso denegado, sin hardware) que reemplaza el visor por un mensaje.
  scanStatus: null,
  scanError: '',
  trainerInterest: [],      // [{candidate_user_id, client_user_id}] de este gimnasio — "10 clientes interesados" (owner/admin y cliente lo leen distinto)

  equipment: [],
  newEquipment: '',

  plans: [],
  newPlanName: '', newPlanPrice: '', newPlanDuration: 'Mensual', editingPlanId: null,

  clientsForGym: [],
  trainersForGym: [],
  billingFilter: 'mensual',
  activeCharge: null,   // {paymentId, clientId, clientName, amount, status}
  // El cliente confirma su propio cobro escaneando el QR de esta pantalla
  // (ver ACTIONS.handlePaymentScan) — esto solo agranda ese mismo QR a
  // pantalla completa para que sea más fácil de leer desde el mostrador.
  chargeQrExpanded: false,

  // Etapa 2 — "Socios" (buscador + filtro + suspender).
  ownerClientQuery: '', ownerClientStatusFilter: 'todos',
  ownerSuspendingClientId: null, ownerSuspendReason: '',
  // Etapa 2 — "Entrenadores": rating real por entrenador (trainer_reviews).
  trainerRatingsById: {},   // {[trainerUserId]: {avg, count}}
  // Etapa 2 — "Asistencia" (pantalla nueva, reemplaza el "Tráfico" inventado
  // — lee checkin_events de verdad). Mes actual cargado entero al entrar al
  // panel; el día elegido solo filtra en memoria, sin otro viaje al server.
  attendanceEvents: [], attendanceSelectedDay: null,
  // Etapa 2 — "Configuración" (moneda, marca; los links de invitación viven
  // acá, ya no repartidos en cada tab).
  gymConfigDraft: { currency: 'USD', brandName: '', brandColor: '' },

  reviews: [],
  newCommentText: '', newCommentRating: 5,

  clientReg: { name: '', email: '', phone: '', phonePrefix: '+53', password: '', photoFile: null, photoPreviewUrl: null },
  clientPhysicalReg: { weight: '', height: '', age: '', level: 'principiante', goal: 'perder_peso' },
  approvedTrainersForReg: [],
  selectedPlanId: null, wantsTrainer: null, selectedTrainerId: null,
  gymList: [], selectedGymId: null, gymPickerNext: null,

  myClient: null,
  myClientPlan: null,
  myClientTrainer: null,
  checkinHistory: [],   // últimos check-ins propios — [{id, created_at}], mostrado en Inicio junto a "Mi QR"
  progressList: [],
  routineSource: 'ia',
  aiGoal: 'perder_peso',
  aiRoutine: null,          // {id, exercises:[{id,text}]}
  trainerRoutineForMe: null,
  pendingPayment: null,     // {id, amount, status}
  // Sesión de entrenamiento en curso (pantalla "workout"). Etapa 2: además
  // del estado en memoria de siempre, ahora abre una fila real en
  // workout_sessions al arrancar (`sessionId`) y cada serie marcada se
  // guarda con exercise_logs (peso/reps reales, no solo un check) — ver
  // ACTIONS.startWorkout/toggleSet/nextExercise.
  // { sessionId, exercises:[{id,text,sets,reps,weightKg,restSeconds}], source:'ia'|'trainer', index, doneSets:{[exerciseIndex]: Set<number>|true}, restSecondsLeft, finished }
  workout: null,

  // Etapa 2 — Reservas y calendario de clases (pantalla nueva del plan).
  classesForGym: [], classSessions: [], myBookings: [], reservasSelectedDay: null,
  // Etapa 2 — Logros / medallas (pantalla nueva del plan).
  achievementsCatalog: [], myAchievements: [],
  // Etapa 2 — Progreso real: serie histórica de medidas + récords
  // personales + entrenamientos del mes (antes era solo fotos).
  bodyMeasurements: [], personalRecords: [], workoutsThisMonth: 0,
  measurementDraft: { weight_kg: '', body_fat_pct: '', waist_cm: '', chest_cm: '', arm_cm: '', thigh_cm: '' },
  // Etapa 2 — calificar al propio entrenador asignado (distinto de
  // `reviews`, que son reseñas del gimnasio).
  myTrainerRating: null, trainerRatingDraft: { rating: 0, text: '' },
  // Etapa 2 — mensajes con el propio entrenador asignado.
  conversationId: null, messages: [], messageDraft: '',
  // Etapa 2 — "Biblioteca de ejercicios" (pantalla transversal del plan,
  // #23): un solo `screen` compartido por los 3 roles. `libraryReturn`
  // guarda a qué screen volver (clientHome/trainerDash/ownerDash) — las
  // tabs de cada dashboard (clientTab/trainerTab/ownerTab) no se tocan al
  // entrar, así que vuelven solas a como estaban.
  libraryReturn: null, libraryQuery: '', libraryMuscleFilter: 'todos',
  libraryDraft: { name: '', muscleGroup: '', equipmentName: '', description: '' },

  trainerReg: { name: '', email: '', phone: '', phonePrefix: '+53', password: '', specialty: '', price: '' },
  pendingTrainerName: '',

  myTrainer: null,
  trainerClients: [],
  trainerClientQuery: '',    // buscador de la tab "Mis clientes"
  trainerSelectedClientId: null,
  trainerSelectedClientDetail: null,   // {progress:[], routine:{id,exercises}, measurements:[], prs:[]}
  // Etapa 2 — "Crear rutina" ahora arma un ejercicio estructurado (biblioteca
  // + sets/reps/peso/descanso), no un string suelto.
  trainerRoutineDraft: { exerciseId: '', text: '', sets: '', reps: '', weightKg: '', restSeconds: '60' },
  trainerProfileDraft: { specialty: '', price: '' },
  // Etapa 2 — Panel (citas de hoy) y Calendario/agenda: sesiones de las
  // clases que este entrenador dicta (classes.trainer_user_id === myTrainer.id).
  trainerClassSessions: [], trainerSelectedDay: null,
  // Etapa 2 — Mensajes con clientes: una conversación por cliente asignado.
  trainerConversations: [], trainerActiveConversationId: null, trainerMessages: [], trainerMessageDraft: '',
  // Etapa 2 — Perfil: rating recibido (trainer_reviews), de solo lectura.
  trainerReviewsList: [],
};

export function setState(patch) {
  Object.assign(state, patch);
  render();
}
