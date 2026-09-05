/* Bolá — administrador: ya NO crea el gimnasio (eso lo hace el dueño ahora,
   ver src/screens/owner.js) — se une a uno ya creado y queda pendiente de
   aprobación por el dueño, exactamente igual que un entrenador. Una vez
   aprobado, entra al mismo dashboard que el dueño (viewOwnerDash), solo que
   sin la tab de aprobar administradores. Ver docs/MIGRATION_PLAN.md Fase 4. */
'use strict';

import { state } from '../state.js';
import { iconSpan } from '../data.js';
import {
  esc, act, chip, errorBanner, devCredit,
  textField, emailField, phoneField, passwordField, passwordStrength,
} from '../helpers.js';

// Fase 16: el alta de administrador dejó de poder elegir cualquier gimnasio
// de una lista pública — es solo por link de invitación (state.inviteRole,
// ver router.js resolveGymInviteFromUrl). "Iniciar sesión" nunca se oculta
// (las cuentas ya aprobadas siguen entrando normal).
export function viewAdminAuth() {
  const mode = state.adminAuthMode;
  const canRegister = state.inviteRole === 'admin';
  const effectiveMode = mode === 'register' && canRegister ? 'register' : 'login';
  const invalid = state.busy || (effectiveMode === 'login'
    ? !(state.adminLoginEmail.trim() && state.adminLoginPassword.trim())
    : !(state.adminReg.name.trim() && state.adminReg.email.trim() && state.adminReg.phone.trim() && passwordStrength(state.adminReg.password) >= 2));

  const loginForm = `<div class="stack">
      ${emailField('adminLoginEmail', 'usuario', state.adminLoginEmail)}
      ${passwordField('adminLoginPassword', 'Contraseña', state.adminLoginPassword)}
    </div>
    ${state.adminLoginError ? `<div style="font-size:12px;color:var(--red);margin-top:10px">${esc(state.adminLoginError)}</div>` : ''}`;

  const registerForm = `<div class="stack">
      ${textField('adminReg.name', 'Nombre completo *', state.adminReg.name)}
      ${emailField('adminReg.email', 'usuario *', state.adminReg.email)}
      ${phoneField('adminReg.phonePrefix', 'adminReg.phone', state.adminReg.phonePrefix, state.adminReg.phone, 'Teléfono *')}
      ${passwordField('adminReg.password', 'Contraseña *', state.adminReg.password, { strength: true })}
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:12px;line-height:1.5">Vas a unirte a un gimnasio ya existente. Tu cuenta quedará pendiente de aprobación por el dueño.</div>`;

  return `<div class="col">
    <div class="step-head" style="justify-content:space-between">
      <div class="back" ${act('goto', 'role')}>&lsaquo;</div>
      <div class="step-label">${effectiveMode === 'login' ? 'Acceso de administrador' : 'Registro de administrador'}</div>
      <div style="width:32px"></div>
    </div>
    <div class="form-body" style="position:relative;z-index:0">
      <div class="gym-watermark gym-watermark--sky">${iconSpan('idcard')}</div>
      <div style="width:44px;height:44px;border-radius:12px;background:rgba(56,189,248,0.15);display:flex;align-items:center;justify-content:center;color:var(--sky);margin-bottom:16px">${iconSpan('idcard', 22)}</div>
      <div class="title">${effectiveMode === 'login' ? 'Bienvenido de nuevo' : 'Únete como administrador'}</div>
      <div class="subtitle">${effectiveMode === 'login' ? 'Ingresa con tu correo y contraseña' : 'Ayudá a operar el día a día de un gimnasio ya creado'}</div>
      ${errorBanner()}
      <div style="display:flex;gap:8px;margin-bottom:20px">
        <div ${act('setAdminAuthMode', 'login')} ${chip(effectiveMode === 'login', 'sky', 'flex:1;text-align:center')}>Iniciar sesión</div>
        ${canRegister ? `<div ${act('setAdminAuthMode', 'register')} ${chip(effectiveMode === 'register', 'sky', 'flex:1;text-align:center')}>Registrarme</div>` : ''}
      </div>
      ${!canRegister ? `<div style="font-size:11px;color:var(--muted);margin-bottom:16px;line-height:1.5">El alta de administrador es solo por invitación de un gimnasio — pedile el link al dueño.</div>` : ''}
      ${effectiveMode === 'login' ? loginForm : registerForm}
    </div>
    <div class="form-foot">
      <button class="btn btn--sky" ${act(effectiveMode === 'login' ? 'adminSignIn' : 'adminSignUp')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Un momento…' : (effectiveMode === 'login' ? 'Ingresar' : 'Continuar')}</button>
    </div>
  </div>`;
}

export function viewAdminPending() {
  return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px 28px;position:relative;z-index:0">
    <div class="gym-watermark gym-watermark--sky">${iconSpan('idcard')}</div>
    <div style="width:64px;height:64px;border-radius:50%;background:rgba(56,189,248,0.15);display:flex;align-items:center;justify-content:center;color:var(--sky);margin-bottom:20px">${iconSpan('clock', 28)}</div>
    <div style="font-size:19px;font-weight:800">Perfil en revisión</div>
    <div style="font-size:13px;color:var(--muted);margin-top:8px;line-height:1.6;max-width:280px">Hola ${esc(state.pendingAdminName)}, tu solicitud como administrador fue enviada. El dueño del gimnasio debe aprobarla antes de que puedas acceder al panel.</div>
    <button class="btn btn--ghost" style="margin-top:28px" ${act('signOut')}>Volver al inicio</button>
    <div style="font-size:11.5px;color:var(--muted);margin-top:14px;cursor:pointer;text-decoration:underline" ${act('goto', 'adminAuth')}>Ya fui aprobado, iniciar sesión</div>
  </div>`;
}
