/* Bolá — administrador: no crea el gimnasio (eso lo hace el dueño, ver
   src/screens/owner.js) — se une a uno ya existente y queda pendiente de
   aprobación por el dueño, igual que un entrenador. Una vez aprobado, entra
   al mismo dashboard que el dueño (viewOwnerDash), solo que sin la tab de
   aprobar administradores. Ver docs/MIGRATION_PLAN.md Fase 4. */
'use strict';

import { state } from '../state.js';
import { iconSpan } from '../data.js';
import {
  esc, act, errorBanner,
  textField, emailField, phoneField, passwordField, passwordStrength,
} from '../helpers.js';

// Registro de administrador — un solo paso, alcanzable solo desde
// viewInviteWelcome con state.inviteRole==='admin' ya resuelto (Etapa 1 del
// rediseño). El gimnasio viene del link, no de una lista — ver
// ACTIONS.adminSignUp/tryJoinViaGymInvite en actions.js. Login unificado
// (viewLogin en auth.js) reemplazó el modo "Iniciar sesión" que tenía esta
// pantalla.
export function viewAdminReg() {
  const a = state.adminReg;
  const invalid = state.busy || !(a.name.trim() && a.email.trim() && a.phone.trim() && passwordStrength(a.password) >= 2);
  const gymName = state.inviteGym ? state.inviteGym.name : 'tu gimnasio';

  return `<div class="col">
    <div class="step-head" style="justify-content:space-between">
      <div class="back" ${act('goto', 'inviteWelcome')}>&lsaquo;</div>
      <div class="step-label">Registro de administrador</div>
      <div style="width:32px"></div>
    </div>
    <div class="form-body" style="position:relative;z-index:0">
      <div class="gym-watermark">${iconSpan('idcard')}</div>
      <div style="width:44px;height:44px;border-radius:12px;background:var(--action-dim);display:flex;align-items:center;justify-content:center;color:var(--action);margin-bottom:16px">${iconSpan('idcard', 22)}</div>
      <div class="title">Únete como administrador</div>
      <div class="subtitle">Vas a ayudar a operar el día a día de ${esc(gymName)}</div>
      ${errorBanner()}
      <div class="stack">
        ${textField('adminReg.name', 'Nombre completo *', a.name)}
        ${emailField('adminReg.email', 'usuario *', a.email)}
        ${phoneField('adminReg.phonePrefix', 'adminReg.phone', a.phonePrefix, a.phone, 'Teléfono *')}
        ${passwordField('adminReg.password', 'Contraseña *', a.password, { strength: true })}
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:12px;line-height:1.5">Tu cuenta quedará pendiente de aprobación por el dueño.</div>
    </div>
    <div class="form-foot">
      <button class="btn btn--action" ${act('adminSignUp')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Un momento…' : 'Enviar solicitud'}</button>
    </div>
  </div>`;
}

export function viewAdminPending() {
  return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px 28px;position:relative;z-index:0">
    <div class="gym-watermark">${iconSpan('idcard')}</div>
    <div style="width:64px;height:64px;border-radius:50%;background:var(--action-dim);display:flex;align-items:center;justify-content:center;color:var(--action);margin-bottom:20px">${iconSpan('clock', 28)}</div>
    <div style="font-size:19px;font-weight:800">Perfil en revisión</div>
    <div style="font-size:13px;color:var(--muted);margin-top:8px;line-height:1.6;max-width:280px">Hola ${esc(state.pendingAdminName)}, tu solicitud como administrador fue enviada. El dueño del gimnasio debe aprobarla antes de que puedas acceder al panel.</div>
    <button class="btn btn--ghost" style="margin-top:28px" ${act('signOut')}>Volver al inicio</button>
    <div style="font-size:11.5px;color:var(--muted);margin-top:14px;cursor:pointer;text-decoration:underline" ${act('goto', 'login')}>Ya fui aprobado, iniciar sesión</div>
  </div>`;
}
