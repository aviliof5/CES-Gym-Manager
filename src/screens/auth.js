/* Bolá — portada de marketing, login único y bienvenida de invitación, más
   el selector de gimnasio compartido. Reemplaza el viejo selector de 4
   roles (Etapa 1 del rediseño, ver docs/plans "aqui-esta-el-logo"): nadie
   elige su rol más — lo decide el link que le mandó su gimnasio, o el
   login único si ya tiene cuenta (signIn() ya era el mismo para los 4
   roles, la app solo tenía 4 pantallas idénticas repitiendo el formulario). */
'use strict';

import { state } from '../state.js';
import { brandMark, iconSpan } from '../data.js';
import {
  act, authScreen, errorBanner, esc,
  textField, emailField, phoneField, passwordField, passwordStrength,
} from '../helpers.js';

export function viewBoot() {
  return `<div style="flex:1;display:flex;align-items:center;justify-content:center">
    ${brandMark('lg')}
  </div>`;
}

// Portada — lo primero que ve cualquiera sin sesión y sin link de invitación.
// Es la pantalla que vende la app, no un formulario: un solo botón primario
// ("Iniciar sesión", para quien ya tiene cuenta de cualquier rol) y, chico
// abajo, la única puerta que sigue siendo pública — un cliente nuevo sin
// invitación puede sumarse igual (decisión confirmada: el resto de los
// roles es solo por link).
export function viewLanding() {
  return `<div style="flex:1;display:flex;flex-direction:column;position:relative;z-index:0;overflow:hidden">
    <div class="gym-watermark">${iconSpan('dumbbell')}</div>
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:32px 28px">
      <div class="rise" style="margin-bottom:26px">${brandMark('xl')}</div>
      <div class="rise" style="font-family:var(--font-condensed);font-size:13px;font-weight:700;letter-spacing:var(--ls-wider);text-transform:uppercase;color:var(--text-soft);line-height:1.7">
        Disciplina. Fuerza. Libertad.
      </div>
    </div>
    ${errorBanner()}
    <div style="padding:0 28px 40px;display:flex;flex-direction:column;gap:14px;align-items:center">
      <button class="btn btn--action rise" style="width:100%" ${act('goto', 'login')}>Iniciar sesión</button>
      <div class="rise" ${act('goto', 'clientReg1')} style="font-size:12px;color:var(--muted);cursor:pointer;text-decoration:underline;text-underline-offset:3px">
        ¿Sos cliente nuevo y no tenés link? Unite acá
      </div>
    </div>
  </div>`;
}

// Login único — antes eran 4 pantallas idénticas (ownerAuth/adminAuth/
// clientAuth/trainerAuth en modo "login"). signIn() nunca dependió del rol;
// lo único nuevo acá es que routeAfterLogin() (actions.js) decide el panel
// según profile.role después de loguear, en vez de que el usuario elija de
// antemano en qué formulario escribir su contraseña.
export function viewLogin() {
  const invalid = state.busy || !(state.loginEmail.trim() && state.loginPassword.trim());
  const inner = `<div class="stack">
      ${emailField('loginEmail', 'usuario', state.loginEmail)}
      ${passwordField('loginPassword', 'Contraseña', state.loginPassword)}
    </div>
    ${state.loginError ? `<div style="font-size:12px;color:var(--danger);margin-top:10px">${esc(state.loginError)}</div>` : ''}`;

  return authScreen({
    label: 'Iniciar sesión', icon: 'dumbbell', accent: 'var(--action)', accentBg: 'var(--action-dim)',
    title: 'Bienvenido de nuevo', subtitle: 'Ingresá con el correo y contraseña de tu cuenta — dueño, administrador, entrenador o cliente',
    backAction: 'goto:landing', inner,
    footer: `<div class="form-foot"><button class="btn btn--action" ${act('login')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Un momento…' : 'Ingresar'}</button></div>`,
  });
}

