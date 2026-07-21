/* Bolá — gym management app, connected to the real backend (BolaAPI, see
   supabase-client.js). Three personas share one client_profiles record: an
   admin manages it, an approved trainer can view its progress and build its
   routine, and the client picks whichever routine source they want.
   Full re-render on setState; every data-fetching action is async. */

'use strict';

/* ============================ static data ============================ */

const EQUIPMENT_SUGGESTIONS = ['Caminadora', 'Bicicleta estática', 'Rack de sentadillas', 'Banco de press', 'Mancuernas', 'Máquina de poleas', 'Remo'];
const HOUR_VALUES = [15, 25, 35, 30, 40, 55, 70, 60, 50, 65, 80, 90, 78, 58, 42, 28, 18];
const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const HEATMAP = {
  'Mañana': [0.3, 0.4, 0.3, 0.4, 0.5, 0.7, 0.5],
  'Tarde': [0.5, 0.5, 0.6, 0.5, 0.6, 0.8, 0.6],
  'Noche': [0.8, 0.75, 0.8, 0.85, 0.9, 0.55, 0.35],
};
const GOALS = [
  { id: 'perder_peso', label: 'Perder peso' },
  { id: 'ganar_musculo', label: 'Ganar músculo' },
  { id: 'resistencia', label: 'Resistencia' },
  { id: 'tonificar', label: 'Tonificar' },
];
// ids en minúscula porque client_profiles.level es el enum experience_level
// del backend ('principiante'/'intermedio'/'avanzado') — no el label capitalizado.
const LEVELS = [
  { id: 'principiante', label: 'Principiante' },
  { id: 'intermedio', label: 'Intermedio' },
  { id: 'avanzado', label: 'Avanzado' },
];
const EXERCISE_LIB = {
  perder_peso: [
    { text: 'Cardio en caminadora - 20 min', kw: 'caminadora' },
    { text: 'Bicicleta estática - 15 min', kw: 'bicicleta' },
    { text: 'Circuito funcional - 3 rondas', kw: null },
    { text: 'Remo - 10 min', kw: 'remo' },
  ],
  ganar_musculo: [
    { text: 'Sentadilla en rack - 4x8', kw: 'rack' },
    { text: 'Press banca - 4x8', kw: 'banco' },
    { text: 'Peso muerto - 3x6', kw: 'rack' },
    { text: 'Máquina de poleas - 3x12', kw: 'poleas' },
  ],
  resistencia: [
    { text: 'Caminadora - 30 min', kw: 'caminadora' },
    { text: 'Bicicleta estática - 20 min', kw: 'bicicleta' },
    { text: 'Remo - 15 min', kw: 'remo' },
    { text: 'Circuito funcional - 4 rondas', kw: null },
  ],
  tonificar: [
    { text: 'Mancuernas - 3x15', kw: 'mancuernas' },
    { text: 'Máquina de poleas - 3x15', kw: 'poleas' },
    { text: 'Circuito funcional - 3 rondas', kw: null },
    { text: 'Bicicleta estática - 10 min', kw: 'bicicleta' },
  ],
};
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DURATION_LABELS = { diario: 'Diario', mensual: 'Mensual', anual: 'Anual' };

const LOGO_SVG = `<svg viewBox="0 0 100 100" width="34" height="34"><path d="M20 18 h60 a12 12 0 0 1 12 12 v28 a12 12 0 0 1 -12 12 H42 L28 84 V70 H20 a12 12 0 0 1 -12 -12 V30 a12 12 0 0 1 12 -12 Z" fill="none" stroke="#0B0D10" stroke-width="7" stroke-linejoin="round"/><rect x="34" y="40" width="32" height="7" rx="3.5" fill="#0B0D10"/><rect x="26" y="33" width="8" height="21" rx="3" fill="#0B0D10"/><rect x="66" y="33" width="8" height="21" rx="3" fill="#0B0D10"/></svg>`;

const ICON_PATHS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  dumbbell: '<path d="M4 9v6M2 10v4M20 9v6M22 10v4M8 8v8M16 8v8M8 12h8"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6"/><circle cx="17" cy="8" r="2.5"/><path d="M17 14c2.8 0 5 2.3 5 6"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/>',
  bars: '<path d="M4 20V10M12 20V4M20 20v-7"/>',
  star: '<path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.2-5.4 3.2 1.3-6L3.3 9.2l6.1-.6L12 3z"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  camera: '<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13.5" r="3.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  chat: '<path d="M4 5h16v11H8l-4 4V5z"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9z"/><path d="M9 12l2 2 4-4"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M6 16c.5-1.8 2-2.5 2.5-2.5S11 14.2 11.5 16M14 9h4M14 13h4"/>',
  run: '<circle cx="14" cy="5" r="2"/><path d="M9 20l2-5 2 1 2 5M8 13l3-3 2 2 3-1M6 9l3-2"/>',
};

function iconSpan(name, size) {
  const paths = ICON_PATHS[name] || '';
  return `<span class="icon icon--${size || 16}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></span>`;
}

/* ============================ state ============================ */

const state = {
  screen: 'boot',
  session: null,
  myProfile: null,   // {id, role, gym_id, name, email, phone}
  gym: null,          // {id, name, address, hours}
  busy: false,
  error: '',

  adminTab: 'clientes',
  clientTab: 'inicio',
  trainerTab: 'clientes',

  adminAuthMode: 'login',
  adminLoginEmail: '', adminLoginPassword: '', adminLoginError: '',
  adminReg: { name: '', email: '', phone: '', password: '' },
  gymReg: { name: '', address: '', hours: '' },

  equipment: [],
  newEquipment: '',

  plans: [],
  newPlanName: '', newPlanPrice: '', newPlanDuration: 'Mensual', editingPlanId: null,

  clientsForGym: [],
  trainersForGym: [],
  billingFilter: 'mensual',
  activeCharge: null,   // {paymentId, clientId, clientName, amount, status}

  reviews: [],
  newCommentText: '', newCommentRating: 5,

  clientAuthMode: 'login',
  clientLoginEmail: '', clientLoginPassword: '', clientLoginError: '',
  clientReg: { name: '', email: '', phone: '', password: '', photoFile: null, photoPreviewUrl: null },
  clientPhysicalReg: { weight: '', height: '', age: '', level: 'principiante', goal: 'perder_peso' },
  approvedTrainersForReg: [],
  selectedPlanId: null, wantsTrainer: null, selectedTrainerId: null,
  gymList: [], selectedGymId: null, gymPickerNext: null,

  myClient: null,
  myClientPlan: null,
  myClientTrainer: null,
  progressList: [],
  routineSource: 'ia',
  aiGoal: 'perder_peso',
  aiRoutine: null,          // {id, exercises:[{id,text}]}
  trainerRoutineForMe: null,
  pendingPayment: null,     // {id, amount, status}
  clientVisitHour: null,

  trainerAuthMode: 'login',
  trainerLoginEmail: '', trainerLoginPassword: '', trainerLoginError: '',
  trainerReg: { name: '', email: '', phone: '', password: '', specialty: '', price: '' },
  pendingTrainerName: '',

  myTrainer: null,
  trainerClients: [],
  trainerSelectedClientId: null,
  trainerSelectedClientDetail: null,   // {progress:[], routine:{id,exercises}}
  trainerRoutineDraftText: '',
  trainerProfileDraft: { specialty: '', price: '' },
};

function setState(patch) {
  Object.assign(state, patch);
  render();
}

