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
import { friendlyError, splitPhone, enrichClient, buildRoutine } from './helpers.js';
import { DURATION_LABELS } from './data.js';
import { render, OWNER_INVITE_KEY, GYM_INVITE_KEY } from './router.js';

// Handle del setInterval del descanso entre series — módulo-scoped porque
// no es parte del estado serializable, solo un recurso a limpiar (ver
// ACTIONS.startRest/skipRest/nextExercise/exitWorkout, todos pasan por acá
// antes de tocar state.workout para nunca dejar dos timers corriendo).
let restTimerId = null;
function clearRestTimer() {
  if (restTimerId) { clearInterval(restTimerId); restTimerId = null; }
}

// ex.reps es texto ("8", "20 min", "circuito" — ver routine_exercises.reps)
// — el campo de "reps hechas" del modo entrenamiento solo se precarga
// cuando es puramente una cifra; si no, se deja vacío (ese ejercicio se
// mide en tiempo o rondas, no en repeticiones).
function defaultReps(ex) {
  return /^\d+$/.test(String((ex && ex.reps) || '').trim()) ? ex.reps : '';
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

export const ACTIONS = {
  goto: v => setState({ screen: v, error: '' }),
  togglePasswordVisibility: () => setState({ showPassword: !state.showPassword }),

  signOut: async () => {
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
    const profile = await BolaAPI.auth.getMyProfile();
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
    const profile = await BolaAPI.auth.getMyProfile();
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
    const row = await BolaAPI.equipment.add(state.gym.id, v);
    setState({ equipment: state.equipment.concat(row), newEquipment: '' });
  },
  addEquipment: async v => {
    const row = await BolaAPI.equipment.add(state.gym.id, v);
    setState({ equipment: state.equipment.concat(row) });
  },
  removeEquipment: async id => {
    await BolaAPI.equipment.remove(id);
    setState({ equipment: state.equipment.filter(e => e.id !== id) });
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
    const row = await BolaAPI.checkins.checkIn(clientId);
    const todayCheckins = await BolaAPI.checkins.listTodayForGym(state.gym.id);
    // También se agrega a attendanceEvents (Asistencia), cargado una sola
    // vez al entrar al panel — si no, un check-in hecho durante la misma
    // sesión no aparecería en el calendario hasta volver a entrar.
    setState({ todayCheckins, attendanceEvents: [...state.attendanceEvents, { client_user_id: clientId, created_at: row.created_at }] });
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
    await BolaAPI.payments.confirm(state.activeCharge.paymentId);
    const clientsForGym = await BolaAPI.clients.listForGym(state.gym.id);
    setState({ clientsForGym, activeCharge: null, chargeQrExpanded: false });
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
    const clientsForGym = await BolaAPI.clients.listForGym(state.gym.id);
    setState({ clientsForGym, ownerSuspendingClientId: null, ownerSuspendReason: '' });
  },
  unsuspendClient: async clientId => {
    await BolaAPI.clients.unsuspend(clientId);
    const clientsForGym = await BolaAPI.clients.listForGym(state.gym.id);
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
      await BolaAPI.gyms.updateSettings(state.gym.id, { currency: d.currency, brandName: d.brandName, brandColor: d.brandColor });
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
  refreshPendingPayment: async () => {
    const pendingPayment = await BolaAPI.payments.getPendingForClient(state.myClient.id);
    setState({ pendingPayment });
  },
  setRoutineSource: v => setState({ routineSource: v }),
  setAiGoal: async v => {
    const aiRoutine = await BolaAPI.routines.getAi(state.myClient.id, v);
    setState({ aiGoal: v, aiRoutine });
  },
  generateRoutine: async () => {
    setState({ busy: true });
    const entries = buildRoutine(state.aiGoal, state.equipment.map(e => e.name));
    await BolaAPI.routines.generateAi(state.myClient.id, state.aiGoal, entries);
    const aiRoutine = await BolaAPI.routines.getAi(state.myClient.id, state.aiGoal);
    setState({ busy: false, aiRoutine });
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
    const routine = (source === 'trainer' ? state.trainerRoutineForMe : state.aiRoutine) || { exercises: [] };
    if (!routine.exercises.length) return;
    clearRestTimer();
    const sessionId = await BolaAPI.workouts.start(state.myClient.id, state.gym.id, source);
    const first = routine.exercises[0] || {};
    setState({
      screen: 'workout',
      workout: {
        sessionId, exercises: routine.exercises, source, index: 0, doneSets: {}, restSecondsLeft: 0, finished: false,
        weightInput: first.weightKg != null ? String(first.weightKg) : '', repsInput: defaultReps(first),
      },
    });
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
      await BolaAPI.workouts.logSet(w.sessionId, state.myClient.id, ex.text, num, repsNum, weightKg);
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
      await BolaAPI.workouts.logSet(w.sessionId, state.myClient.id, ex.text, 1, null, weightKg);
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
      await BolaAPI.workouts.finish(w.sessionId, state.myClient.id);
      // Refresca lo que "Progreso"/"Logros" muestran, para que al volver ya
      // reflejen este entrenamiento recién cerrado sin recargar toda la app.
      const [personalRecords, workoutsThisMonth, myAchievements] = await Promise.all([
        BolaAPI.workouts.getPersonalRecords(state.myClient.id),
        BolaAPI.workouts.countThisMonth(state.myClient.id),
        BolaAPI.achievements.listForClient(state.myClient.id),
      ]);
      setState({ workout: { ...w, finished: true, restSecondsLeft: 0 }, personalRecords, workoutsThisMonth, myAchievements });
    } else {
      const next = w.exercises[w.index + 1] || {};
      setState({ workout: { ...w, index: w.index + 1, restSecondsLeft: 0, weightInput: next.weightKg != null ? String(next.weightKg) : '', repsInput: defaultReps(next) } });
    }
  },
  prevExercise: () => {
    const w = state.workout;
    if (!w || w.index === 0) return;
    clearRestTimer();
    const prev = w.exercises[w.index - 1] || {};
    setState({ workout: { ...w, index: w.index - 1, restSecondsLeft: 0, weightInput: prev.weightKg != null ? String(prev.weightKg) : '', repsInput: defaultReps(prev) } });
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
  },
  closeTrainerChat: () => setState({ screen: 'clientHome' }),
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
    const [progressRaw, routine, measurements, prs] = await Promise.all([
      BolaAPI.progress.listForClient(clientId),
      BolaAPI.routines.getTrainer(clientId),
      BolaAPI.measurements.listForClient(clientId),
      BolaAPI.workouts.getPersonalRecords(clientId),
    ]);
    const progress = await attachSignedUrls(progressRaw);
    setState({ trainerSelectedClientDetail: { progress, routine, measurements, prs } });
  },
  closeClientDetail: () => setState({ trainerSelectedClientId: null, trainerSelectedClientDetail: null }),
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
    await BolaAPI.routines.addTrainerExercise(state.trainerSelectedClientId, state.myTrainer.id, {
      text, exerciseId: d.exerciseId || null,
      sets: d.sets ? Number(d.sets) : null, reps: d.reps ? d.reps : null,
      weightKg: d.weightKg ? Number(d.weightKg) : null, restSeconds: d.restSeconds ? Number(d.restSeconds) : 60,
    });
    const routine = await BolaAPI.routines.getTrainer(state.trainerSelectedClientId);
    setState({ trainerRoutineDraft: { exerciseId: '', text: '', sets: '', reps: '', weightKg: '', restSeconds: '60' }, trainerSelectedClientDetail: { ...state.trainerSelectedClientDetail, routine } });
  },
  removeTrainerRoutineExercise: async exerciseId => {
    await BolaAPI.routines.removeExercise(exerciseId);
    const routine = await BolaAPI.routines.getTrainer(state.trainerSelectedClientId);
    setState({ trainerSelectedClientDetail: { ...state.trainerSelectedClientDetail, routine } });
  },

  /* ---- Etapa 2: mensajes con clientes asignados ---- */
  openTrainerConversation: async clientId => {
    const conv = state.trainerConversations.find(c => c.clientId === clientId);
    if (!conv) return;
    const trainerMessages = await BolaAPI.messages.list(conv.conversationId);
    setState({ trainerActiveConversationId: conv.conversationId, trainerMessages, trainerMessageDraft: '' });
  },
  closeTrainerConversation: () => setState({ trainerActiveConversationId: null, trainerMessages: [] }),
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
  openExerciseLibrary: () => setState({ libraryReturn: state.screen, screen: 'exerciseLibrary', libraryQuery: '', libraryMuscleFilter: 'todos' }),
  closeExerciseLibrary: () => setState({ screen: state.libraryReturn || 'clientHome', libraryReturn: null }),
  setLibraryMuscleFilter: v => setState({ libraryMuscleFilter: v }),
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
  state.gym = await BolaAPI.gyms.get(profile.gym_id);
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
  state.gym = await BolaAPI.gyms.get(profile.gym_id);
  const client = await BolaAPI.clients.getSelf(profile.id);
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
  const gym = await BolaAPI.gyms.get(profile.gym_id);
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
    await BolaAPI.payments.confirm(data.id);
    const client = await BolaAPI.clients.getSelf(state.myProfile.id);
    if (navigator.vibrate) { try { navigator.vibrate(80); } catch (_) { /* no disponible, no es crítico */ } }
    setState({ myClient: client, pendingPayment: null, scanStatus: { ok: true, text: '✓ Pago confirmado. ¡Gracias!' } });
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
  const [clientsForGym, trainersForGym, plans, equipment, reviews, gymAdminsForGym, todayCheckins, trainerInterest, gymInvites] = await Promise.all([
    BolaAPI.clients.listForGym(state.gym.id),
    BolaAPI.trainers.listForGym(state.gym.id),
    BolaAPI.plans.list(state.gym.id),
    BolaAPI.equipment.list(state.gym.id),
    BolaAPI.reviews.listForGym(state.gym.id),
    BolaAPI.admins.listForGym(state.gym.id),
    BolaAPI.checkins.listTodayForGym(state.gym.id),
    BolaAPI.trainers.listInterestForGym(state.gym.id),
    BolaAPI.gyms.getInvites(state.gym.id),
  ]);

  // Etapa 2 — rating real por entrenador aprobado (Entrenadores/Reportes),
  // asistencia del mes actual (Asistencia, reemplaza el "Tráfico" inventado)
  // y el borrador de Configuración precargado con lo que el gimnasio ya tiene.
  const approvedTrainers = trainersForGym.filter(t => t.status === 'approved');
  const ratingsEntries = await Promise.all(approvedTrainers.map(async t => {
    const rows = await BolaAPI.trainerReviews.listForTrainer(t.id);
    const count = rows.length;
    const avg = count ? rows.reduce((sum, r) => sum + r.rating, 0) / count : null;
    return [t.id, { avg, count }];
  }));
  const trainerRatingsById = Object.fromEntries(ratingsEntries);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const attendanceEvents = await BolaAPI.checkins.listRangeForGym(state.gym.id, monthStart, monthEnd);
  const exercisesLib = await BolaAPI.exercisesLib.list(state.gym.id);

  Object.assign(state, {
    screen: 'ownerDash', ownerTab: 'panel', clientsForGym, trainersForGym, plans, equipment, reviews, gymAdminsForGym, todayCheckins, trainerInterest, gymInvites,
    trainerRatingsById, attendanceEvents, attendanceSelectedDay: null, exercisesLib,
    ownerClientQuery: '', ownerClientStatusFilter: 'todos', ownerSuspendingClientId: null, ownerSuspendReason: '',
    gymConfigDraft: { currency: state.gym.currency || 'USD', brandName: state.gym.brand_name || '', brandColor: state.gym.brand_color || '' },
    busy: false,
  });
  if (window.CesAds) window.CesAds.hideBanner();
  render();
}

