/* Bolá — SCREENS, render(), wiring de eventos (data-a/data-v/data-f), boot()
   y el deep link nativo de confirmación de correo. Es el punto de entrada
   real de la app (index.html/test-harness.html cargan este archivo como
   único <script type="module">). Movido 1:1 desde app.js (Fase 3, ver
   docs/MIGRATION_PLAN.md).

   Import circular con state.js (acá se exporta `render`, que state.js
   importa para que setState() pueda disparar un re-render) y con
   actions.js (acá se importa `ACTIONS` para el dispatch de clicks, y
   actions.js importa `render` de acá para los enterXDash()) — ambos son
   seguros en ES modules: ninguno de los tres módulos invoca un export
   ajeno durante su propia evaluación de nivel superior, solo dentro de
   funciones que corren después de que todo el grafo terminó de cargar. */
'use strict';

import { state, setState } from './state.js';
import { offlineBanner, friendlyError } from './helpers.js';
import { ACTIONS, resumeOwnerSession, resumeAdminSession, resumeClientSession, enterTrainerDash, handleCheckinScan } from './actions.js';
import { paintQrCodes, ensureQrScanner, stopQrScanner } from './qr.js';

import {
  viewBoot, viewLanding, viewLogin, viewInviteWelcome, viewTrainerReg, viewGymPicker,
} from './screens/auth.js';
import {
  viewOwnerReg1, viewOwnerReg2, viewOwnerReg3, viewOwnerReg4, viewOwnerDash, viewScanCheckin,
} from './screens/owner.js';
import { viewAdminReg, viewAdminPending } from './screens/admin.js';
import {
  viewClientReg1, viewClientReg2, viewClientReg3, viewClientReg4,
  viewClientHome, viewClientPhotoRequired, viewWorkout, viewClientChat,
} from './screens/client.js';
import { viewTrainerPending, viewTrainerDash } from './screens/trainer.js';
import { viewExerciseLibrary } from './screens/library.js';
import { viewPlatformDash } from './screens/platform.js';

const root = document.getElementById('app');

// Claves de localStorage para sobrevivir el viaje de ida y vuelta por el
// correo de confirmación (ver resolveOwnerInviteFromUrl/resolveGymInviteFromUrl
// más abajo — el bug real que arreglan: con "Confirm email" activo en
// Supabase, signUpOwner/signUpAdmin/signUpTrainer/signUpClient usan
// emailRedirectTo: undefined en web, así que el link "Confirmar mi correo"
// devuelve al Site URL pelado — sin el ?owner_invite=/?invite= original —
// y sin esto, create_gym()/join_gym() se llamaban con el token/código vacío).
export const OWNER_INVITE_KEY = 'bola_owner_invite_token';
export const GYM_INVITE_KEY = 'bola_gym_invite_code';

const SCREENS = {
  boot: viewBoot,
  landing: viewLanding,
  login: viewLogin,
  inviteWelcome: viewInviteWelcome,
  adminReg: viewAdminReg,
  trainerReg: viewTrainerReg,
  ownerReg1: viewOwnerReg1,
  ownerReg2: viewOwnerReg2,
  ownerReg3: viewOwnerReg3,
  ownerReg4: viewOwnerReg4,
  ownerDash: viewOwnerDash,
  scanCheckin: viewScanCheckin,
  adminPending: viewAdminPending,
  clientReg1: viewClientReg1,
  clientReg2: viewClientReg2,
  clientReg3: viewClientReg3,
  clientReg4: viewClientReg4,
  clientHome: viewClientHome,
  workout: viewWorkout,
  clientChat: viewClientChat,
  exerciseLibrary: viewExerciseLibrary,
  trainerPending: viewTrainerPending,
  trainerDash: viewTrainerDash,
  gymPicker: viewGymPicker,
  clientPhotoRequired: viewClientPhotoRequired,
  platformDash: viewPlatformDash,
};

/** Write a possibly-dotted state path, cloning the parent object. */
function setPath(path, value) {
  const parts = path.split('.');
  if (parts.length === 1) return setState({ [path]: value });
  const [head, key] = parts;
  setState({ [head]: { ...state[head], [key]: value } });
}