/* ============================ helpers ============================ */

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function initials(name) {
  return (name || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function buildRoutine(goal, equipmentNames) {
  const lib = EXERCISE_LIB[goal] || [];
  const eqLower = equipmentNames.map(e => e.toLowerCase());
  const matched = lib.filter(ex => ex.kw === null || eqLower.some(e => e.includes(ex.kw)));
  return (matched.length ? matched : lib).map(ex => ex.text);
}

function statusMeta(st) {
  if (st === 'al_dia') return { label: 'Al día', cls: 'badge badge--al_dia' };
  if (st === 'pendiente') return { label: 'Pendiente', cls: 'badge badge--pendiente' };
  return { label: 'Vencido', cls: 'badge badge--vencido' };
}

function friendlyError(err) {
  return (err && err.message) || 'Ocurrió un error inesperado. Intenta de nuevo.';
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr + 'T00:00:00') - new Date(new Date().toDateString());
  return Math.round(ms / 86400000);
}

// Enriches a raw client_profiles row (from BolaAPI.clients.*) with its plan
// and trainer objects, resolved from the gym's already-loaded plans/trainers
// lists — keeps the render functions reading c.plan/c.amount/c.type like
// before, without an extra fetch per client.
function enrichClient(c) {
  const plan = state.plans.find(p => p.id === c.planId) || { name: '—', price: 0, duration: 'mensual' };
  const trainer = c.trainerUserId ? state.trainersForGym.find(t => t.id === c.trainerUserId) : null;
  return {
    ...c,
    plan: plan.name,
    amount: plan.price + (trainer ? trainer.price : 0),
    type: plan.duration,
    lastPayment: c.lastPaymentAt ? c.lastPaymentAt.slice(0, 10) : null,
    trainer,
  };
}

/** `data-a` dispatches through ACTIONS; `data-v` carries the argument. */
function act(name, value) {
  return `data-a="${name}"` + (value === undefined ? '' : ` data-v="${esc(value)}"`);
}

function chip(active, variant, extraStyle) {
  const style = extraStyle ? ` style="${extraStyle}"` : '';
  return `class="chip chip--${variant}${active ? ' is-active' : ''}"${style}`;
}

function stepBars(step, total, variant) {
  const bars = [];
  for (let i = 1; i <= total; i++) bars.push(`<i class="${i <= step ? 'on' : ''}"></i>`);
  return `<div class="step-bars ${variant}">${bars.join('')}</div>`;
}

function stepHead(label, backAction) {
  return `<div class="step-head">
    <div class="back" ${act(backAction)}>&lsaquo;</div>
    <div class="step-label">${esc(label)}</div>
  </div>`;
}

// Marco compartido por las pantallas de acceso (admin/cliente/entrenador):
// ícono + título + subtítulo + banner de error, con el contenido propio
// (toggle login/registro + formulario o botón) inyectado por el llamador.
function authScreen({ label, icon, accent, accentBg, title, subtitle, backAction, inner, footer }) {
  return `<div class="col">
    <div class="step-head" style="justify-content:space-between">
      <div class="back" ${act(backAction)}>&lsaquo;</div>
      <div class="step-label">${esc(label)}</div>
      <div style="width:32px"></div>
    </div>
    <div class="form-body" style="position:relative;z-index:0">
      <div class="gym-watermark" style="color:${accent}">${iconSpan(icon)}</div>
      <div style="width:44px;height:44px;border-radius:12px;background:${accentBg};display:flex;align-items:center;justify-content:center;color:${accent};margin-bottom:16px">${iconSpan(icon, 22)}</div>
      <div class="title">${esc(title)}</div>
      <div class="subtitle">${esc(subtitle)}</div>
      ${errorBanner()}
      ${inner}
    </div>
    ${footer}
  </div>`;
}

function sectionTitle(text, iconKey, extraStyle) {
  return `<div class="section-title" style="display:flex;align-items:center;gap:6px${extraStyle ? ';' + extraStyle : ''}">${iconSpan(iconKey, 14)}<span>${esc(text)}</span></div>`;
}

function tabsMarkup(defs, activeId, actionName) {
  return defs.map(([id, label, ic]) =>
    `<div ${act(actionName, id)} class="tab${activeId === id ? ' is-active' : ''}">${iconSpan(ic, 16)}<span>${label}</span></div>`).join('');
}

function textField(field, placeholder, value, opts) {
  const o = opts || {};
  return `<input class="field${o.sm ? ' field--sm' : ''}" type="${o.type || 'text'}"
    placeholder="${esc(placeholder)}" value="${esc(value)}" data-f="${field}"
    ${o.style ? `style="${o.style}"` : ''}/>`;
}

function errorBanner() {
  if (!state.error) return '';
  return `<div style="margin:0 22px 12px;background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.4);border-radius:12px;padding:10px 14px;font-size:12.5px;color:var(--red)">${esc(state.error)}</div>`;
}

// Crédito de marca — solo en las pantallas principales (selector de rol y
// los tres paneles de inicio), no en cada paso de los asistentes.
function devCredit() {
  return `<div style="text-align:center;padding:8px 0 2px;font-size:9.5px;color:var(--muted-dim);letter-spacing:0.02em">Desarrollado por Cuban Enterprise Solution (CES)</div>`;
}

/* ============================ screens ============================ */

function viewBoot() {
  return `<div style="flex:1;display:flex;align-items:center;justify-content:center">
    <div style="width:44px;height:44px;border-radius:14px;background:var(--lime);display:flex;align-items:center;justify-content:center">${LOGO_SVG}</div>
  </div>`;
}

function viewRole() {
  return `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:32px 28px 48px;gap:36px;position:relative;z-index:0">
    <div class="gym-watermark">${iconSpan('dumbbell')}</div>
    <div>
      <div style="width:56px;height:56px;border-radius:16px;background:var(--lime);margin-bottom:22px;display:flex;align-items:center;justify-content:center">${LOGO_SVG}</div>
      <div style="font-size:26px;font-weight:900;line-height:1.15;letter-spacing:-0.4px">CES Gym Manager</div>
      <div style="font-size:14px;color:var(--muted);margin-top:10px;line-height:1.5">Administra tu gimnasio, entrena a tus clientes o sigue tu plan personalizado, todo en un solo lugar.</div>
    </div>
    ${errorBanner()}
    <div style="display:flex;flex-direction:column;gap:14px">
      <div ${act('goto', 'adminAuth')} class="card" style="border-radius:18px;padding:20px;cursor:pointer;display:flex;align-items:center;gap:16px">
        <div style="width:44px;height:44px;border-radius:12px;background:rgba(215,255,62,0.15);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--lime)">${iconSpan('dumbbell', 22)}</div>
        <div style="flex:1">
          <div style="font-size:16px;font-weight:700">Soy Administrador</div>
          <div style="font-size:12.5px;color:var(--muted);margin-top:3px">Registra tu gimnasio y gestiona clientes</div>
        </div>
      </div>
      <div ${act('goto', 'clientAuth')} class="card" style="border-radius:18px;padding:20px;cursor:pointer;display:flex;align-items:center;gap:16px">
        <div style="width:44px;height:44px;border-radius:12px;background:rgba(52,211,153,0.15);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--mint)">${iconSpan('run', 22)}</div>
        <div style="flex:1">
          <div style="font-size:16px;font-weight:700">Soy Cliente</div>
          <div style="font-size:12.5px;color:var(--muted);margin-top:3px">Únete a un gimnasio y entrena</div>
        </div>
      </div>
      <div ${act('goto', 'trainerAuth')} class="card" style="border-radius:18px;padding:20px;cursor:pointer;display:flex;align-items:center;gap:16px">
        <div style="width:44px;height:44px;border-radius:12px;background:rgba(251,191,36,0.15);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--amber)">${iconSpan('clipboard', 22)}</div>
        <div style="flex:1">
          <div style="font-size:16px;font-weight:700">Soy Entrenador</div>
          <div style="font-size:12.5px;color:var(--muted);margin-top:3px">Gestiona rutinas y progreso de tus clientes</div>
        </div>
      </div>
    </div>
    ${devCredit()}
  </div>`;
}

function viewAdminAuth() {
  const mode = state.adminAuthMode;
  const toggle = `<div style="display:flex;gap:8px;margin-bottom:20px">
    <div ${act('setAdminAuthMode', 'login')} ${chip(mode === 'login', 'lime', 'flex:1;text-align:center')}>Iniciar sesión</div>
    <div ${act('setAdminAuthMode', 'register')} ${chip(mode === 'register', 'lime', 'flex:1;text-align:center')}>Registrarme</div>
  </div>`;

  if (mode === 'register') {
    return authScreen({
      label: 'Acceso de administrador', icon: 'dumbbell', accent: 'var(--lime)', accentBg: 'rgba(215,255,62,0.15)',
      title: 'Registra tu gimnasio', subtitle: 'Vas a crear tu cuenta de administrador y configurar tu gimnasio en 4 pasos rápidos.',
      backAction: 'goto:role', inner: toggle,
      footer: `<div class="form-foot"><button class="btn btn--lime" ${act('goto', 'adminReg1')}>Comenzar registro</button></div>`,
    });
  }

  const invalid = state.busy || !(state.adminLoginEmail.trim() && state.adminLoginPassword.trim());
  const inner = `${toggle}
    <div class="stack">
      ${textField('adminLoginEmail', 'Correo electrónico', state.adminLoginEmail)}
      ${textField('adminLoginPassword', 'Contraseña', state.adminLoginPassword, { type: 'password' })}
    </div>
    ${state.adminLoginError ? `<div style="font-size:12px;color:var(--red);margin-top:10px">${esc(state.adminLoginError)}</div>` : ''}`;

  return authScreen({
    label: 'Acceso de administrador', icon: 'dumbbell', accent: 'var(--lime)', accentBg: 'rgba(215,255,62,0.15)',
    title: 'Bienvenido de nuevo', subtitle: 'Ingresa con el correo y contraseña de tu gimnasio',
    backAction: 'goto:role', inner,
    footer: `<div class="form-foot"><button class="btn btn--lime" ${act('adminSignIn')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Un momento…' : 'Ingresar'}</button></div>`,
  });
}

function viewClientAuth() {
  const mode = state.clientAuthMode;
  const toggle = `<div style="display:flex;gap:8px;margin-bottom:20px">
    <div ${act('setClientAuthMode', 'login')} ${chip(mode === 'login', 'mint', 'flex:1;text-align:center')}>Iniciar sesión</div>
    <div ${act('setClientAuthMode', 'register')} ${chip(mode === 'register', 'mint', 'flex:1;text-align:center')}>Registrarme</div>
  </div>`;

  if (mode === 'register') {
    return authScreen({
      label: 'Acceso de cliente', icon: 'run', accent: 'var(--mint)', accentBg: 'rgba(52,211,153,0.15)',
      title: 'Únete a tu gimnasio', subtitle: 'Vas a crear tu cuenta y elegir tu plan en 4 pasos rápidos.',
      backAction: 'goto:role', inner: toggle,
      footer: `<div class="form-foot"><button class="btn btn--mint" ${act('goto', 'clientReg1')}>Comenzar registro</button></div>`,
    });
  }

  const invalid = state.busy || !(state.clientLoginEmail.trim() && state.clientLoginPassword.trim());
  const inner = `${toggle}
    <div class="stack">
      ${textField('clientLoginEmail', 'Correo electrónico', state.clientLoginEmail)}
      ${textField('clientLoginPassword', 'Contraseña', state.clientLoginPassword, { type: 'password' })}
    </div>
    ${state.clientLoginError ? `<div style="font-size:12px;color:var(--red);margin-top:10px">${esc(state.clientLoginError)}</div>` : ''}`;

  return authScreen({
    label: 'Acceso de cliente', icon: 'run', accent: 'var(--mint)', accentBg: 'rgba(52,211,153,0.15)',
    title: 'Bienvenido de nuevo', subtitle: 'Ingresa con tu correo y contraseña',
    backAction: 'goto:role', inner,
    footer: `<div class="form-foot"><button class="btn btn--mint" ${act('clientSignIn')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Un momento…' : 'Ingresar'}</button></div>`,
  });
}

/* ---------------- admin: registro ---------------- */

function viewAdminReg1() {
  const a = state.adminReg;
  const invalid = !(a.name.trim() && a.email.trim() && a.phone.trim() && a.password.trim()) || state.busy;
  return `<div class="col">
    ${stepHead('Paso 1 de 4 · Registro Administrador', 'goto:adminAuth')}
    ${stepBars(1, 4, 'lime')}
    <div class="form-body">
      <div class="title">Tus datos personales</div>
      <div class="subtitle">Campos obligatorios para completar tu registro</div>
      ${errorBanner()}
      <div class="stack">
        ${textField('adminReg.name', 'Nombre completo *', a.name)}
        ${textField('adminReg.email', 'Correo electrónico *', a.email)}
        ${textField('adminReg.phone', 'Teléfono *', a.phone)}
        ${textField('adminReg.password', 'Contraseña *', a.password, { type: 'password' })}
      </div>
    </div>
    <div class="form-foot">
      <button class="btn btn--lime" ${act('adminSignUp')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Creando cuenta…' : 'Continuar'}</button>
    </div>
  </div>`;
}

function viewAdminReg2() {
  const g = state.gymReg;
  const invalid = !(g.name.trim() && g.address.trim() && g.hours.trim()) || state.busy;
  return `<div class="col">
    ${stepHead('Paso 2 de 4 · Datos del gimnasio', 'goto:adminReg1')}
    ${stepBars(2, 4, 'lime')}
    <div class="form-body">
      <div class="title">Tu gimnasio</div>
      <div class="subtitle">Estos datos los verán tus clientes</div>
      ${errorBanner()}
      <div class="stack">
        ${textField('gymReg.name', 'Nombre del gimnasio *', g.name)}
        ${textField('gymReg.address', 'Dirección *', g.address)}
        ${textField('gymReg.hours', 'Horario (ej. 6:00 - 22:00) *', g.hours)}
      </div>
    </div>
    <div class="form-foot">
      <button class="btn btn--lime" ${act('adminCreateGym')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Creando gimnasio…' : 'Continuar'}</button>
    </div>
  </div>`;
}

function viewAdminReg3() {
  const chips = state.equipment.map(e => `
    <div style="display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--line);border-radius:100px;padding:8px 8px 8px 14px;font-size:13px">
      <span>${esc(e.name)}</span>
      <span ${act('removeEquipment', e.id)} style="width:18px;height:18px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;color:var(--muted)">&times;</span>
    </div>`).join('');

  const have = new Set(state.equipment.map(e => e.name));
  const suggestions = EQUIPMENT_SUGGESTIONS.filter(s => !have.has(s)).map(s =>
    `<div ${act('addEquipment', s)} style="background:var(--surface-dim);border:1px dashed rgba(255,255,255,0.18);border-radius:100px;padding:7px 13px;font-size:12.5px;color:var(--muted);cursor:pointer">+ ${s}</div>`).join('');

  return `<div class="col">
    ${stepHead('Paso 3 de 4 · Equipo disponible', 'goto:adminReg2')}
    ${stepBars(3, 4, 'lime')}
    <div class="form-body">
      <div class="title">Máquinas y equipo</div>
      <div class="subtitle" style="margin-bottom:18px">Agrega cada máquina que tenga tu gym. Esto ayuda a recomendar rutinas con IA a tus clientes.</div>
      ${errorBanner()}
      <div style="display:flex;gap:8px;margin-bottom:16px">
        ${textField('newEquipment', 'Ej. Máquina de poleas', state.newEquipment, { sm: true, style: 'flex:1' })}
        <button ${act('addEquipmentFromInput')} style="background:var(--lime);border:none;border-radius:12px;padding:0 18px;color:var(--bg);font-weight:700;font-size:20px;cursor:pointer">+</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:${state.equipment.length && suggestions ? '16px' : '0'}">${chips}</div>
      ${suggestions ? `<div style="font-size:11px;color:var(--muted);margin-bottom:8px">Sugeridas</div><div style="display:flex;flex-wrap:wrap;gap:8px">${suggestions}</div>` : ''}
    </div>
    <div class="form-foot">
      <button class="btn btn--lime" ${act('goto', 'adminReg4')}>Continuar</button>
    </div>
  </div>`;
}

function viewAdminReg4() {
  return viewPlansEditor({
    stepHeader: `${stepHead('Paso 4 de 4 · Planes de membresía', 'goto:adminReg3')}${stepBars(4, 4, 'lime')}`,
    finishButton: `<div class="form-foot"><button class="btn btn--lime" ${act('adminDashFromReg')}>Finalizar registro</button></div>`,
  });
}

// Compartido entre el paso 4 del registro y la pestaña de Facturas... no —
// entre el paso 4 del registro y una futura edición de planes; hoy solo lo
// usa el registro, pero queda separado para no duplicar el formulario.
function viewPlansEditor({ stepHeader, finishButton }) {
  const rows = state.plans.map(p => `
    <div class="card" style="border-color:${state.editingPlanId === p.id ? 'var(--lime)' : 'var(--line)'};padding:14px 16px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:14.5px;font-weight:700">${esc(p.name)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(DURATION_LABELS[p.duration] || p.duration)} · $${esc(p.price)}</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <div ${act('editPlan', p.id)} style="font-size:12px;font-weight:700;color:var(--lime);cursor:pointer">Editar</div>
        <div ${act('deletePlan', p.id)} style="font-size:12px;font-weight:700;color:var(--red);cursor:pointer">Eliminar</div>
      </div>
    </div>`).join('');

  const durations = ['Diario', 'Mensual', 'Anual'].map(d =>
    `<div ${act('setPlanDuration', d)} ${chip(state.newPlanDuration === d, 'lime')}>${d}</div>`).join('');

  const editing = !!state.editingPlanId;

  return `<div class="col">
    ${stepHeader}
    <div class="form-body">
      <div class="title">Crea tus planes</div>
      <div class="subtitle" style="margin-bottom:18px">Tus clientes elegirán entre estos al registrarse. Puedes editar o eliminar cualquiera.</div>
      ${errorBanner()}
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:18px">${rows}</div>
      <div class="card--dashed">
        <div style="font-size:13px;font-weight:700;color:var(--muted)">${editing ? 'Editar plan' : 'Agregar plan'}</div>
        ${textField('newPlanName', 'Nombre del plan', state.newPlanName, { sm: true })}
        ${textField('newPlanPrice', 'Precio (USD)', state.newPlanPrice, { sm: true })}
        <div style="display:flex;gap:8px">${durations}</div>
        <div style="display:flex;gap:8px">
          <button ${act('savePlan')} style="flex:1;background:var(--lime);border:none;border-radius:10px;padding:12px;color:var(--bg);font-weight:700;font-size:13.5px;cursor:pointer">${editing ? 'Guardar cambios' : 'Agregar plan'}</button>
          ${editing ? `<button ${act('cancelEditPlan')} style="background:var(--surface-2);border:none;border-radius:10px;padding:12px 16px;color:var(--muted);font-weight:700;font-size:13.5px;cursor:pointer">Cancelar</button>` : ''}
        </div>
      </div>
    </div>
    ${finishButton}
  </div>`;
}

/* ---------------- admin dashboard ---------------- */

function viewAdminClientes() {
  const rows = state.clientsForGym.map(enrichClient).map(c => {
    const m = statusMeta(c.status);
    const showCharge = state.activeCharge && state.activeCharge.clientId === c.id;
    return `<div class="card" style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="avatar">${esc(initials(c.name))}</div>
          <div>
            <div style="font-size:14.5px;font-weight:700">${esc(c.name)}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(c.plan)} · $${esc(c.amount)}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <div class="${m.cls}">${m.label}</div>
          <div ${act('generateCharge', c.id)} style="font-size:11.5px;color:var(--lime);cursor:pointer;font-weight:600">Cobrar / QR</div>
        </div>
      </div>
      ${showCharge ? `<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px;display:flex;gap:12px;align-items:center">
        <div class="qr qr--sm"></div>
        <div style="flex:1">
          <div style="font-size:12.5px;font-weight:700">Cobro pendiente · $${esc(state.activeCharge.amount)} en efectivo</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:2px">Confirma solo cuando ${esc(c.name)} te entregue el efectivo en el mostrador</div>
          <div style="display:flex;gap:14px;margin-top:6px">
            <div ${act('confirmCharge')} style="font-size:11.5px;color:var(--mint);cursor:pointer;font-weight:700">Confirmar efectivo recibido</div>
            <div ${act('cancelCharge')} style="font-size:11.5px;color:var(--red);cursor:pointer;font-weight:600">Cancelar</div>
          </div>
        </div>
      </div>` : ''}
    </div>`;
  }).join('');

  return `<div class="pane">
    ${errorBanner()}
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px">${state.clientsForGym.length} clientes registrados</div>
    ${rows}
  </div>`;
}

function viewAdminEntrenadores() {
  const pending = state.trainersForGym.filter(t => t.status === 'pending');
  const approved = state.trainersForGym.filter(t => t.status === 'approved');
  const clientsOf = trainerId => state.clientsForGym.filter(c => c.trainerUserId === trainerId).map(c => c.name);

  const pendingBlock = pending.length ? `
    <div class="section-title" style="color:var(--amber);margin-bottom:10px">Solicitudes pendientes (${pending.length})</div>
    ${pending.map(t => `
      <div class="card" style="border-color:rgba(251,191,36,0.35);margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="avatar avatar--sq avatar--amber">${esc(initials(t.name))}</div>
          <div style="flex:1">
            <div style="font-size:14.5px;font-weight:700">${esc(t.name)}</div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:2px">${esc(t.specialty)} · $${esc(t.price)}/mes</div>
            <div style="font-size:11px;color:var(--muted);margin-top:1px">${esc(t.email)} · ${esc(t.phone)}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button ${act('approveTrainer', t.id)} style="flex:1;background:var(--mint);border:none;border-radius:10px;padding:10px;color:var(--bg);font-weight:700;font-size:12.5px;cursor:pointer">Aprobar</button>
          <button ${act('rejectTrainer', t.id)} style="flex:1;background:var(--surface-2);border:none;border-radius:10px;padding:10px;color:var(--red);font-weight:700;font-size:12.5px;cursor:pointer">Rechazar</button>
        </div>
      </div>`).join('')}
  ` : '';

  const rows = approved.map(t => {
    const names = clientsOf(t.id);
    return `<div class="card" style="margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="avatar avatar--sq avatar--lime">${esc(initials(t.name))}</div>
        <div style="flex:1">
          <div style="font-size:14.5px;font-weight:700">${esc(t.name)}</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:2px">${esc(t.specialty)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:var(--muted)">${names.length} ${names.length === 1 ? 'cliente' : 'clientes'}</div>
          <div style="font-size:12px;font-weight:700;color:var(--lime);margin-top:2px">$${esc(t.price)}/mes</div>
        </div>
      </div>
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06)">
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px">Clientes asignados</div>
        ${names.length
          ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${names.map(n => `<div class="pill pill--flat">${esc(n)}</div>`).join('')}</div>`
          : `<div style="font-size:11.5px;color:var(--muted-dim)">Sin clientes asignados aún</div>`}
      </div>
    </div>`;
  }).join('');

  return `<div class="pane">
    ${errorBanner()}
    ${pendingBlock}
    <div style="font-size:12px;color:var(--muted);margin-bottom:12px">${approved.length} entrenadores activos en tu gym</div>
    ${rows}
  </div>`;
}

function viewAdminFacturacion() {
  const f = state.billingFilter;
  const enriched = state.clientsForGym.map(enrichClient);
  const inFilter = enriched.filter(c => c.type === f);
  const label = f === 'diario' ? 'diarios' : f === 'mensual' ? 'mensuales' : 'anuales';
  const filters = ['diario', 'mensual', 'anual'].map(k =>
    `<div ${act('setBillingFilter', k)} ${chip(f === k, 'lime', 'flex:1;text-align:center')}>${k === 'diario' ? 'Diario' : k === 'mensual' ? 'Mensual' : 'Anual'}</div>`).join('');

  const total = inFilter.reduce((a, c) => a + c.amount, 0);
  const count = st => inFilter.filter(c => c.status === st).length;

  const rows = inFilter.map(c => {
    const m = statusMeta(c.status);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 4px;border-bottom:1px solid rgba(255,255,255,0.06)">
      <div>
        <div style="font-size:13.5px;font-weight:600">${esc(c.name)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${c.lastPayment ? 'Último pago: ' + esc(c.lastPayment) : 'Sin pagos aún'}</div>
      </div>
      <div class="${m.cls}">${m.label}</div>
    </div>`;
  }).join('');

  return `<div class="pane">
    ${errorBanner()}
    <div style="display:flex;gap:8px;margin-bottom:16px">${filters}</div>
    <div class="card" style="border-radius:16px;padding:18px;margin-bottom:16px">
      <div style="font-size:12px;color:var(--muted)">Ingresos ${label}</div>
      <div style="font-size:26px;font-weight:900;color:var(--lime);margin-top:4px">$${total}</div>
      <div style="display:flex;gap:16px;margin-top:14px">
        <div><div style="font-size:15px;font-weight:800;color:var(--mint)">${count('al_dia')}</div><div style="font-size:10.5px;color:var(--muted)">Al día</div></div>
        <div><div style="font-size:15px;font-weight:800;color:var(--amber)">${count('pendiente')}</div><div style="font-size:10.5px;color:var(--muted)">Pendiente</div></div>
        <div><div style="font-size:15px;font-weight:800;color:var(--red)">${count('vencido')}</div><div style="font-size:10.5px;color:var(--muted)">Vencido</div></div>
      </div>
    </div>
    ${rows}
  </div>`;
}

