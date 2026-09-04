/* Bolá — pantallas de selección de rol y de acceso (admin/cliente/entrenador),
   más el selector de gimnasio compartido. Movido 1:1 desde app.js (Fase 3,
   ver docs/MIGRATION_PLAN.md). */
'use strict';

import { state } from '../state.js';
import { LOGO_SVG, iconSpan } from '../data.js';
import {
  act, chip, authScreen, errorBanner, devCredit, esc,
  textField, emailField, phoneField, passwordField, passwordStrength,
} from '../helpers.js';

export function viewBoot() {
  return `<div style="flex:1;display:flex;align-items:center;justify-content:center">
    <div style="width:44px;height:44px;border-radius:14px;background:var(--lime);display:flex;align-items:center;justify-content:center">${LOGO_SVG}</div>
  </div>`;
}

export function viewRole() {
  return `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:32px 28px 48px;gap:32px;position:relative;z-index:0">
    <div class="gym-watermark">${iconSpan('dumbbell')}</div>
    <div>
      <div style="width:56px;height:56px;border-radius:16px;background:var(--lime);margin-bottom:22px;display:flex;align-items:center;justify-content:center">${LOGO_SVG}</div>
      <div style="font-size:26px;font-weight:900;line-height:1.15;letter-spacing:-0.4px">Fight Club Gym Manager</div>
      <div style="font-size:14px;color:var(--muted);margin-top:10px;line-height:1.5">Administra tu gimnasio, entrena a tus clientes o sigue tu plan personalizado, todo en un solo lugar.</div>
    </div>
    ${errorBanner()}
    <div style="display:flex;flex-direction:column;gap:12px">
      <div ${act('goto', 'ownerAuth')} class="card" style="border-radius:18px;padding:20px;cursor:pointer;display:flex;align-items:center;gap:16px">
        <div style="width:44px;height:44px;border-radius:12px;background:rgba(228,0,58,0.15);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--lime)">${iconSpan('dumbbell', 22)}</div>
        <div style="flex:1">
          <div style="font-size:16px;font-weight:700">Soy Dueño</div>
          <div style="font-size:12.5px;color:var(--muted);margin-top:3px">Registra tu gimnasio y gestiona todo</div>
        </div>
      </div>
      <div ${act('goto', 'adminAuth')} class="card" style="border-radius:18px;padding:20px;cursor:pointer;display:flex;align-items:center;gap:16px">
        <div style="width:44px;height:44px;border-radius:12px;background:rgba(56,189,248,0.15);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--sky)">${iconSpan('idcard', 22)}</div>
        <div style="flex:1">
          <div style="font-size:16px;font-weight:700">Soy Administrador</div>
          <div style="font-size:12.5px;color:var(--muted);margin-top:3px">Únete a un gimnasio y opera el día a día</div>
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

// El dueño crea el gimnasio — antes lo hacía "admin" (ver src/screens/admin.js,
// que ahora es un flujo de unión+aprobación como el de entrenador).
export function viewOwnerAuth() {
  const mode = state.ownerAuthMode;
  const toggle = `<div style="display:flex;gap:8px;margin-bottom:20px">
    <div ${act('setOwnerAuthMode', 'login')} ${chip(mode === 'login', 'lime', 'flex:1;text-align:center')}>Iniciar sesión</div>
    <div ${act('setOwnerAuthMode', 'register')} ${chip(mode === 'register', 'lime', 'flex:1;text-align:center')}>Registrarme</div>
  </div>`;

  if (mode === 'register') {
    return authScreen({
      label: 'Acceso de dueño', icon: 'dumbbell', accent: 'var(--lime)', accentBg: 'rgba(228,0,58,0.15)',
      title: 'Registra tu gimnasio', subtitle: 'Vas a crear tu cuenta de dueño y configurar tu gimnasio en 4 pasos rápidos.',
      backAction: 'goto:role', inner: toggle,
      footer: `<div class="form-foot"><button class="btn btn--lime" ${act('goto', 'ownerReg1')}>Comenzar registro</button></div>`,
    });
  }

  const invalid = state.busy || !(state.ownerLoginEmail.trim() && state.ownerLoginPassword.trim());
  const inner = `${toggle}
    <div class="stack">
      ${emailField('ownerLoginEmail', 'usuario', state.ownerLoginEmail)}
      ${passwordField('ownerLoginPassword', 'Contraseña', state.ownerLoginPassword)}
    </div>
    ${state.ownerLoginError ? `<div style="font-size:12px;color:var(--red);margin-top:10px">${esc(state.ownerLoginError)}</div>` : ''}`;

  return authScreen({
    label: 'Acceso de dueño', icon: 'dumbbell', accent: 'var(--lime)', accentBg: 'rgba(228,0,58,0.15)',
    title: 'Bienvenido de nuevo', subtitle: 'Ingresa con el correo y contraseña de tu gimnasio',
    backAction: 'goto:role', inner,
    footer: `<div class="form-foot"><button class="btn btn--lime" ${act('ownerSignIn')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Un momento…' : 'Ingresar'}</button></div>`,
  });
}