root.addEventListener('click', async e => {
  const el = e.target.closest('[data-a]');
  if (!el || !root.contains(el)) return;
  if (el.disabled || state.busy) return;

  // `data-a="goto:adminReg1"` is shorthand for the goto action with an argument.
  let name = el.dataset.a;
  let value = el.dataset.v;
  if (name.includes(':')) {
    const parts = name.split(':');
    name = parts[0];
    value = parts.slice(1).join(':');
  }
  const fn = ACTIONS[name];
  if (!fn) return;
  try {
    if (state.error) setState({ error: '' });
    await fn(value);
  } catch (err) {
    console.error(err);
    setState({ busy: false, error: friendlyError(err) });
  }
});

root.addEventListener('input', e => {
  const el = e.target;
  // <select> is driven by its own change handler below; an `input` event here
  // would re-render first and swallow it.
  if (el.tagName === 'SELECT' || !el.dataset || !el.dataset.f) return;
  if (el.dataset.numeric === 'true') {
    const digits = el.value.replace(/\D/g, '');
    if (digits !== el.value) el.value = digits; // no re-render acá, solo corrige lo tipeado
    setPath(el.dataset.f, digits);
    return;
  }
  setPath(el.dataset.f, el.value);
});

root.addEventListener('change', e => {
  const el = e.target;
  if (!el.dataset || !el.dataset.f) return;
  // Elegir un ejercicio de la biblioteca en "Crear rutina" (Etapa 2, panel
  // de entrenador) también precarga el nombre en el campo `text` — un
  // setPath genérico solo tocaría `exerciseId`, así que este <select> pasa
  // por su propia acción en vez del setPath de abajo.
  if (el.dataset.f === 'trainerRoutineDraft.exerciseId') {
    ACTIONS.selectRoutineExercise(el.value);
    return;
  }
  if (el.tagName === 'SELECT') setPath(el.dataset.f, el.value);
});

/* Re-rendering replaces the DOM, so restore focus and caret on the field the
   user was typing in — keyed by its state path. */
function captureFocus() {
  const el = document.activeElement;
  if (!el || !root.contains(el) || !el.dataset || !el.dataset.f) return null;
  return { field: el.dataset.f, start: el.selectionStart, end: el.selectionEnd };
}

function restoreFocus(snapshot) {
  if (!snapshot) return;
  const el = root.querySelector(`[data-f="${snapshot.field}"]`);
  if (!el) return;
  el.focus();
  if (snapshot.start != null && el.setSelectionRange) {
    try { el.setSelectionRange(snapshot.start, snapshot.end); } catch (_) { /* type has no caret */ }
  }
}

// getUserMedia() rechaza con nombres de DOMException estándar — se traducen
// acá en vez de en friendlyError() (que es sobre errores de red/servidor,
// no de hardware/permisos).
function cameraErrorMessage(err) {
  const name = err && err.name;
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Le negaste el permiso de cámara al navegador. Habilitalo en la configuración del sitio y volvé a intentar.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No encontramos ninguna cámara en este dispositivo.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'La cámara está siendo usada por otra app. Cerrala e intentá de nuevo.';
  }
  return (err && err.message) || 'No pudimos acceder a la cámara.';
}

export function render() {
  const snapshot = captureFocus();
  root.innerHTML = (state.offline ? offlineBanner() : '') + (SCREENS[state.screen] || viewLanding)();
  restoreFocus(snapshot);
  paintQrCodes(root);

  // La cámara de lectura de QR (ver src/qr.js) solo debe estar prendida
  // mientras la pantalla "Escanear QR" está activa — se corta apenas se
  // navega a cualquier otra, para no dejar el hardware ocupado de fondo.
  // El `!state.scanError` es a propósito: si ya falló una vez en esta
  // visita a la pantalla (permiso denegado, sin cámara), NO hay que
  // reintentar en cada render — eso causaría un loop infinito, porque
  // `ensureQrScanner` fallaría de nuevo, dispararía `setState({scanError})`,
  // que dispara OTRO render(), que reintenta, etc. Reintentar de verdad pasa
  // solo si el usuario sale y vuelve a entrar (goToScanCheckin en
  // actions.js limpia scanError antes de navegar acá).
  if (state.screen === 'scanCheckin' && !state.scanError) {
    ensureQrScanner('qrScanVideo', handleCheckinScan).catch(err => {
      console.error('No se pudo acceder a la cámara:', err);
      setState({ scanError: cameraErrorMessage(err) });
    });
  } else if (state.screen !== 'scanCheckin') {
    stopQrScanner();
  }
}

