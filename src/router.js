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
import { ACTIONS, resumeOwnerSession, resumeAdminSession, resumeClientSession, enterTrainerDash } from './actions.js';

import { viewBoot, viewRole, viewOwnerAuth, viewClientAuth, viewTrainerAuth, viewGymPicker } from './screens/auth.js';
import {
  viewOwnerReg1, viewOwnerReg2, viewOwnerReg3, viewOwnerReg4, viewOwnerDash,
} from './screens/owner.js';
import { viewAdminAuth, viewAdminPending } from './screens/admin.js';
import {
  viewClientReg1, viewClientReg2, viewClientReg3, viewClientReg4,
  viewClientHome, viewClientPhotoRequired, viewWorkout,
} from './screens/client.js';
import { viewTrainerPending, viewTrainerDash } from './screens/trainer.js';

const root = document.getElementById('app');

const SCREENS = {
  boot: viewBoot,
  role: viewRole,
  ownerAuth: viewOwnerAuth,
  adminAuth: viewAdminAuth,
  clientAuth: viewClientAuth,
  ownerReg1: viewOwnerReg1,
  ownerReg2: viewOwnerReg2,
  ownerReg3: viewOwnerReg3,
  ownerReg4: viewOwnerReg4,
  ownerDash: viewOwnerDash,
  adminPending: viewAdminPending,
  clientReg1: viewClientReg1,
  clientReg2: viewClientReg2,
  clientReg3: viewClientReg3,
  clientReg4: viewClientReg4,
  clientHome: viewClientHome,
  workout: viewWorkout,
  trainerAuth: viewTrainerAuth,
  trainerPending: viewTrainerPending,
  trainerDash: viewTrainerDash,
  gymPicker: viewGymPicker,
  clientPhotoRequired: viewClientPhotoRequired,
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
  if (el.dataset.f === 'clientVisitHour') {
    setState({ clientVisitHour: el.value === '' ? null : Number(el.value) });
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

export function render() {
  const snapshot = captureFocus();
  root.innerHTML = (state.offline ? offlineBanner() : '') + (SCREENS[state.screen] || viewRole)();
  restoreFocus(snapshot);
}

// Se actualiza apenas cambia la conexión (no hace falta que el usuario
// intente hacer algo primero para enterarse de que no tiene internet).
window.addEventListener('offline', () => setState({ offline: true }));
window.addEventListener('online', () => setState({ offline: false }));

/* ============================ boot ============================ */
// Al cargar: si hay sesión guardada, saltar directo al panel que
// corresponda según el rol — así no hay que loguearse de nuevo en cada
// visita. Sin sesión, se muestra el selector de rol.

async function boot() {
  render();
  let session;
  try {
    session = await BolaAPI.auth.getSession();
  } catch (err) {
    console.error(err);
    setState({ screen: 'role', error: friendlyError(err) });
    return;
  }
  if (!session) {
    setState({ screen: 'role' });
    return;
  }

  try {
    const profile = await BolaAPI.auth.getMyProfile();
    if (!profile) {
      // getSession() lee la sesión guardada localmente sin validarla;
      // getMyProfile() sí valida contra el servidor y puede devolver null
      // si el token quedó vencido/inválido — ahí no hay nada que resumir.
      await BolaAPI.auth.signOut();
      setState({ screen: 'role' });
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
        setState({ screen: 'role' });
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
      setState({ screen: 'role' });
    }
  } catch (err) {
    console.error(err);
    setState({ screen: 'role', error: friendlyError(err) });
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
    setState({ screen: 'role', error: friendlyError(err) });
    return;
  }
  boot();
}

// Link de invitación de gimnasio (?invite=XXXXX) — solo tiene sentido en la
// web (un click abre el navegador directo con la query string); en la app
// nativa alguien que toca ese mismo link simplemente abre el navegador del
// teléfono, no esta app empaquetada, así que no hace falta manejarlo acá
// como el deep link de confirmación de correo (ese sí reabre la app nativa,
// por el esquema com.ces.gymmanager:// registrado aparte).
function readInviteCodeFromUrl() {
  try {
    const code = new URLSearchParams(window.location.search).get('invite');
    if (code) state.inviteCode = code;
  } catch (_) { /* URL/URLSearchParams no disponible, no es crítico */ }
}

async function initDeepLinksAndBoot() {
  readInviteCodeFromUrl();
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