export async function enterClientHome() {
  const client = await BolaAPI.clients.getSelf(state.myProfile.id);
  const [plans, trainersForGym, reviews, equipment] = await Promise.all([
    BolaAPI.plans.list(state.gym.id),
    BolaAPI.trainers.listForGym(state.gym.id),
    BolaAPI.reviews.listForGym(state.gym.id),
    BolaAPI.equipment.list(state.gym.id),
  ]);
  const plan = plans.find(p => p.id === client.planId) || null;
  const trainer = client.trainerUserId ? trainersForGym.find(t => t.id === client.trainerUserId) : null;
  const progressRaw = await BolaAPI.progress.listForClient(client.id);
  const progressList = await attachSignedUrls(progressRaw);
  const trainerRoutineForMe = trainer ? await BolaAPI.routines.getTrainer(client.id) : null;
  const aiRoutine = await BolaAPI.routines.getAi(client.id, client.physical.goal || 'perder_peso');
  const checkinHistory = await BolaAPI.checkins.listForClient(client.id, 5);
  const trainerInterest = await BolaAPI.trainers.listInterestForGym(state.gym.id);

  // Etapa 2 — clases/reservas, logros, medidas/récords y (si tiene
  // entrenador asignado) su propia calificación existente sobre él.
  const [classesForGym, classSessions, myBookings, achievementsCatalog, myAchievements, bodyMeasurements, personalRecords, workoutsThisMonth] = await Promise.all([
    BolaAPI.classes.listForGym(state.gym.id),
    BolaAPI.classes.listSessions(state.gym.id, new Date().toISOString()),
    BolaAPI.classes.listMyBookings(client.id),
    BolaAPI.achievements.listCatalog(),
    BolaAPI.achievements.listForClient(client.id),
    BolaAPI.measurements.listForClient(client.id),
    BolaAPI.workouts.getPersonalRecords(client.id),
    BolaAPI.workouts.countThisMonth(client.id),
  ]);
  const myTrainerRating = trainer
    ? (await BolaAPI.trainerReviews.listForTrainer(trainer.id)).find(r => r.client_user_id === client.id) || null
    : null;

  Object.assign(state, {
    screen: 'clientHome', clientTab: 'inicio',
    myClient: client, myClientPlan: plan, myClientTrainer: trainer,
    plans, trainersForGym, reviews, equipment, progressList, trainerRoutineForMe, checkinHistory, trainerInterest,
    aiGoal: client.physical.goal || 'perder_peso', aiRoutine, routineSource: 'ia',
    classesForGym, classSessions, myBookings, achievementsCatalog, myAchievements, bodyMeasurements, personalRecords, workoutsThisMonth,
    myTrainerRating, trainerRatingDraft: { rating: myTrainerRating ? myTrainerRating.rating : 0, text: myTrainerRating ? (myTrainerRating.text || '') : '' },
    conversationId: null, messages: [], messageDraft: '',
    pendingPayment: null, busy: false,
  });
  if (window.CesAds) window.CesAds.showBanner();
  render();
}