// Se actualiza apenas cambia la conexión (no hace falta que el usuario
// intente hacer algo primero para enterarse de que no tiene internet).
window.addEventListener('offline', () => setState({ offline: true }));
window.addEventListener('online', () => setState({ offline: false }));

/* ============================ boot ============================ */
// Al cargar: si hay sesión guardada, saltar directo al panel que
// corresponda según el rol — así no hay que loguearse de nuevo en cada
// visita. Sin sesión: si hay una invitación válida ya resuelta (ver
// resolveOwnerInviteFromUrl/resolveGymInviteFromUrl más abajo, corren ANTES
// de boot()), va directo a la bienvenida de esa invitación; si no, a la
// portada (Etapa 1 del rediseño — reemplaza el selector de 4 roles).
function entryScreen() {
  return (state.ownerInviteToken || state.inviteRole) ? 'inviteWelcome' : 'landing';
}

async function boot() {
  render();
  let session;
  try {
    session = await BolaAPI.auth.getSession();
  } catch (err) {
    console.error(err);
    setState({ screen: entryScreen(), error: friendlyError(err) });
    return;
  }
  if (!session) {
    setState({ screen: entryScreen() });
    return;
  }

  try {
    const profile = await BolaAPI.auth.getMyProfile();
    if (!profile) {
      // getSession() lee la sesión guardada localmente sin validarla;
      // getMyProfile() sí valida contra el servidor y puede devolver null
      // si el token quedó vencido/inválido — ahí no hay nada que resumir.
      await BolaAPI.auth.signOut();
      setState({ screen: entryScreen() });
      return;
    }
    state.session = session;
    state.myProfile = profile;

    if (profile.role === 'owner') {
      await resumeOwnerSession(profile);
    } else if (profile.role === 'admin') {
      await resumeAdminSession(profile);
    } else if (profile.role === 'client') {
      await resumeClientSession(profile);
    } else if (profile.role === 'trainer') {
      if (!profile.gym_id) {
        // No debería pasar tras el registro (signUpTrainer ya se une al
        // gimnasio), pero por si acaso no hay de dónde leer trainers.
        setState({ screen: entryScreen() });
        return;
      }
      const gym = await BolaAPI.gyms.get(profile.gym_id);
      state.gym = gym;
      const trainersForGym = await BolaAPI.trainers.listForGym(gym.id);
      const myTrainer = trainersForGym.find(t => t.id === profile.id);
      if (!myTrainer || myTrainer.status !== 'approved') {
        setState({ screen: 'trainerPending', pendingTrainerName: profile.name });
      } else {
        await enterTrainerDash(profile, gym, myTrainer);
      }
    } else {
      setState({ screen: entryScreen() });
    }
  } catch (err) {
    console.error(err);
    setState({ screen: entryScreen(), error: friendlyError(err) });
  }
}

/* ======================= deep link (confirmación de email) =======================
   En la app nativa, el link "Confirmar mi correo" de Gmail no puede abrir
   http://localhost:3000 (ver supabase-client.js) — en su lugar abre
   com.ces.gymmanager://auth-callback#access_token=..., y Android se lo
   entrega a esta app en vez de a un navegador (intent-filter en
   AndroidManifest.xml). Dos casos posibles:
   - App cerrada: Android la abre en frío con esa URL como "launch URL".
   - App en segundo plano: dispara el evento appUrlOpen sin reiniciarla.
   En ambos casos se completa la sesión con el token del link y se corre
   boot() para rutear directo al panel que corresponda. */
async function handleAuthDeepLink(url) {
  if (!url || url.indexOf('com.ces.gymmanager://') !== 0) return;
  try {
    await BolaAPI.auth.setSessionFromUrl(url);
  } catch (err) {
    setState({ screen: 'landing', error: friendlyError(err) });
    return;
  }
  boot();
}