function barChart(variant) {
  const max = Math.max.apply(null, HOUR_VALUES);
  const cols = HOUR_VALUES.map((v, i) => {
    const h = Math.round(v / max * 100);
    const bg = variant === 'admin'
      ? 'var(--lime)'
      : (state.clientVisitHour === i ? 'var(--mint)' : `rgba(215,255,62,${0.3 + 0.6 * (v / max)})`);
    return `<div class="chart-col"><i style="height:${h}%;background:${bg}"></i></div>`;
  }).join('');
  return `<div class="chart">${cols}</div>
    <div class="chart-axis"><span>6h</span><span>14h</span><span>22h</span></div>`;
}

function viewAdminTrafico() {
  const rows = Object.keys(HEATMAP).map(label => `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      <div style="width:44px;font-size:9.5px;color:var(--muted)">${label}</div>
      <div style="flex:1;display:flex;gap:5px">
        ${HEATMAP[label].map(v => `<div style="flex:1;height:22px;border-radius:4px;background:rgba(215,255,62,${v})"></div>`).join('')}
      </div>
    </div>`).join('');

  return `<div class="pane">
    ${sectionTitle('Tráfico por hora (hoy)', 'bars', 'margin-bottom:12px')}
    <div style="font-size:11px;color:var(--muted);margin:-4px 0 10px">Datos de ejemplo — todavía no conectados a check-ins reales.</div>
    ${barChart('admin')}
    <div class="section-title" style="margin:20px 0 12px">Mapa de calor semanal</div>
    <div style="background:var(--surface);border-radius:14px;padding:12px;border:1px solid var(--line)">
      ${rows}
      <div style="display:flex;gap:6px;padding-left:50px;margin-top:2px">
        ${DAY_LABELS.map(d => `<div style="flex:1;text-align:center;font-size:9px;color:var(--muted)">${d}</div>`).join('')}
      </div>
    </div>
  </div>`;
}