// Confirmación de correo por código — reemplaza el link "Confirmar mi
// correo" que mandaba Supabase por defecto (ver plantilla "Confirm signup"
// en el dashboard, ahora con {{ .Token }} en vez de {{ .ConfirmationURL }}).
// Se llega acá desde cualquiera de los 4 signUp (sin sesión todavía porque
// el correo no está confirmado) o desde login() si Supabase devuelve
// "email no confirmado" — ver ACTIONS.verifyConfirmCode/resendConfirmCode.
export function viewConfirmCode() {
  // OJO: NO asumir una longitud fija acá. Supabase documenta {{ .Token }}
  // como un OTP de 6 dígitos, pero en la práctica (reporte real del dueño,
  // probando contra producción) llegó un código más largo — capar el campo
  // a maxlength=6/exigir exactamente 6 dejaba a la persona sin poder
  // siquiera terminar de escribirlo. Mejor aceptar cualquier largo
  // razonable de dígitos y solo exigir que no esté vacío.
  const invalid = state.busy || !state.confirmCode.trim();
  const inner = `<div style="text-align:center;margin-bottom:20px">
      <div style="font-size:13px;color:var(--text-soft);line-height:1.6">Te mandamos un código de confirmación a<br/><strong style="color:var(--text)">${esc(state.confirmEmail)}</strong></div>
    </div>
    <input class="field" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="20"
      placeholder="Código" value="${esc(state.confirmCode)}" data-f="confirmCode" data-numeric="true"
      style="text-align:center;font-size:22px;letter-spacing:0.15em;font-family:var(--font-display)"/>
    ${state.confirmCodeResent ? `<div style="font-size:12px;color:var(--ok);margin-top:12px;text-align:center">Código reenviado — revisá tu correo</div>` : ''}
    <div style="text-align:center;margin-top:18px">
      <span ${act('resendConfirmCode')} style="font-size:12px;color:var(--info);cursor:pointer;text-decoration:underline">¿No te llegó? Reenviar código</span>
    </div>`;

  return authScreen({
    label: 'Verificar correo', icon: 'mail', accent: 'var(--action)', accentBg: 'var(--action-dim)',
    title: 'Ingresá el código', subtitle: 'Confirmá tu cuenta con el código que te mandamos por correo',
    backAction: 'goto:login', inner,
    footer: `<div class="form-foot"><button class="btn btn--action" ${act('verifyConfirmCode')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Verificando…' : 'Confirmar código'}</button></div>`,
  });
}

const INVITE_WELCOME_COPY = {
  owner: { icon: 'crown', title: 'Te invitaron a crear tu gimnasio', role: 'Dueño', next: 'ownerReg1' },
  admin: { icon: 'idcard', title: 'Te invitaron a', role: 'Administrador', next: 'adminReg' },
  trainer: { icon: 'clipboard', title: 'Te invitaron a', role: 'Entrenador', next: 'trainerReg' },
  client: { icon: 'run', title: 'Te invitaron a', role: 'Cliente', next: 'clientReg1' },
};