// Links de invitación (?invite=XXXXX / ?owner_invite=XXXXX) — solo tienen
// sentido en la web (un click abre el navegador directo con la query
// string); en la app nativa alguien que toca ese mismo link simplemente
// abre el navegador del teléfono, no esta app empaquetada, así que no hace
// falta manejarlos acá como el deep link de confirmación de correo (ese sí
// reabre la app nativa, por el esquema com.ces.gymmanager:// registrado
// aparte). Se resuelven ANTES de boot() (ver initDeepLinksAndBoot) para que
// el primer render ya sepa a qué pantalla entrar — entryScreen() más abajo
// manda directo a viewInviteWelcome (Etapa 1 del rediseño) si alguno de los
// dos resolvió algo. Cuando el query param no está presente, cada uno
// vuelve al toque sin pegarle a la red — un arranque normal no paga ningún
// costo extra por esto.

// Fase 16 — cierra el hueco de "cualquiera puede registrarse como dueño":
// sin un ?owner_invite=TOKEN válido y sin usar, entryScreen() manda a la
// portada en vez de a la bienvenida de invitación de dueño (y aunque
// alguien la forzara a mano, create_gym() rechaza igual del lado servidor
// — ver docs/SECURITY_AUDIT.md). check_owner_invite solo devuelve un
// booleano, nunca expone la tabla de tokens.
async function resolveOwnerInviteFromUrl() {
  let token;
  try { token = new URLSearchParams(window.location.search).get('owner_invite'); }
  catch (_) { token = null; }
  if (!token) {
    // No vino en la URL de esta carga — puede ser el regreso del correo de
    // confirmación (ver comentario del OWNER_INVITE_KEY más arriba). Si se
    // guardó antes, se revalida igual (checkOwnerInvite) antes de usarlo.
    try { token = localStorage.getItem(OWNER_INVITE_KEY); } catch (_) { return; }
    if (!token) return;
  }
  try {
    if (await BolaAPI.platform.checkOwnerInvite(token)) {
      state.ownerInviteToken = token;
      try { localStorage.setItem(OWNER_INVITE_KEY, token); } catch (_) {}
    } else {
      try { localStorage.removeItem(OWNER_INVITE_KEY); } catch (_) {}
    }
  } catch (err) { console.error('No se pudo validar el link de invitación de dueño:', err); }
}

// Generalizado en la Fase 16: antes resolvía siempre "cliente" (único rol
// con invite-code); ahora gym_invites.role dice para qué rol es cada
// código, así que un mismo link ya no sirve para cualquier rol.
async function resolveGymInviteFromUrl() {
  let code;
  try { code = new URLSearchParams(window.location.search).get('invite'); }
  catch (_) { code = null; }
  if (!code) {
    // Mismo motivo que en resolveOwnerInviteFromUrl: puede ser el regreso
    // del correo de confirmación, sin el ?invite= original en la URL.
    try { code = localStorage.getItem(GYM_INVITE_KEY); } catch (_) { return; }
    if (!code) return;
  }
  try {
    const resolved = await BolaAPI.gyms.getByInviteCode(code);
    if (resolved) {
      state.inviteGym = resolved.gym; state.inviteRole = resolved.role;
      try { localStorage.setItem(GYM_INVITE_KEY, code); } catch (_) {}
    } else {
      try { localStorage.removeItem(GYM_INVITE_KEY); } catch (_) {}
    }
  } catch (err) { console.error('No se pudo resolver el link de invitación de gimnasio:', err); }
}

async function initDeepLinksAndBoot() {
  await Promise.all([resolveOwnerInviteFromUrl(), resolveGymInviteFromUrl()]);
  const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (App) {
    App.addListener('appUrlOpen', ({ url }) => handleAuthDeepLink(url));
    try {
      const launch = await App.getLaunchUrl();
      if (launch && launch.url && launch.url.indexOf('com.ces.gymmanager://') === 0) {
        await handleAuthDeepLink(launch.url);
        return; // handleAuthDeepLink ya corrió boot()
      }
    } catch (_) { /* sin launch URL, arranque normal */ }
  }
  boot();
}

initDeepLinksAndBoot();