function commentCards(list) {
  return list.map(cm => `
    <div class="card" style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between">
        <div style="font-size:13.5px;font-weight:700">${esc(cm.name)}</div>
        <div style="font-size:12px;color:var(--amber)">${'★'.repeat(cm.rating)}${'☆'.repeat(5 - cm.rating)}</div>
      </div>
      <div style="font-size:13px;color:var(--text-soft);margin-top:6px;line-height:1.5">${esc(cm.text)}</div>
      <div style="font-size:10.5px;color:var(--muted);margin-top:8px">${esc(cm.date)}</div>
    </div>`).join('');
}

function viewAdminComentarios() {
  const avg = state.reviews.length
    ? (state.reviews.reduce((a, c) => a + c.rating, 0) / state.reviews.length).toFixed(1)
    : '—';
  return `<div class="pane">
    ${sectionTitle('Opiniones de clientes', 'star', 'margin-bottom:4px')}
    <div class="hint" style="margin-bottom:16px">Promedio ${avg} / 5 · ${state.reviews.length} reseñas</div>
    ${commentCards(state.reviews)}
  </div>`;
}

const ADMIN_TABS = [['clientes', 'Clientes', 'users'], ['entrenadores', 'Coaches', 'clipboard'], ['facturacion', 'Facturas', 'receipt'], ['trafico', 'Tráfico', 'bars'], ['comentarios', 'Reseñas', 'star']];

function viewAdminDash() {
  const panes = {
    clientes: viewAdminClientes,
    entrenadores: viewAdminEntrenadores,
    facturacion: viewAdminFacturacion,
    trafico: viewAdminTrafico,
    comentarios: viewAdminComentarios,
  };
  return `<div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
    <div class="app-head">
      <div>
        <div class="app-title">${esc(state.gym.name)}</div>
        <div class="app-sub">Panel de administrador</div>
      </div>
      <div ${act('signOut')} class="link-muted">Salir</div>
    </div>
    ${(panes[state.adminTab] || panes.clientes)()}
    <div class="tabbar">${tabsMarkup(ADMIN_TABS, state.adminTab, 'adminTab')}</div>
    ${devCredit()}
  </div>`;
}

/* ---------------- cliente: registro ---------------- */

function viewClientReg1() {
  const c = state.clientReg;
  const invalid = !(c.name.trim() && c.email.trim() && c.phone.trim() && c.password.trim() && c.photoFile) || state.busy;
  const photo = c.photoPreviewUrl
    ? `<img src="${esc(c.photoPreviewUrl)}" alt="Foto de rostro"/>`
    : 'Foto de rostro *';

  return `<div class="col">
    ${stepHead('Paso 1 de 4 · Registro Cliente', 'goto:clientAuth')}
    ${stepBars(1, 4, 'mint')}
    <div class="form-body">
      <div class="title">Tus datos personales</div>
      <div class="subtitle" style="margin-bottom:20px">Todos los campos y la foto de rostro son obligatorios</div>
      ${errorBanner()}
      <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:20px">
        <div class="slot slot--circle" style="width:110px;height:110px" ${act('pickPhoto', 'face')}>${photo}</div>
        ${c.photoFile ? `<div class="chip chip--mint is-active" style="margin-top:12px;padding:8px 16px;font-size:12px">✓ Foto lista</div>` : ''}
        <div style="font-size:10.5px;color:var(--muted);margin-top:8px;text-align:center;max-width:230px;line-height:1.5">Sube una foto donde se vea bien tu rostro para identificar tu acceso al gym.</div>
      </div>
      <div class="stack">
        ${textField('clientReg.name', 'Nombre completo *', c.name)}
        ${textField('clientReg.email', 'Correo electrónico *', c.email)}
        ${textField('clientReg.phone', 'Teléfono *', c.phone)}
        ${textField('clientReg.password', 'Contraseña *', c.password, { type: 'password' })}
      </div>
    </div>
    <div class="form-foot">
      <button class="btn btn--mint" ${act('clientSignUp')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Creando cuenta…' : 'Continuar'}</button>
    </div>
  </div>`;
}

// Se muestra al iniciar sesión (o reanudar) cuando la cuenta no tiene
// foto de rostro guardada — pasa si el alta original quedó interrumpida
// por la confirmación de correo: el archivo elegido en clientReg1 solo
// vive en memoria del navegador y se pierde junto con esa pantalla.
function viewClientPhotoRequired() {
  const c = state.clientReg;
  const photo = c.photoPreviewUrl
    ? `<img src="${esc(c.photoPreviewUrl)}" alt="Foto de rostro"/>`
    : 'Foto de rostro *';

  return `<div class="col">
    <div class="step-head" style="justify-content:space-between">
      <div class="back" ${act('signOut')}>&lsaquo;</div>
      <div class="step-label">Completá tu perfil</div>
      <div style="width:32px"></div>
    </div>
    <div class="form-body">
      <div class="title">Falta tu foto de rostro</div>
      <div class="subtitle" style="margin-bottom:20px">Es obligatoria para identificarte en el acceso al gimnasio</div>
      ${errorBanner()}
      <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:20px">
        <div class="slot slot--circle" style="width:110px;height:110px" ${act('pickPhoto', 'face')}>${photo}</div>
        ${c.photoFile ? `<div class="chip chip--mint is-active" style="margin-top:12px;padding:8px 16px;font-size:12px">✓ Foto lista</div>` : ''}
      </div>
    </div>
    <div class="form-foot">
      <button class="btn btn--mint" ${act('confirmRequiredFacePhoto')} ${(!c.photoFile || state.busy) ? 'disabled' : ''}>${state.busy ? 'Subiendo…' : 'Continuar'}</button>
    </div>
  </div>`;
}