// Pantalla que abre cualquier link de invitación (owner_invite o invite,
// ver router.js) antes de entrar al formulario de alta — confirma de qué
// gimnasio y con qué rol, para que nadie se registre a ciegas. El botón
// Continuar manda directo al registro de ESE rol, sin selector de nada.
export function viewInviteWelcome() {
  const isOwner = !!state.ownerInviteToken;
  const role = isOwner ? 'owner' : (state.inviteRole || 'client');
  const copy = INVITE_WELCOME_COPY[role];
  const gymName = isOwner ? 'Fight Club Gym Manager' : (state.inviteGym && state.inviteGym.name) || '';

  return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px 28px;position:relative;z-index:0">
    <div class="gym-watermark">${iconSpan(copy.icon)}</div>
    <div style="width:64px;height:64px;border-radius:50%;background:var(--action-dim);display:flex;align-items:center;justify-content:center;color:var(--action);margin-bottom:22px;box-shadow:var(--glow-action)">${iconSpan(copy.icon, 28)}</div>
    <div class="eyebrow" style="margin-bottom:8px">Invitación</div>
    <div class="screen-title" style="font-size:22px">${esc(copy.title)}${gymName ? ` ${esc(gymName)}` : ''}</div>
    <div style="font-size:14px;color:var(--text-soft);margin-top:10px">como <strong style="color:var(--action)">${esc(copy.role)}</strong></div>
    ${errorBanner()}
    <button class="btn btn--action" style="margin-top:32px" ${act('goto', copy.next)}>Continuar</button>
    <div style="font-size:11.5px;color:var(--muted);margin-top:16px;cursor:pointer;text-decoration:underline" ${act('goto', 'login')}>Ya tengo cuenta, iniciar sesión</div>
  </div>`;
}

// Registro de entrenador — un solo paso (a diferencia de dueño/cliente, que
// tienen wizard de 4). Solo se llega acá desde viewInviteWelcome con
// state.inviteRole==='trainer' ya resuelto: no hay selector de gimnasio,
// el gym viene del link (ver ACTIONS.trainerSignUp/tryJoinViaGymInvite).
export function viewTrainerReg() {
  const r = state.trainerReg;
  const invalid = state.busy || !(r.name.trim() && r.email.trim() && r.phone.trim() && passwordStrength(r.password) >= 2);
  const gymName = state.inviteGym ? state.inviteGym.name : 'tu gimnasio';

  return `<div class="col">
    <div class="step-head" style="justify-content:space-between">
      <div class="back" ${act('goto', 'inviteWelcome')}>&lsaquo;</div>
      <div class="step-label">Registro de entrenador</div>
      <div style="width:32px"></div>
    </div>
    <div class="form-body" style="position:relative;z-index:0">
      <div class="gym-watermark">${iconSpan('clipboard')}</div>
      <div style="width:44px;height:44px;border-radius:12px;background:var(--action-dim);display:flex;align-items:center;justify-content:center;color:var(--action);margin-bottom:16px">${iconSpan('clipboard', 22)}</div>
      <div class="title">Únete como entrenador</div>
      <div class="subtitle">Vas a dar seguimiento a los clientes de ${esc(gymName)}</div>
      ${errorBanner()}
      <div class="stack">
        ${textField('trainerReg.name', 'Nombre completo *', r.name)}
        ${emailField('trainerReg.email', 'usuario *', r.email)}
        ${phoneField('trainerReg.phonePrefix', 'trainerReg.phone', r.phonePrefix, r.phone, 'Teléfono *')}
        ${passwordField('trainerReg.password', 'Contraseña *', r.password, { strength: true })}
        ${textField('trainerReg.specialty', 'Especialidad (ej. Fuerza, Cardio)', r.specialty)}
        ${textField('trainerReg.price', 'Precio del servicio (USD/mes)', r.price)}
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:12px;line-height:1.5">Tu perfil quedará pendiente de aprobación por el dueño o administrador del gimnasio.</div>
    </div>
    <div class="form-foot">
      <button class="btn btn--action" ${act('trainerSignUp')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Un momento…' : 'Enviar solicitud'}</button>
    </div>
  </div>`;
}

// Pantalla compartida por cliente y entrenador: se muestra después del alta
// de cuenta (o al reanudar sesión) cuando todavía no están unidos a ningún
// gimnasio. `state.gymPickerNext` guarda qué flujo retomar después de unirse
// — ver confirmGymAndJoin en actions.js.
export function viewGymPicker() {
  const gyms = state.gymList;

  const cards = gyms.map(g => `
    <div ${act('selectGym', g.id)} style="display:flex;justify-content:space-between;align-items:center;padding:16px;border-radius:var(--r-lg);cursor:pointer;margin-bottom:10px;background:${state.selectedGymId === g.id ? 'var(--action-dim)' : 'var(--surface)'};border:1px solid ${state.selectedGymId === g.id ? 'var(--action)' : 'var(--line)'}">
      <div>
        <div style="font-size:15px;font-weight:700">${esc(g.name)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(g.address)} · ${esc(g.hours)}</div>
      </div>
      ${state.selectedGymId === g.id ? `<div style="width:20px;height:20px;border-radius:50%;background:var(--action);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:900">✓</div>` : ''}
    </div>`).join('');

  const empty = `<div class="empty">Todavía no hay ningún gimnasio registrado en Fight Club Gym Manager. Pedile a tu dueño que cree uno primero, y volvé a esta pantalla para unirte.</div>`;

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
      <button class="btn btn--action" ${act('confirmGymAndJoin')} ${(!state.selectedGymId || state.busy) ? 'disabled' : ''}>${state.busy ? 'Un momento…' : 'Continuar'}</button>
    </div>` : ''}
  </div>`;
}
