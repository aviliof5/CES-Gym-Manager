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
import { render } from './router.js';

// Handle del setInterval del descanso entre series — módulo-scoped porque
// no es parte del estado serializable, solo un recurso a limpiar (ver
// ACTIONS.startRest/skipRest/nextExercise/exitWorkout, todos pasan por acá
// antes de tocar state.workout para nunca dejar dos timers corriendo).
let restTimerId = null;
function clearRestTimer() {
  if (restTimerId) { clearInterval(restTimerId); restTimerId = null; }
}

export const ACTIONS = {
  goto: v => setState({ screen: v, error: '' }),
  togglePasswordVisibility: () => setState({ showPassword: !state.showPassword }),

  signOut: async () => {
    await BolaAPI.auth.signOut();
    if (window.CesAds) window.CesAds.hideBanner();
    Object.assign(state, {
      screen: 'role', session: null, myProfile: null, gym: null, error: '',
      myClient: null, myClientPlan: null, myClientTrainer: null, myTrainer: null,
      activeCharge: null, trainerSelectedClientId: null, trainerSelectedClientDetail: null,
    });
    render();
  },

  /* ---- owner auth ---- */
  setOwnerAuthMode: v => setState({ ownerAuthMode: v, ownerLoginError: '' }),
  ownerSignIn: async () => {
    setState({ busy: true, ownerLoginError: '' });
    try {
      await BolaAPI.auth.signIn({ email: state.ownerLoginEmail, password: state.ownerLoginPassword });
    } catch (err) {
      setState({ busy: false, ownerLoginError: friendlyError(err) });
      return;
    }
    const profile = await BolaAPI.auth.getMyProfile();
    if (profile.role !== 'owner') {
      await BolaAPI.auth.signOut();
      setState({ busy: false, ownerLoginError: 'Esta cuenta no es de dueño.' });
      return;
    }
    state.myProfile = profile;
    state.ownerLoginEmail = ''; state.ownerLoginPassword = '';
    await resumeOwnerSession(profile);
  },

  /* ---- admin auth (se une a un gimnasio ya creado, como un entrenador) ---- */
  setAdminAuthMode: v => setState({ adminAuthMode: v, adminLoginError: '' }),
  adminSignUp: async () => {
    setState({ busy: true, error: '' });
    const a = state.adminReg;
    const result = await BolaAPI.auth.signUpAdmin({ ...a, phone: a.phonePrefix + a.phone });
    if (!result || !result.session) {
      setState({ busy: false, error: 'Te enviamos un correo para confirmar tu cuenta. Confírmalo y volvé a esta pantalla para iniciar sesión.' });
      return;
    }
    await loadGymPicker('adminSignUp');
  },
  adminSignIn: async () => {
    setState({ busy: true, adminLoginError: '' });
    try {
      await BolaAPI.auth.signIn({ email: state.adminLoginEmail, password: state.adminLoginPassword });
    } catch (err) {
      setState({ busy: false, adminLoginError: friendlyError(err) });
      return;
    }
    const profile = await BolaAPI.auth.getMyProfile();
    if (profile.role !== 'admin') {
      await BolaAPI.auth.signOut();
      setState({ busy: false, adminLoginError: 'Esta cuenta no es de administrador.' });
      return;
    }
    // Igual que el entrenador: si el signUp quedó interrumpido por la
    // confirmación de correo, el join al gimnasio nunca se ejecutó.
    if (!profile.gym_id) {
      await loadGymPicker('adminResume');
      return;
    }
    await continueAdminSignIn(profile);
  },

  /* ---- client auth ---- */
  setClientAuthMode: v => setState({ clientAuthMode: v, clientLoginError: '' }),
  clientSignIn: async () => {
    setState({ busy: true, clientLoginError: '' });
    try {
      await BolaAPI.auth.signIn({ email: state.clientLoginEmail, password: state.clientLoginPassword });
    } catch (err) {
      setState({ busy: false, clientLoginError: friendlyError(err) });
      return;
    }
    const profile = await BolaAPI.auth.getMyProfile();
    if (profile.role !== 'client') {
      await BolaAPI.auth.signOut();
      setState({ busy: false, clientLoginError: 'Esta cuenta no es de cliente.' });
      return;
    }
    state.myProfile = profile;
    state.clientLoginEmail = ''; state.clientLoginPassword = '';
    await resumeClientSession(profile);
  },

  /* ---- owner registration (crea el gimnasio) ---- */
  ownerSignUp: async () => {
    setState({ busy: true, error: '' });
    const result = await BolaAPI.auth.signUpOwner({ ...state.ownerReg, phone: state.ownerReg.phonePrefix + state.ownerReg.phone });
    if (!result || !result.session) {
      setState({ busy: false, error: 'Te enviamos un correo para confirmar tu cuenta. Confírmalo y volvé a esta pantalla para iniciar sesión.' });
      return;
    }
    // viewOwnerDash necesita myProfile.role para decidir si muestra la tab
    // de aprobar administradores — se setea acá, no solo al final del
    // asistente, para que esté disponible durante todo el registro.
    const profile = await BolaAPI.auth.getMyProfile();
    setState({ busy: false, screen: 'ownerReg2', myProfile: profile });
  },
  ownerCreateGym: async () => {
    setState({ busy: true, error: '' });
    const gymId = await BolaAPI.gyms.create(state.gymReg);
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

  generateCharge: async clientId => {
    const c = state.clientsForGym.map(enrichClient).find(x => x.id === clientId);
    if (!c) return;
    const paymentId = await BolaAPI.payments.createCashCharge(clientId);
    setState({ activeCharge: { paymentId, clientId, clientName: c.name, amount: c.amount } });
  },
  cancelCharge: async () => {
    if (!state.activeCharge) return;
    await BolaAPI.payments.cancel(state.activeCharge.paymentId);
    setState({ activeCharge: null });
  },
  confirmCharge: async () => {
    if (!state.activeCharge) return;
    await BolaAPI.payments.confirm(state.activeCharge.paymentId);
    const clientsForGym = await BolaAPI.clients.listForGym(state.gym.id);
    setState({ clientsForGym, activeCharge: null });
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
      setState({ busy: false, error: 'Te enviamos un correo para confirmar tu cuenta. Confírmalo y volvé a esta pantalla para iniciar sesión.' });
      return;
    }
    await loadGymPicker('clientSignUp');
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
    const exerciseTexts = buildRoutine(state.aiGoal, state.equipment.map(e => e.name));
    await BolaAPI.routines.generateAi(state.myClient.id, state.aiGoal, exerciseTexts);
    const aiRoutine = await BolaAPI.routines.getAi(state.myClient.id, state.aiGoal);
    setState({ busy: false, aiRoutine });
  },

  /* ---- workout: temporizador de descanso + marcar series (sección 8 del
     pedido original) ---- */
  startWorkout: source => {
    const exercises = (source === 'trainer' ? state.trainerRoutineForMe : state.aiRoutine) || { exercises: [] };
    if (!exercises.exercises.length) return;
    clearRestTimer();
    setState({
      screen: 'workout',
      workout: { exercises: exercises.exercises, source, index: 0, doneSets: {}, restSecondsLeft: 0, finished: false },
    });
  },
  toggleSet: setNum => {
    const w = state.workout;
    if (!w) return;
    const num = Number(setNum); // data-v siempre llega como string
    const key = w.index;
    const current = new Set(w.doneSets[key] instanceof Set ? w.doneSets[key] : []);
    const marking = !current.has(num); // true = se está marcando, false = desmarcando
    if (marking) current.add(num); else current.delete(num);
    setState({ workout: { ...w, doneSets: { ...w.doneSets, [key]: current } } });
    // Descanso después de CADA serie que se marca (no al desmarcarla) —
    // así funciona igual entre la serie 1→2 que entre la 3→4.
    if (marking) ACTIONS.startRest();
  },
  toggleSimpleDone: () => {
    const w = state.workout;
    if (!w) return;
    const key = w.index;
    const wasDone = w.doneSets[key] === true;
    setState({ workout: { ...w, doneSets: { ...w.doneSets, [key]: !wasDone } } });
  },
  startRest: () => {
    clearRestTimer();
    const w = state.workout;
    if (!w) return;
    setState({ workout: { ...w, restSecondsLeft: 60 } });
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
  nextExercise: () => {
    const w = state.workout;
    if (!w) return;
    clearRestTimer();
    if (w.index + 1 >= w.exercises.length) {
      setState({ workout: { ...w, finished: true, restSecondsLeft: 0 } });
    } else {
      setState({ workout: { ...w, index: w.index + 1, restSecondsLeft: 0 } });
    }
  },
  prevExercise: () => {
    const w = state.workout;
    if (!w || w.index === 0) return;
    clearRestTimer();
    setState({ workout: { ...w, index: w.index - 1, restSecondsLeft: 0 } });
  },
  exitWorkout: () => {
    clearRestTimer();
    setState({ screen: 'clientHome', workout: null });
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
  setTrainerAuthMode: v => setState({ trainerAuthMode: v, trainerLoginError: '' }),
  trainerSignUp: async () => {
    setState({ busy: true, error: '' });
    const r = state.trainerReg;
    const result = await BolaAPI.auth.signUpTrainer({ ...r, phone: r.phonePrefix + r.phone });
    if (!result || !result.session) {
      setState({ busy: false, error: 'Te enviamos un correo para confirmar tu cuenta. Confírmalo y volvé a esta pantalla para iniciar sesión.' });
      return;
    }
    await loadGymPicker('trainerSignUp');
  },
  trainerSignIn: async () => {
    setState({ busy: true, trainerLoginError: '' });
    try {
      await BolaAPI.auth.signIn({ email: state.trainerLoginEmail, password: state.trainerLoginPassword });
    } catch (err) {
      setState({ busy: false, trainerLoginError: friendlyError(err) });
      return;
    }
    const profile = await BolaAPI.auth.getMyProfile();
    if (profile.role !== 'trainer') {
      await BolaAPI.auth.signOut();
      setState({ busy: false, trainerLoginError: 'Esta cuenta no es de entrenador.' });
      return;
    }
    // Igual que el cliente: si el signUp quedó interrumpido por la
    // confirmación de correo, el join al gimnasio nunca se ejecutó.
    if (!profile.gym_id) {
      await loadGymPicker('trainerResume');
      return;
    }
    await continueTrainerSignIn(profile);
  },

  /* ---- trainer dashboard ---- */
  trainerTab: v => setState({ trainerTab: v }),
  openClientDetail: async clientId => {
    setState({ trainerSelectedClientId: clientId, trainerRoutineDraftText: '' });
    const [progressRaw, routine] = await Promise.all([
      BolaAPI.progress.listForClient(clientId),
      BolaAPI.routines.getTrainer(clientId),
    ]);
    const progress = await attachSignedUrls(progressRaw);
    setState({ trainerSelectedClientDetail: { progress, routine } });
  },
  closeClientDetail: () => setState({ trainerSelectedClientId: null, trainerSelectedClientDetail: null }),
  addTrainerRoutineExercise: async () => {
    const text = state.trainerRoutineDraftText.trim();
    if (!text || !state.trainerSelectedClientId) return;
    await BolaAPI.routines.addTrainerExercise(state.trainerSelectedClientId, state.myTrainer.id, text);
    const routine = await BolaAPI.routines.getTrainer(state.trainerSelectedClientId);
    setState({ trainerRoutineDraftText: '', trainerSelectedClientDetail: { ...state.trainerSelectedClientDetail, routine } });
  },
  removeTrainerRoutineExercise: async exerciseId => {
    await BolaAPI.routines.removeExercise(exerciseId);
    const routine = await BolaAPI.routines.getTrainer(state.trainerSelectedClientId);
    setState({ trainerSelectedClientDetail: { ...state.trainerSelectedClientDetail, routine } });
  },
  saveTrainerProfile: async () => {
    const { specialty, price } = state.trainerProfileDraft;
    await BolaAPI.trainers.updateProfile(state.myTrainer.id, { specialty: specialty.trim() || state.myTrainer.specialty, price: Number(price) || 0 });
    setState({ myTrainer: { ...state.myTrainer, specialty: specialty.trim() || state.myTrainer.specialty, price: Number(price) || 0 } });
  },
};

/* ============================ screen-entry helpers ============================ */
// Cada una de estas junta los datos que la pantalla necesita ANTES de
// cambiar `screen`, así las funciones de vista no tienen que lidiar con
// datos a medio cargar.

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

export function continueAdminSignUpAfterGym() {
  const r = state.adminReg;
  setState({
    busy: false, screen: 'adminPending', pendingAdminName: r.name,
    adminReg: { name: '', email: '', phone: '', phonePrefix: '+53', password: '' },
    adminAuthMode: 'login',
  });
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
    setState({ busy: false, adminLoginError: 'Tu solicitud fue rechazada. Contacta al dueño del gimnasio.' });
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
    trainerAuthMode: 'login',
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
    setState({ busy: false, trainerLoginError: 'Tu solicitud fue rechazada. Contacta al administrador.' });
    return;
  }
  await enterTrainerDash(profile, gym, myTrainer);
}

// Entrada compartida por el dueño y por un administrador ya aprobado —
// paridad total (ver docs/ROLES_AND_PERMISSIONS.md). viewOwnerDash decide
// internamente si muestra la tab de aprobar administradores según el rol.
export async function enterOwnerDash() {
  const [clientsForGym, trainersForGym, plans, equipment, reviews, gymAdminsForGym] = await Promise.all([
    BolaAPI.clients.listForGym(state.gym.id),
    BolaAPI.trainers.listForGym(state.gym.id),
    BolaAPI.plans.list(state.gym.id),
    BolaAPI.equipment.list(state.gym.id),
    BolaAPI.reviews.listForGym(state.gym.id),
    BolaAPI.admins.listForGym(state.gym.id),
  ]);
  Object.assign(state, { screen: 'ownerDash', ownerTab: 'clientes', clientsForGym, trainersForGym, plans, equipment, reviews, gymAdminsForGym, busy: false });
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

  Object.assign(state, {
    screen: 'clientHome', clientTab: 'inicio',
    myClient: client, myClientPlan: plan, myClientTrainer: trainer,
    plans, trainersForGym, reviews, equipment, progressList, trainerRoutineForMe,
    aiGoal: client.physical.goal || 'perder_peso', aiRoutine, routineSource: 'ia',
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
  Object.assign(state, {
    screen: 'trainerDash', trainerTab: 'clientes', myProfile: profile, gym, myTrainer, trainerClients,
    trainerProfileDraft: { specialty: myTrainer.specialty, price: String(myTrainer.price) },
    trainerSelectedClientId: null, trainerSelectedClientDetail: null, busy: false,
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