function viewClientReg2() {
  const p = state.clientPhysicalReg;
  const levels = LEVELS.map(lv =>
    `<div ${act('setLevel', lv.id)} ${chip(p.level === lv.id, 'mint')}>${lv.label}</div>`).join('');
  const goals = GOALS.map(g =>
    `<div ${act('setRegGoal', g.id)} ${chip(p.goal === g.id, 'mint')}>${g.label}</div>`).join('');

  return `<div class="col">
    ${stepHead('Paso 2 de 4 · Condición física', 'goto:clientReg1')}
    ${stepBars(2, 4, 'mint')}
    <div class="form-body">
      <div class="title">Condición física</div>
      <div class="subtitle" style="margin-bottom:22px">Opcional — nos ayuda a recomendarte mejores rutinas</div>
      ${errorBanner()}
      <div style="display:flex;gap:10px;margin-bottom:14px">
        ${textField('clientPhysicalReg.weight', 'Peso (kg)', p.weight, { style: 'flex:1' })}
        ${textField('clientPhysicalReg.height', 'Altura (cm)', p.height, { style: 'flex:1' })}
      </div>
      ${textField('clientPhysicalReg.age', 'Edad', p.age, { style: 'margin-bottom:18px' })}
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:8px">Nivel de experiencia</div>
      <div style="display:flex;gap:8px;margin-bottom:18px">${levels}</div>
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:8px">Meta principal</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${goals}</div>
    </div>
    <div class="form-foot" style="display:flex;gap:10px">
      <button class="btn btn--ghost" style="flex:1" ${act('goClientReg3')}>Omitir</button>
      <button class="btn btn--mint" style="flex:2" ${act('savePhysicalAndContinue')}>Continuar</button>
    </div>
  </div>`;
}

function viewClientReg3() {
  const cards = state.plans.map(p => {
    const sel = state.selectedPlanId === p.id;
    return `<div ${act('selectPlan', p.id)} style="display:flex;justify-content:space-between;align-items:center;padding:16px;border-radius:14px;cursor:pointer;background:${sel ? 'rgba(52,211,153,0.1)' : 'var(--surface)'};border:1px solid ${sel ? 'var(--mint)' : 'var(--line)'}">
      <div>
        <div style="font-size:15px;font-weight:700">${esc(p.name)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(DURATION_LABELS[p.duration] || p.duration)}</div>
      </div>
      <div style="font-size:17px;font-weight:900;color:var(--mint)">$${esc(p.price)}</div>
    </div>`;
  }).join('');

  return `<div class="col">
    ${stepHead('Paso 3 de 4 · Elige tu plan', 'goto:clientReg2')}
    ${stepBars(3, 4, 'mint')}
    <div class="form-body">
      ${errorBanner()}
      <div class="card" style="padding:14px 16px;margin-bottom:20px">
        <div style="font-size:15px;font-weight:800">${esc(state.gym.name)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:3px">${esc(state.gym.address)} · ${esc(state.gym.hours)}</div>
      </div>
      <div class="section-title" style="margin-bottom:12px">Planes disponibles</div>
      <div style="display:flex;flex-direction:column;gap:10px">${cards}</div>
    </div>
    <div class="form-foot">
      <button class="btn btn--mint" ${act('choosePlanAndContinue')} ${!state.selectedPlanId ? 'disabled' : ''}>Continuar</button>
    </div>
  </div>`;
}

function viewClientReg4() {
  const wants = state.wantsTrainer;
  const invalid = wants === null || (wants === true && !state.selectedTrainerId) || state.busy;
  const cards = state.approvedTrainersForReg.map(t => {
    const sel = state.selectedTrainerId === t.id;
    return `<div ${act('selectTrainer', t.id)} style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;cursor:pointer;background:${sel ? 'rgba(52,211,153,0.1)' : 'var(--surface)'};border:1px solid ${sel ? 'var(--mint)' : 'var(--line)'}">
      <div class="avatar avatar--sq avatar--mint">${esc(initials(t.name))}</div>
      <div style="flex:1">
        <div style="font-size:14.5px;font-weight:700">${esc(t.name)}</div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:2px">${esc(t.specialty)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:13px;font-weight:800;color:var(--mint)">$${esc(t.price)}/mes</div>
        ${sel ? `<div style="width:20px;height:20px;border-radius:50%;background:var(--mint);display:flex;align-items:center;justify-content:center;color:var(--bg);font-size:12px;font-weight:900">✓</div>` : ''}
      </div>
    </div>`;
  }).join('');

  return `<div class="col">
    ${stepHead('Paso 4 de 4 · Entrenador', 'goto:clientReg3')}
    ${stepBars(4, 4, 'mint')}
    <div class="form-body">
      <div class="title">¿Quieres un entrenador?</div>
      <div class="subtitle" style="margin-bottom:20px">Un entrenador personal te guía, revisa tu progreso y te arma rutinas a medida</div>
      ${errorBanner()}
      <div style="display:flex;gap:10px;margin-bottom:20px">
        <div ${act('chooseWantTrainer')} ${chip(wants === true, 'mint', 'flex:1;text-align:center;padding:14px')}>Sí, quiero</div>
        <div ${act('chooseNoTrainer')} ${chip(wants === false, 'mint', 'flex:1;text-align:center;padding:14px')}>No, por mi cuenta</div>
      </div>
      ${wants === true ? (state.approvedTrainersForReg.length
        ? `<div class="section-title" style="margin-bottom:12px">Elige tu entrenador</div><div style="display:flex;flex-direction:column;gap:10px">${cards}</div>`
        : `<div class="hint">Aún no hay entrenadores disponibles en este gimnasio.</div>`) : ''}
    </div>
    <div class="form-foot">
      <button class="btn btn--mint" ${act('finishClientReg')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Guardando…' : 'Crear cuenta'}</button>
    </div>
  </div>`;
}

/* ---------------- cliente: home ---------------- */

function viewClientInicio() {
  const plan = state.myClientPlan || { name: '—', price: 0, duration: 'mensual' };
  const trainer = state.myClientTrainer;
  const total = plan.price + (trainer ? trainer.price : 0);
  return `<div class="pane">
    ${errorBanner()}
    <div style="background:linear-gradient(135deg,#1a2c4a,#15181C);border:1px solid rgba(215,255,62,0.3);border-radius:16px;padding:18px;margin-bottom:16px">
      <div style="font-size:12px;color:var(--muted)">Tu plan</div>
      <div style="font-size:17px;font-weight:800;margin-top:4px">${esc(plan.name)}</div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:6px">$${esc(plan.price)} · ${esc(DURATION_LABELS[plan.duration] || plan.duration)}</div>
      ${trainer ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:12px;color:var(--muted)">+ Entrenador (${esc(trainer.name)})</div>
        <div style="font-size:13px;font-weight:700;color:var(--lime)">$${esc(trainer.price)}</div>
      </div>
      <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:12.5px;font-weight:700">Total mensual</div>
        <div style="font-size:17px;font-weight:900;color:var(--lime)">$${esc(total)}</div>
      </div>` : ''}
    </div>
    ${trainer ? `<div class="card" style="border-color:rgba(52,211,153,0.25);margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <div class="avatar avatar--sq avatar--mint" style="width:40px;height:40px;font-size:14px">${esc(initials(trainer.name))}</div>
      <div style="flex:1">
        <div style="font-size:11px;color:var(--muted)">Tu entrenador</div>
        <div style="font-size:14px;font-weight:700">${esc(trainer.name)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:1px">${esc(trainer.specialty)}</div>
      </div>
      <div style="font-size:14px;font-weight:800;color:var(--mint)">$${esc(trainer.price)}/mes</div>
    </div>` : ''}
    ${sectionTitle('Máquinas disponibles en tu gym', 'dumbbell')}
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${state.equipment.map(e => `<div class="pill">${esc(e.name)}</div>`).join('')}
    </div>
  </div>`;
}

function viewClientEntrenar() {
  const trainer = state.myClientTrainer;
  const source = trainer ? state.routineSource : 'ia';

  const toggle = trainer ? `
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <div ${act('setRoutineSource', 'ia')} ${chip(source === 'ia', 'lime', 'flex:1;text-align:center')}>Con IA</div>
      <div ${act('setRoutineSource', 'trainer')} ${chip(source === 'trainer', 'mint', 'flex:1;text-align:center')}>De ${esc(trainer.name.split(' ')[0])}</div>
    </div>` : '';

  if (source === 'trainer') {
    const routine = state.trainerRoutineForMe;
    const exercises = (routine && routine.exercises) || [];
    return `<div class="pane">
      ${errorBanner()}
      ${sectionTitle('Rutina de tu entrenador', 'zap', 'margin-bottom:4px')}
      <div class="hint">Creada y actualizada por ${esc(trainer.name)}</div>
      ${toggle}
      ${exercises.length ? `<div class="card" style="border-color:rgba(52,211,153,0.3);padding:16px">
        <div style="font-size:12.5px;color:var(--mint);font-weight:700;margin-bottom:10px">Rutina personalizada · ${esc(trainer.name)}</div>
        ${exercises.map(ex => `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
          <div style="width:6px;height:6px;border-radius:50%;background:var(--mint);flex-shrink:0"></div>
          <div style="font-size:13px">${esc(ex.text)}</div>
        </div>`).join('')}
      </div>` : `<div class="card" style="border:1px dashed rgba(255,255,255,0.12);padding:28px 16px;text-align:center">
        <div style="font-size:12.5px;color:var(--muted);line-height:1.6">Tu entrenador aún no ha creado tu rutina.<br/>Mientras tanto, prueba la rutina con IA.</div>
      </div>`}
    </div>`;
  }

  const goals = GOALS.map(g => `<div ${act('setAiGoal', g.id)} ${chip(state.aiGoal === g.id, 'lime')}>${g.label}</div>`).join('');
  const goalLabel = (GOALS.find(g => g.id === state.aiGoal) || {}).label || '';
  const exercises = (state.aiRoutine && state.aiRoutine.exercises) || [];

  return `<div class="pane">
    ${errorBanner()}
    ${sectionTitle('Entrenamiento con IA', 'zap', 'margin-bottom:4px')}
    <div class="hint">Elige tu meta y generamos una rutina según las máquinas de tu gym</div>
    ${toggle}
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">${goals}</div>
    <button class="btn btn--lime" style="padding:14px;font-size:14px;margin-bottom:16px" ${act('generateRoutine')}>${state.busy ? 'Generando…' : 'Generar rutina con IA'}</button>
    ${exercises.length ? `<div class="card" style="border-color:rgba(215,255,62,0.3);padding:16px">
      <div style="font-size:12.5px;color:var(--lime);font-weight:700;margin-bottom:10px">Rutina recomendada · ${esc(goalLabel)}</div>
      ${exercises.map(ex => `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
        <div style="width:6px;height:6px;border-radius:50%;background:var(--lime);flex-shrink:0"></div>
        <div style="font-size:13px">${esc(ex.text)}</div>
      </div>`).join('')}
      <div style="font-size:10.5px;color:var(--muted);margin-top:10px">Basado en el equipo disponible de ${esc(state.gym.name)}</div>
    </div>` : ''}
  </div>`;
}

function viewClientProgreso() {
  const cards = state.progressList.map(p => `
    <div class="card" style="padding:8px">
      <div class="slot" style="width:100%;height:130px;border-radius:10px" ${act('pickPhoto', 'progress:' + p.id)}>
        ${p.url ? `<img src="${esc(p.url)}" alt="Progreso ${esc(p.taken_at)}"/>` : 'Sube tu foto'}
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:8px;text-align:center">${esc(p.taken_at)}</div>
    </div>`).join('');

  const trainer = state.myClientTrainer;
  return `<div class="pane">
    ${errorBanner()}
    ${sectionTitle('Progreso día a día', 'camera', 'margin-bottom:4px')}
    <div class="hint">Registra una foto cada día para ver tu evolución${trainer ? ' · tu entrenador podrá verla' : ''}</div>
    <button class="btn btn--mint" style="padding:13px;font-size:13.5px;margin-bottom:16px" ${act('addProgress')}>+ Agregar foto de hoy</button>
    ${state.progressList.length
      ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${cards}</div>`
      : `<div class="card" style="border:1px dashed rgba(255,255,255,0.12);padding:28px 16px;text-align:center">
          <div style="font-size:12.5px;color:var(--muted);line-height:1.6">Aún no tienes fotos de progreso.<br/>Agrega la primera para empezar tu seguimiento.</div>
        </div>`}
  </div>`;
}

