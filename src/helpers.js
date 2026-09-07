/* Bolá — helpers de formato y de markup compartidos por todas las pantallas.
   Movido 1:1 desde app.js (Fase 3, ver docs/MIGRATION_PLAN.md). */
'use strict';

import { state } from './state.js';
import { iconSpan, COUNTRY_CODES, EXERCISE_LIB } from './data.js';

// Formatea un importe con la moneda del gimnasio (gyms.currency, migración
// 20260905000200). USD lleva el símbolo delante ($50); cualquier otra moneda
// va con el código detrás (1000 CUP), que es como el propio gimnasio los
// muestra en sus carteles. Si todavía no se cargó el gym, cae a USD.
export function money(amount, currency) {
  const code = currency || (state.gym && state.gym.currency) || 'USD';
  const n = Number(amount) || 0;
  return code === 'USD' ? `$${n}` : `${n} ${code}`;
}

export function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function initials(name) {
  return (name || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// Devuelve entradas estructuradas {text, sets, reps, weightKg, restSeconds} —
// ver EXERCISE_LIB en data.js. routines.generateAi() las guarda tal cual en
// las columnas nuevas de routine_exercises (Etapa 2); `text` sigue yendo
// como resumen de respaldo para lo que todavía no las lee estructuradas.
export function buildRoutine(goal, equipmentNames) {
  const lib = EXERCISE_LIB[goal] || [];
  const eqLower = equipmentNames.map(e => e.toLowerCase());
  const matched = lib.filter(ex => ex.kw === null || eqLower.some(e => e.includes(ex.kw)));
  return (matched.length ? matched : lib).map(ex => ({ text: ex.text, sets: ex.sets, reps: ex.reps, weightKg: ex.weightKg, restSeconds: ex.restSeconds }));
}

export function statusMeta(st) {
  if (st === 'al_dia') return { label: 'Al día', cls: 'badge badge--al_dia' };
  if (st === 'pendiente') return { label: 'Pendiente', cls: 'badge badge--pendiente' };
  // 'suspendido' — migración 20260905000200 (gate de 10 clientes) — antes de
  // esto caía a "Vencido", que es engañoso: un socio suspendido a mano no es
  // lo mismo que uno con el pago atrasado.
  if (st === 'suspendido') return { label: 'Suspendido', cls: 'badge badge--suspendido' };
  return { label: 'Vencido', cls: 'badge badge--vencido' };
}

export function friendlyError(err) {
  const msg = (err && err.message) || '';
  // fetch() falla con estos mensajes técnicos ("Failed to fetch", etc.)
  // tanto sin conexión como con el servidor inalcanzable — junto con
  // navigator.onLine cubre el caso real sin depender de un solo mensaje.
  if (!navigator.onLine || /Failed to fetch|NetworkError|Load failed|network request failed|ERR_INTERNET_DISCONNECTED/i.test(msg)) {
    return 'Sin conexión a internet. Revisá tu conexión e intentá de nuevo.';
  }
  return msg || 'Ocurrió un error inesperado. Intenta de nuevo.';
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr + 'T00:00:00') - new Date(new Date().toDateString());
  return Math.round(ms / 86400000);
}

// Enriches a raw client_profiles row (from BolaAPI.clients.*) with its plan
// and trainer objects, resolved from the gym's already-loaded plans/trainers
// lists — keeps the render functions reading c.plan/c.amount/c.type like
// before, without an extra fetch per client.
export function enrichClient(c) {
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
export function act(name, value) {
  return `data-a="${name}"` + (value === undefined ? '' : ` data-v="${esc(value)}"`);
}

export function chip(active, variant, extraStyle) {
  const style = extraStyle ? ` style="${extraStyle}"` : '';
  return `class="chip chip--${variant}${active ? ' is-active' : ''}"${style}`;
}

export function stepBars(step, total, variant) {
  const bars = [];
  for (let i = 1; i <= total; i++) bars.push(`<i class="${i <= step ? 'on' : ''}"></i>`);
  return `<div class="step-bars ${variant}">${bars.join('')}</div>`;
}

export function stepHead(label, backAction) {
  return `<div class="step-head">
    <div class="back" ${act(backAction)}>&lsaquo;</div>
    <div class="step-label">${esc(label)}</div>
  </div>`;
}

// Marco compartido por las pantallas de acceso (admin/cliente/entrenador):
// ícono + título + subtítulo + banner de error, con el contenido propio
// (toggle login/registro + formulario o botón) inyectado por el llamador.
export function authScreen({ label, icon, accent, accentBg, title, subtitle, backAction, inner, footer }) {
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

export function sectionTitle(text, iconKey, extraStyle) {
  return `<div class="section-title" style="display:flex;align-items:center;gap:6px${extraStyle ? ';' + extraStyle : ''}">${iconSpan(iconKey, 14)}<span>${esc(text)}</span></div>`;
}

export function tabsMarkup(defs, activeId, actionName) {
  return defs.map(([id, label, ic]) =>
    `<div ${act(actionName, id)} class="tab${activeId === id ? ' is-active' : ''}">${iconSpan(ic, 16)}<span>${label}</span></div>`).join('');
}

export function textField(field, placeholder, value, opts) {
  const o = opts || {};
  return `<input class="field${o.sm ? ' field--sm' : ''}" type="${o.type || 'text'}"
    placeholder="${esc(placeholder)}" value="${esc(value)}" data-f="${field}"
    ${o.style ? `style="${o.style}"` : ''}/>`;
}

export function errorBanner() {
  if (!state.error) return '';
  return `<div style="margin:0 22px 12px;background:var(--danger-dim);border:1px solid rgba(var(--danger-rgb),0.4);border-radius:12px;padding:10px 14px;font-size:12.5px;color:var(--danger)">${esc(state.error)}</div>`;
}

// Banner persistente que se prepende a cualquier pantalla mientras el
// navegador no tiene conexión (ver listeners online/offline en router.js) —
// así el usuario lo ve apenas se corta, sin necesidad de tocar nada primero.
export function offlineBanner() {
  return `<div style="background:var(--danger);color:#fff;font-size:12px;font-weight:800;text-align:center;padding:8px 10px;display:flex;align-items:center;justify-content:center;gap:6px">${iconSpan('wifiOff', 14)}<span>Sin conexión a internet</span></div>`;
}

// Ver src/offline.js — avisa que hay acciones (marcar serie, check-in,
// confirmar cobro) guardadas en el celular esperando que vuelva la señal
// para mandarse solas. No es un error: por eso va en tono "warn", no
// "danger" como offlineBanner — la acción YA se aplicó en la pantalla,
// solo falta que el servidor se entere.
export function pendingSyncBanner() {
  if (!state.pendingSyncCount) return '';
  const n = state.pendingSyncCount;
  return `<div style="background:var(--warn);color:#1a1400;font-size:12px;font-weight:800;text-align:center;padding:8px 10px;display:flex;align-items:center;justify-content:center;gap:6px">${iconSpan('clock', 14)}<span>${n} ${n === 1 ? 'cambio pendiente' : 'cambios pendientes'} de sincronizar — se manda${n === 1 ? '' : 'n'} sol${n === 1 ? 'o' : 'os'} apenas vuelva la señal</span></div>`;
}

// Ídem, para cuando una pantalla está mostrando la última copia GUARDADA
// de una lista (ver loadWithFallback en actions.js) en vez de datos recién
// bajados — para que nadie confíe en un "Al día"/"Vencido" que puede
// llevar un rato desactualizado sin saberlo.
export function staleDataBanner() {
  if (!state.dataStale) return '';
  return `<div style="background:var(--warn-dim);color:var(--warn);border-bottom:1px solid rgba(var(--warn-rgb),0.3);font-size:11.5px;font-weight:700;text-align:center;padding:7px 10px;display:flex;align-items:center;justify-content:center;gap:6px">${iconSpan('wifiOff', 13)}<span>Mostrando la última info guardada — puede no estar al día</span></div>`;
}

// Input de correo que solo captura la parte local — el sufijo @gmail.com se
// muestra fijo al lado y se agrega en supabase-client.js al enviar. Evita
// que el usuario tenga que escribirlo (y typos tipo @gmial.com).
// inputmode a propósito NO es "email": muchos teclados (Gboard incluido)
// usan ese modo para mostrar @/.com en vez de la fila de números, y como
// esto es solo la parte local (nombres de usuario tipo "carla2024", con
// letras Y números mezclados) terminaba obligando a tocar "?123" cada vez
// para escribir un dígito. Con el modo de texto normal el teclado ya trae
// ambos combinados sin tener que cambiar de pantalla.
export function emailField(field, placeholder, value) {
  return `<div class="field-suffix field-suffix--email">
    <input class="field" type="text" inputmode="text" autocapitalize="none" autocorrect="off" spellcheck="false"
      placeholder="${esc(placeholder)}" value="${esc(value)}" data-f="${field}"/>
    <span class="field-suffix__label">@gmail.com</span>
  </div>`;
}

// 1 = débil, 2 = media, 3 = fuerte. "Media" pide 8+ caracteres combinando
// letras y números — es el mínimo que se exige para poder continuar en los
// registros (no en login, ahí la contraseña ya existe).
export function passwordStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  if (score <= 1) return 1;
  if (score <= 3) return 2;
  return 3;
}

export function passwordStrengthMeter(pw) {
  const level = passwordStrength(pw);
  const labels = ['', 'Débil', 'Media', 'Fuerte'];
  const colors = ['var(--surface-2)', 'var(--danger)', 'var(--warn)', 'var(--ok)'];
  const barColor = colors[level] || colors[0];
  const bars = [1, 2, 3].map(i => `<div style="flex:1;height:4px;border-radius:2px;background:${i <= level ? barColor : 'var(--surface-2)'}"></div>`).join('');
  const hint = pw
    ? (level < 2 ? `Débil — falta llegar a "Media": 8+ caracteres con letras y números` : `Seguridad: ${labels[level]}`)
    : 'Mínimo 8 caracteres, combinando letras y números';
  return `<div style="margin-top:-6px">
    <div style="display:flex;gap:4px;margin-bottom:4px">${bars}</div>
    <div style="font-size:11px;color:${pw ? barColor : 'var(--muted)'}">${hint}</div>
  </div>`;
}

// Contraseña con botón de ojo para mostrar/ocultar (state.showPassword es
// compartido: nunca hay dos campos de contraseña visibles a la vez en una
// misma pantalla). `opts.strength` agrega el medidor debajo — solo en los
// formularios de registro, donde se está eligiendo una contraseña nueva.
export function passwordField(field, placeholder, value, opts) {
  const o = opts || {};
  const visible = state.showPassword;
  return `<div class="field-suffix">
    <input class="field" type="${visible ? 'text' : 'password'}" autocapitalize="none" autocorrect="off"
      placeholder="${esc(placeholder)}" value="${esc(value)}" data-f="${field}"/>
    <div class="field-eye" ${act('togglePasswordVisibility')}>${iconSpan(visible ? 'eyeOff' : 'eye', 16)}</div>
  </div>${o.strength ? passwordStrengthMeter(value) : ''}`;
}

// Selector de prefijo de país + input numérico. El prefijo se guarda en su
// propio campo de estado (ver `phonePrefix` en adminReg/clientReg/trainerReg)
// y se combina con el número recién en el momento de mandar el registro.
export function phoneField(prefixPath, phonePath, prefixValue, phoneValue, placeholder) {
  const options = COUNTRY_CODES.map(([name, code]) =>
    `<option value="${esc(code)}"${code === prefixValue ? ' selected' : ''}>${esc(name)} (${code})</option>`).join('');
  return `<div style="display:flex;gap:8px">
    <select class="field" data-f="${prefixPath}" style="flex:0 0 92px;padding:14px 6px">${options}</select>
    <input class="field" type="text" inputmode="numeric" pattern="[0-9]*"
      placeholder="${esc(placeholder)}" value="${esc(phoneValue)}" data-f="${phonePath}" data-numeric="true" style="flex:1"/>
  </div>`;
}

// Separa un teléfono guardado como "+53512345678" en { prefix, phone } para
// precargar el formulario (ver resumeAdminSession). Prueba el prefijo más
// largo primero porque varios países comparten los primeros dígitos
// (+1 Canadá/EE.UU. vs +1876 Jamaica, etc.) — no es infalible, pero alcanza
// para reabrir un registro que la propia app generó.
export function splitPhone(full) {
  const v = (full || '').trim();
  if (!v.startsWith('+')) return { phonePrefix: '+53', phone: v.replace(/\D/g, '') };
  const byLength = [...COUNTRY_CODES].sort((x, y) => y[1].length - x[1].length);
  const match = byLength.find(([, code]) => v.startsWith(code));
  if (!match) return { phonePrefix: '+53', phone: v.replace(/\D/g, '') };
  return { phonePrefix: match[1], phone: v.slice(match[1].length).replace(/\D/g, '') };
}

// Crédito de marca — solo en las pantallas principales (selector de rol y
// los tres paneles de inicio), no en cada paso de los asistentes.
export function devCredit() {
  return `<div style="text-align:center;padding:8px 0 2px;font-size:9.5px;color:var(--muted-dim);letter-spacing:0.02em">Desarrollado por Cuban Enterprise Solution (CES)</div>`;
}

// Compartido entre Perfil (cliente) y Reportes (dueño/admin) — antes vivía
// duplicado por estar en el mismo archivo que su única llamadora.
export function commentCards(list) {
  return list.map(cm => `
    <div class="card" style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between">
        <div style="font-size:13.5px;font-weight:700">${esc(cm.name)}</div>
        <div style="font-size:12px;color:var(--action)">${'★'.repeat(cm.rating)}${'☆'.repeat(5 - cm.rating)}</div>
      </div>
      <div style="font-size:13px;color:var(--text-soft);margin-top:6px;line-height:1.5">${esc(cm.text)}</div>
      <div style="font-size:10.5px;color:var(--muted);margin-top:8px">${esc(cm.date)}</div>
    </div>`).join('');
}