export function viewClientAuth() {
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
      ${emailField('clientLoginEmail', 'usuario', state.clientLoginEmail)}
      ${passwordField('clientLoginPassword', 'Contraseña', state.clientLoginPassword)}
    </div>
    ${state.clientLoginError ? `<div style="font-size:12px;color:var(--red);margin-top:10px">${esc(state.clientLoginError)}</div>` : ''}`;

  return authScreen({
    label: 'Acceso de cliente', icon: 'run', accent: 'var(--mint)', accentBg: 'rgba(52,211,153,0.15)',
    title: 'Bienvenido de nuevo', subtitle: 'Ingresa con tu correo y contraseña',
    backAction: 'goto:role', inner,
    footer: `<div class="form-foot"><button class="btn btn--mint" ${act('clientSignIn')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Un momento…' : 'Ingresar'}</button></div>`,
  });
}

export function viewTrainerAuth() {
  const mode = state.trainerAuthMode;
  const invalid = state.busy || (mode === 'login'
    ? !(state.trainerLoginEmail.trim() && state.trainerLoginPassword.trim())
    : !(state.trainerReg.name.trim() && state.trainerReg.email.trim() && state.trainerReg.phone.trim() && passwordStrength(state.trainerReg.password) >= 2));

  const loginForm = `<div class="stack">
      ${emailField('trainerLoginEmail', 'usuario', state.trainerLoginEmail)}
      ${passwordField('trainerLoginPassword', 'Contraseña', state.trainerLoginPassword)}
    </div>
    ${state.trainerLoginError ? `<div style="font-size:12px;color:var(--red);margin-top:10px">${esc(state.trainerLoginError)}</div>` : ''}`;

  const registerForm = `<div class="stack">
      ${textField('trainerReg.name', 'Nombre completo *', state.trainerReg.name)}
      ${emailField('trainerReg.email', 'usuario *', state.trainerReg.email)}
      ${phoneField('trainerReg.phonePrefix', 'trainerReg.phone', state.trainerReg.phonePrefix, state.trainerReg.phone, 'Teléfono *')}
      ${passwordField('trainerReg.password', 'Contraseña *', state.trainerReg.password, { strength: true })}
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
// — ver confirmGymAndJoin en actions.js.
export function viewGymPicker() {
  const next = state.gymPickerNext || '';
  const variant = next.startsWith('trainer') ? 'amber' : next.startsWith('admin') ? 'sky' : 'mint';
  const accentVar = `var(--${variant})`;
  const btnClass = `btn--${variant}`;
  const gyms = state.gymList;

  const cards = gyms.map(g => `
    <div ${act('selectGym', g.id)} style="display:flex;justify-content:space-between;align-items:center;padding:16px;border-radius:14px;cursor:pointer;margin-bottom:10px;background:${state.selectedGymId === g.id ? 'rgba(52,211,153,0.1)' : 'var(--surface)'};border:1px solid ${state.selectedGymId === g.id ? accentVar : 'var(--line)'}">
      <div>
        <div style="font-size:15px;font-weight:700">${esc(g.name)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(g.address)} · ${esc(g.hours)}</div>
      </div>
      ${state.selectedGymId === g.id ? `<div style="width:20px;height:20px;border-radius:50%;background:${accentVar};display:flex;align-items:center;justify-content:center;color:var(--bg);font-size:12px;font-weight:900">✓</div>` : ''}
    </div>`).join('');

  const empty = `<div style="text-align:center;color:var(--muted);font-size:12.5px;padding:40px 20px;line-height:1.6">Todavía no hay ningún gimnasio registrado en Fight Club Gym Manager. Pedile a tu dueño que cree uno primero, y volvé a esta pantalla para unirte.</div>`;

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