function viewClientTrafico() {
  const max = Math.max.apply(null, HOUR_VALUES);
  const h = state.clientVisitHour;
  let info = '';
  if (h !== null) {
    const v = HOUR_VALUES[h];
    const pct = Math.round(v / max * 100);
    let level, color, bg;
    if (v < 35) { level = 'Bajo'; color = '#34D399'; bg = 'rgba(52,211,153,0.1)'; }
    else if (v < 65) { level = 'Medio'; color = '#FBBF24'; bg = 'rgba(251,191,36,0.1)'; }
    else { level = 'Alto'; color = '#F87171'; bg = 'rgba(248,113,113,0.1)'; }
    const tail = v < 35 ? '¡Ideal para entrenar tranquilo!' : v < 65 ? 'Afluencia moderada.' : 'Hora pico, considera otra franja.';
    info = `<div style="background:${bg};border:1px solid ${color}40;border-radius:12px;padding:12px 14px;margin-top:4px">
      <div style="font-size:12.5px;font-weight:800;color:${color}">A las ${6 + h}:00 h · tráfico ${level}</div>
      <div style="font-size:11.5px;color:var(--text-soft);margin-top:3px">Ocupación estimada del ${pct}%. ${tail}</div>
    </div>`;
  }

  const options = HOUR_VALUES.map((_, i) =>
    `<option value="${i}"${h === i ? ' selected' : ''}>${6 + i}:00 h</option>`).join('');

  return `<div class="pane">
    <div class="section-title" style="margin-bottom:4px">Mejor hora para ir</div>
    <div class="hint" style="margin-bottom:12px">Elige a qué hora piensas ir y verás el tráfico esperado</div>
    <select class="field" data-f="clientVisitHour" style="padding:13px 14px;margin-bottom:8px">
      <option value=""${h === null ? ' selected' : ''}>¿A qué hora irás?</option>
      ${options}
    </select>
    ${info}
    <div style="margin-top:12px">${barChart('client')}</div>
    <div style="font-size:11.5px;color:var(--muted);margin-top:16px;line-height:1.6">Recomendación: las mañanas (7h–10h) suelen tener menor afluencia.</div>
  </div>`;
}

function viewClientPago() {
  const plan = state.myClientPlan || { name: '—', price: 0, duration: 'mensual' };
  const trainer = state.myClientTrainer;
  const total = plan.price + (trainer ? trainer.price : 0);
  const pending = state.pendingPayment;
  let body = '';

  if (!pending) {
    body = `<div class="card" style="width:100%;border-radius:16px;padding:24px;margin-top:20px">
      <div style="font-size:13px;color:var(--muted)">Próximo pago</div>
      <div style="font-size:24px;font-weight:900;margin-top:6px">$${esc(total)}</div>
      ${trainer ? `<div style="font-size:11px;color:var(--muted);margin-top:6px">Incluye plan ($${esc(plan.price)}) + entrenador ($${esc(trainer.price)})</div>` : ''}
      <div style="font-size:12px;color:var(--muted);margin-top:10px">Aún no hay un cobro generado. Pide al administrador que genere tu código QR para pagar.</div>
    </div>`;
  } else {
    body = `<div style="margin-top:20px;font-size:13px;font-weight:700">Muestra este código en el mostrador</div>
      <div class="qr qr--lg"></div>
      <div style="font-size:12px;color:var(--muted);margin-top:12px">Paga $${esc(pending.amount)} en efectivo. El staff confirmará el cobro desde su panel.</div>
      <div style="font-size:11.5px;color:var(--amber);margin-top:14px;font-weight:700">Esperando confirmación del gimnasio…</div>
      <div ${act('refreshPendingPayment')} style="font-size:11.5px;color:var(--muted);margin-top:14px;cursor:pointer;text-decoration:underline">¿Ya te confirmaron? Actualizar</div>`;
  }

  return `<div class="pane" style="display:flex;flex-direction:column;align-items:center;text-align:center">${errorBanner()}${body}</div>`;
}

function viewClientComentarios() {
  const stars = [1, 2, 3, 4, 5].map(n =>
    `<div ${act('setStarRating', n)} style="font-size:22px;cursor:pointer;color:${n <= state.newCommentRating ? 'var(--amber)' : '#3a3f45'}">★</div>`).join('');

  return `<div class="pane">
    ${errorBanner()}
    ${sectionTitle('Deja tu opinión', 'star', 'margin-bottom:12px')}
    <div style="display:flex;gap:6px;margin-bottom:12px">${stars}</div>
    <textarea class="field" data-f="newCommentText" placeholder="¿Cómo ha sido tu experiencia en el gym?" style="min-height:80px;padding:12px 14px;font-size:13.5px;resize:none">${esc(state.newCommentText)}</textarea>
    <button class="btn btn--lime" style="margin-top:10px;border-radius:12px;padding:13px;font-size:13.5px" ${act('addComment')}>Publicar</button>
    <div class="section-title" style="margin:20px 0 10px">Todas las reseñas</div>
    ${commentCards(state.reviews)}
  </div>`;
}

const CLIENT_TABS = [['inicio', 'Inicio', 'home'], ['ia', 'Entrenar', 'zap'], ['progreso', 'Progreso', 'camera'], ['trafico', 'Tráfico', 'clock'], ['pago', 'Pago', 'card'], ['comentarios', 'Reseñas', 'chat']];

function viewClientHome() {
  const client = state.myClient;
  const panes = {
    inicio: viewClientInicio,
    ia: viewClientEntrenar,
    progreso: viewClientProgreso,
    trafico: viewClientTrafico,
    pago: viewClientPago,
    comentarios: viewClientComentarios,
  };

  const days = daysUntil(client.membershipExpiresAt);
  const urgent = days !== null && days <= 1;
  const plan = state.myClientPlan || { name: '—', price: 0 };
  const alert = (days !== null && days <= 5) ? `<div style="margin:0 22px 12px;background:${urgent ? 'rgba(248,113,113,0.12)' : 'rgba(251,191,36,0.1)'};border:1px solid ${urgent ? 'rgba(248,113,113,0.4)' : 'rgba(251,191,36,0.35)'};border-radius:14px;padding:12px 14px;display:flex;gap:10px;align-items:center">
      <div style="width:30px;height:30px;border-radius:8px;background:${urgent ? 'rgba(248,113,113,0.2)' : 'rgba(251,191,36,0.2)'};display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">⏰</div>
      <div style="flex:1">
        <div style="font-size:12.5px;font-weight:800;color:${urgent ? 'var(--red)' : 'var(--amber)'}">${days <= 0 ? '¡Tu plan vence hoy!' : days === 1 ? '¡Tu plan vence mañana!' : 'Tu plan vence en ' + days + ' días'}</div>
        <div style="font-size:11px;color:var(--text-soft);margin-top:2px">Renueva ${esc(plan.name)} ($${esc(plan.price)}) para no perder tu acceso.</div>
      </div>
      <div ${act('goPayTab')} style="font-size:11px;font-weight:700;color:${urgent ? 'var(--red)' : 'var(--amber)'};cursor:pointer;white-space:nowrap">Pagar</div>
    </div>` : '';

  return `<div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
    <div class="app-head">
      <div>
        <div class="app-title">Hola, ${esc((client.name || 'Cliente').split(' ')[0])}</div>
        <div class="app-sub">${esc(state.gym.name)}</div>
      </div>
      <div ${act('signOut')} class="link-muted">Salir</div>
    </div>
    ${alert}
    ${(panes[state.clientTab] || panes.inicio)()}
    <div class="tabbar tabbar--client">${tabsMarkup(CLIENT_TABS, state.clientTab, 'selectClientTab')}</div>
    ${devCredit()}
  </div>`;
}