export async function enterTrainerDash(profile, gym, myTrainer) {
  const clientsRaw = (await BolaAPI.clients.listForGym(gym.id)).filter(c => c.trainerUserId === myTrainer.id);
  const plans = await BolaAPI.plans.list(gym.id);
  const trainerClients = clientsRaw.map(c => ({
    ...c,
    plan: (plans.find(p => p.id === c.planId) || { name: '—' }).name,
  }));

  // Etapa 2 — biblioteca de ejercicios (para "Crear rutina"), las sesiones
  // de las clases que este entrenador dicta (Panel/Calendario), una
  // conversación por cliente asignado (Mensajes) y su propio rating (Perfil).
  const [exercisesLib, allClasses, allSessions, trainerReviewsList] = await Promise.all([
    BolaAPI.exercisesLib.list(gym.id),
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
    exercisesLib, trainerClassSessions, trainerReviewsList, trainerConversations,
    trainerActiveConversationId: null, trainerMessages: [], trainerMessageDraft: '',
  });
  if (window.CesAds) window.CesAds.hideBanner();
  render();
}

export async function attachSignedUrls(rows) {
  return Promise.all(rows.map(async r => ({
    ...r,
    url: r.storage_key ? await BolaAPI.photos.signedUrl(r.storage_key) : null,
  })));
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