/* ---------------- entrenador: auth, revisión, panel ---------------- */

function viewTrainerAuth() {
  const mode = state.trainerAuthMode;
  const invalid = state.busy || (mode === 'login'
    ? !(state.trainerLoginEmail.trim() && state.trainerLoginPassword.trim())
    : !(state.trainerReg.name.trim() && state.trainerReg.email.trim() && state.trainerReg.phone.trim() && state.trainerReg.password.trim()));

  const loginForm = `<div class="stack">
      ${textField('trainerLoginEmail', 'Correo electrónico', state.trainerLoginEmail)}
      ${textField('trainerLoginPassword', 'Contraseña', state.trainerLoginPassword, { type: 'password' })}
    </div>
    ${state.trainerLoginError ? `<div style="font-size:12px;color:var(--red);margin-top:10px">${esc(state.trainerLoginError)}</div>` : ''}`;

  const registerForm = `<div class="stack">
      ${textField('trainerReg.name', 'Nombre completo *', state.trainerReg.name)}
      ${textField('trainerReg.email', 'Correo electrónico *', state.trainerReg.email)}
      ${textField('trainerReg.phone', 'Teléfono *', state.trainerReg.phone)}
      ${textField('trainerReg.password', 'Contraseña *', state.trainerReg.password, { type: 'password' })}
      ${textField('trainerReg.specialty', 'Especialidad (ej. Fuerza, Cardio)', state.trainerReg.specialty)}
      ${textField('trainerReg.price', 'Precio del servicio (USD/mes)', state.trainerReg.price)}
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:12px;line-height:1.5">Tu perfil quedará pendiente de aprobación por el administrador del gimnasio.</div>`;

  return `<div class="col">
    <div class="step-head" style="justify-content:space-between">
      <div class="back" ${act('goto', 'role')}>&lsaquo;</div>
      <div class="step-label">${mode === 'login' ? 'Acceso de entrenador' : 'Registro de entrenador'}</div>
      <div style="width:32px"></div>
    </div>
    <div class="form-body" style="position:relative;z-index:0">
      <div class="gym-watermark gym-watermark--amber">${iconSpan('clipboard')}</div>
      <div style="width:44px;height:44px;border-radius:12px;background:rgba(251,191,36,0.15);display:flex;align-items:center;justify-content:center;color:var(--amber);margin-bottom:16px">${iconSpan('clipboard', 22)}</div>
      <div class="title">${mode === 'login' ? 'Bienvenido, coach' : 'Únete como entrenador'}</div>
      <div class="subtitle">${mode === 'login' ? 'Ingresa con tu correo y contraseña' : 'Crea tu perfil para dar seguimiento a tus clientes'}</div>
      ${errorBanner()}
      <div style="display:flex;gap:8px;margin-bottom:20px">
        <div ${act('setTrainerAuthMode', 'login')} ${chip(mode === 'login', 'amber', 'flex:1;text-align:center')}>Iniciar sesión</div>
        <div ${act('setTrainerAuthMode', 'register')} ${chip(mode === 'register', 'amber', 'flex:1;text-align:center')}>Registrarme</div>
      </div>
      ${mode === 'login' ? loginForm : registerForm}
    </div>
    <div class="form-foot">
      <button class="btn btn--amber" ${act(mode === 'login' ? 'trainerSignIn' : 'trainerSignUp')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Un momento…' : (mode === 'login' ? 'Ingresar' : 'Enviar solicitud')}</button>
    </div>
  </div>`;
}

// Pantalla compartida por cliente y entrenador: se muestra después del alta
// de cuenta (o al reanudar sesión) cuando todavía no están unidos a ningún
// gimnasio. `state.gymPickerNext` guarda qué flujo retomar después de unirse
// — ver confirmGymAndJoin.
function viewGymPicker() {
  const isTrainer = (state.gymPickerNext || '').startsWith('trainer');
  const accentVar = isTrainer ? 'var(--amber)' : 'var(--mint)';
  const btnClass = isTrainer ? 'btn--amber' : 'btn--mint';
  const gyms = state.gymList;

  const cards = gyms.map(g => `
    <div ${act('selectGym', g.id)} style="display:flex;justify-content:space-between;align-items:center;padding:16px;border-radius:14px;cursor:pointer;margin-bottom:10px;background:${state.selectedGymId === g.id ? 'rgba(52,211,153,0.1)' : 'var(--surface)'};border:1px solid ${state.selectedGymId === g.id ? accentVar : 'var(--line)'}">
      <div>
        <div style="font-size:15px;font-weight:700">${esc(g.name)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(g.address)} · ${esc(g.hours)}</div>
      </div>
      ${state.selectedGymId === g.id ? `<div style="width:20px;height:20px;border-radius:50%;background:${accentVar};display:flex;align-items:center;justify-content:center;color:var(--bg);font-size:12px;font-weight:900">✓</div>` : ''}
    </div>`).join('');

  const empty = `<div style="text-align:center;color:var(--muted);font-size:12.5px;padding:40px 20px;line-height:1.6">Todavía no hay ningún gimnasio registrado en CES Gym Manager. Pedile a tu administrador que cree uno primero, y volvé a esta pantalla para unirte.</div>`;

  return `<div class="col">
    <div class="step-head" style="justify-content:space-between">
      <div class="back" ${act('signOut')}>&lsaquo;</div>
      <div class="step-label">Elegí tu gimnasio</div>
      <div style="width:32px"></div>
    </div>
    <div class="form-body">
      ${errorBanner()}
      <div class="title">¿A qué gimnasio te vas a unir?</div>
      <div class="subtitle" style="margin-bottom:20px">Tu cuenta ya está creada — elegí el gimnasio donde entrenás para continuar</div>
      ${gyms.length ? cards : empty}
    </div>
    ${gyms.length ? `<div class="form-foot">
      <button class="btn ${btnClass}" ${act('confirmGymAndJoin')} ${(!state.selectedGymId || state.busy) ? 'disabled' : ''}>${state.busy ? 'Un momento…' : 'Continuar'}</button>
    </div>` : ''}
  </div>`;
}

function viewTrainerPending() {
  return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px 28px;position:relative;z-index:0">
    <div class="gym-watermark gym-watermark--amber">${iconSpan('clipboard')}</div>
    <div style="width:64px;height:64px;border-radius:50%;background:rgba(251,191,36,0.15);display:flex;align-items:center;justify-content:center;color:var(--amber);margin-bottom:20px">${iconSpan('clock', 28)}</div>
    <div style="font-size:19px;font-weight:800">Perfil en revisión</div>
    <div style="font-size:13px;color:var(--muted);margin-top:8px;line-height:1.6;max-width:280px">Hola ${esc(state.pendingTrainerName)}, tu perfil como entrenador fue enviado. El administrador del gimnasio debe aprobarlo antes de que puedas acceder a tu panel.</div>
    <button class="btn btn--ghost" style="margin-top:28px" ${act('signOut')}>Volver al inicio</button>
    <div style="font-size:11.5px;color:var(--muted);margin-top:14px;cursor:pointer;text-decoration:underline" ${act('goto', 'trainerAuth')}>Ya fui aprobado, iniciar sesión</div>
  </div>`;
}

function viewTrainerClientes() {
  const myClients = state.trainerClients;
  const selectedId = state.trainerSelectedClientId;
  const detail = state.trainerSelectedClientDetail;

  if (selectedId && detail) {
    const selected = myClients.find(c => c.id === selectedId);
    const routine = detail.routine.exercises;
    const progress = detail.progress;
    const goalLabel = (GOALS.find(g => g.id === (selected.physical && selected.physical.goal)) || {}).label || 'Sin meta definida';

    return `<div class="pane">
      ${errorBanner()}
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <div class="back" ${act('closeClientDetail')}>&lsaquo;</div>
        <div>
          <div style="font-size:15px;font-weight:800">${esc(selected.name)}</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:1px">${esc(selected.plan)} · ${esc(goalLabel)}</div>
        </div>
      </div>

      ${sectionTitle('Progreso del cliente', 'camera')}
      ${progress.length
        ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
            ${progress.map(pg => `<div class="card" style="padding:8px">
              <div style="width:100%;height:110px;border-radius:10px;overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center">
                ${pg.url ? `<img src="${esc(pg.url)}" style="width:100%;height:100%;object-fit:cover"/>` : `<span style="color:var(--muted);font-size:11px">Sin foto</span>`}
              </div>
              <div style="font-size:11px;color:var(--muted);margin-top:8px;text-align:center">${esc(pg.taken_at)}</div>
            </div>`).join('')}
          </div>`
        : `<div class="card" style="border:1px dashed rgba(255,255,255,0.12);padding:20px;text-align:center;margin-bottom:20px">
            <div style="font-size:12px;color:var(--muted)">Este cliente aún no ha subido fotos de progreso.</div>
          </div>`}

      ${sectionTitle('Rutina personalizada', 'zap')}
      <div class="hint">Estos ejercicios se muestran al cliente si elige "De tu entrenador"</div>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        ${textField('trainerRoutineDraftText', 'Ej. Sentadilla 4x10', state.trainerRoutineDraftText, { sm: true, style: 'flex:1' })}
        <button ${act('addTrainerRoutineExercise')} style="background:var(--amber);border:none;border-radius:10px;padding:0 16px;color:var(--bg);font-weight:700;font-size:18px;cursor:pointer">+</button>
      </div>
      ${routine.length ? routine.map(ex => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface);border:1px solid var(--line);border-radius:10px;margin-bottom:8px">
          <div style="width:6px;height:6px;border-radius:50%;background:var(--amber);flex-shrink:0"></div>
          <div style="flex:1;font-size:13px">${esc(ex.text)}</div>
          <div ${act('removeTrainerRoutineExercise', ex.id)} style="color:var(--red);cursor:pointer;font-size:12px;font-weight:700">Quitar</div>
        </div>`).join('')
        : `<div style="font-size:12px;color:var(--muted)">Aún no has agregado ejercicios.</div>`}
    </div>`;
  }

  return `<div class="pane">
    ${errorBanner()}
    <div style="font-size:12px;color:var(--muted);margin-bottom:12px">${myClients.length} ${myClients.length === 1 ? 'cliente asignado' : 'clientes asignados'}</div>
    ${myClients.length ? myClients.map(c => `
      <div ${act('openClientDetail', c.id)} class="card" style="margin-bottom:10px;cursor:pointer;display:flex;align-items:center;gap:12px">
        <div class="avatar">${esc(initials(c.name))}</div>
        <div style="flex:1">
          <div style="font-size:14.5px;font-weight:700">${esc(c.name)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(c.plan)}</div>
        </div>
        <div style="color:var(--muted);font-size:16px">&rsaquo;</div>
      </div>`).join('')
      : `<div class="card" style="border:1px dashed rgba(255,255,255,0.12);padding:24px;text-align:center">
          <div style="font-size:12.5px;color:var(--muted)">Aún no tienes clientes asignados. Cuando un cliente te elija al registrarse, aparecerá aquí.</div>
        </div>`}
  </div>`;
}

function viewTrainerPerfil() {
  const trainer = state.myTrainer;
  const draft = state.trainerProfileDraft;
  return `<div class="pane">
    ${errorBanner()}
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <div class="avatar avatar--sq avatar--amber" style="width:52px;height:52px;font-size:18px">${esc(initials(trainer.name))}</div>
      <div>
        <div style="font-size:16px;font-weight:800">${esc(trainer.name)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(trainer.email)}</div>
      </div>
    </div>
    <div class="card--dashed">
      <div style="font-size:13px;font-weight:700;color:var(--muted)">Editar perfil</div>
      ${textField('trainerProfileDraft.specialty', 'Especialidad', draft.specialty, { sm: true })}
      ${textField('trainerProfileDraft.price', 'Precio del servicio (USD/mes)', draft.price, { sm: true })}
      <button ${act('saveTrainerProfile')} style="background:var(--amber);border:none;border-radius:10px;padding:12px;color:var(--bg);font-weight:700;font-size:13.5px;cursor:pointer">Guardar cambios</button>
    </div>
  </div>`;
}

const TRAINER_TABS = [['clientes', 'Mis clientes', 'users'], ['perfil', 'Perfil', 'idcard']];

function viewTrainerDash() {
  const panes = { clientes: viewTrainerClientes, perfil: viewTrainerPerfil };
  return `<div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
    <div class="app-head">
      <div>
        <div class="app-title">${esc(state.myTrainer.name)}</div>
        <div class="app-sub">Panel de entrenador · ${esc(state.gym.name)}</div>
      </div>
      <div ${act('signOut')} class="link-muted">Salir</div>
    </div>
    ${(panes[state.trainerTab] || panes.clientes)()}
    <div class="tabbar tabbar--trainer">${tabsMarkup(TRAINER_TABS, state.trainerTab, 'trainerTab')}</div>
    ${devCredit()}
  </div>`;
}

/* ============================ actions ============================ */

const ACTIONS = {
  goto: v => setState({ screen: v, error: '' }),

  signOut: async () => {
    await BolaAPI.auth.signOut();
    Object.assign(state, {
      screen: 'role', session: null, myProfile: null, gym: null, error: '',
      myClient: null, myClientPlan: null, myClientTrainer: null, myTrainer: null,
      activeCharge: null, trainerSelectedClientId: null, trainerSelectedClientDetail: null,
    });
    render();
  },

  /* ---- admin auth ---- */
  setAdminAuthMode: v => setState({ adminAuthMode: v, adminLoginError: '' }),
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
    state.myProfile = profile;
    state.adminLoginEmail = ''; state.adminLoginPassword = '';
    await resumeAdminSession(profile);
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

  /* ---- admin registration ---- */
  adminSignUp: async () => {
    setState({ busy: true, error: '' });
    const result = await BolaAPI.auth.signUpAdmin(state.adminReg);
    if (!result || !result.session) {
      setState({ busy: false, error: 'Te enviamos un correo para confirmar tu cuenta. Confírmalo y volvé a esta pantalla para iniciar sesión.' });
      return;
    }
    setState({ busy: false, screen: 'adminReg2' });
  },
  adminCreateGym: async () => {
    setState({ busy: true, error: '' });
    const gymId = await BolaAPI.gyms.create(state.gymReg);
    const gym = await BolaAPI.gyms.get(gymId);
    setState({ busy: false, gym, screen: 'adminReg3', equipment: [], plans: [] });
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

  adminDashFromReg: async () => {
    await enterAdminDash();
  },

  adminTab: v => setState({ adminTab: v }),
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
    } else if (next === 'clientResume') {
      const profile = await BolaAPI.auth.getMyProfile();
      state.myProfile = profile;
      await continueClientResume(profile);
    } else if (next === 'trainerResume') {
      const profile = await BolaAPI.auth.getMyProfile();
      await continueTrainerSignIn(profile);
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
    const result = await BolaAPI.auth.signUpClient({ name: c.name, email: c.email, phone: c.phone, password: c.password });
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
    const result = await BolaAPI.auth.signUpTrainer(r);
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

// Reanuda la sesión de un admin ya logueado. Si se quedó a mitad del
// asistente (tiene cuenta pero nunca llamó a create_gym), lo manda al paso
// del gimnasio en vez de a un panel que no puede existir sin gym_id.
async function resumeAdminSession(profile) {
  if (!profile.gym_id) {
    setState({
      screen: 'adminReg2', busy: false,
      adminReg: { name: profile.name, email: profile.email, phone: profile.phone, password: '' },
    });
    return;
  }
  state.gym = await BolaAPI.gyms.get(profile.gym_id);
  await enterAdminDash();
}

// Igual que arriba pero para cliente. gym_id normalmente ya está seteado
// (se une al gimnasio justo después de crear la cuenta, ver clientSignUp),
// salvo que el signUp haya quedado interrumpido por la confirmación de
// correo — ahí el join nunca se ejecutó, y hay que elegir gimnasio acá.
// plan_id puede faltar si no llegó al paso 3.
async function resumeClientSession(profile) {
  if (!profile.gym_id) {
    await loadGymPicker('clientResume');
    return;
  }
  await continueClientResume(profile);
}

async function continueClientResume(profile) {
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

async function continueAfterFacePhoto(client) {
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
async function loadGymPicker(next) {
  const gymList = await BolaAPI.gyms.listAll();
  setState({ gymList, selectedGymId: null, gymPickerNext: next, screen: 'gymPicker', busy: false, error: '' });
}

async function continueClientSignUpAfterGym(gym) {
  const c = state.clientReg;
  const profile = await BolaAPI.auth.getMyProfile();
  const path = BolaAPI.photos.facePath(gym.id, profile.id);
  await BolaAPI.photos.upload(path, c.photoFile);
  await BolaAPI.clients.setFacePhotoKey(profile.id, path);
  const plans = await BolaAPI.plans.list(gym.id);
  setState({ busy: false, myProfile: profile, gym, plans, screen: 'clientReg2' });
}

function continueTrainerSignUpAfterGym() {
  const r = state.trainerReg;
  setState({
    busy: false, screen: 'trainerPending', pendingTrainerName: r.name,
    trainerReg: { name: '', email: '', phone: '', password: '', specialty: '', price: '' },
    trainerAuthMode: 'login',
  });
}

async function continueTrainerSignIn(profile) {
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

async function enterAdminDash() {
  const [clientsForGym, trainersForGym, plans, equipment, reviews] = await Promise.all([
    BolaAPI.clients.listForGym(state.gym.id),
    BolaAPI.trainers.listForGym(state.gym.id),
    BolaAPI.plans.list(state.gym.id),
    BolaAPI.equipment.list(state.gym.id),
    BolaAPI.reviews.listForGym(state.gym.id),
  ]);
  Object.assign(state, { screen: 'adminDash', adminTab: 'clientes', clientsForGym, trainersForGym, plans, equipment, reviews, busy: false });
  render();
}

async function enterClientHome() {
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
  render();
}

async function enterTrainerDash(profile, gym, myTrainer) {
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
  render();
}

async function attachSignedUrls(rows) {
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

/* ============================ wiring ============================ */

const root = document.getElementById('app');

const SCREENS = {
  boot: viewBoot,
  role: viewRole,
  adminAuth: viewAdminAuth,
  clientAuth: viewClientAuth,
  adminReg1: viewAdminReg1,
  adminReg2: viewAdminReg2,
  adminReg3: viewAdminReg3,
  adminReg4: viewAdminReg4,
  adminDash: viewAdminDash,
  clientReg1: viewClientReg1,
  clientReg2: viewClientReg2,
  clientReg3: viewClientReg3,
  clientReg4: viewClientReg4,
  clientHome: viewClientHome,
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
  setPath(el.dataset.f, el.value);
});

root.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.f !== 'clientVisitHour') return;
  setState({ clientVisitHour: el.value === '' ? null : Number(el.value) });
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

function render() {
  const snapshot = captureFocus();
  root.innerHTML = (SCREENS[state.screen] || viewRole)();
  restoreFocus(snapshot);
}

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

    if (profile.role === 'admin') {
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

boot();
