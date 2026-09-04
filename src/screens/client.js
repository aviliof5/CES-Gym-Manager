/* Bolá — panel de cliente (registro + home con sus 6 tabs).
   Movido 1:1 desde app.js (Fase 3, ver docs/MIGRATION_PLAN.md). */
'use strict';

import { state } from '../state.js';
import { LEVELS, GOALS, DURATION_LABELS, HOUR_VALUES } from '../data.js';
import {
  esc, act, chip, stepHead, stepBars, errorBanner, textField, emailField,
  phoneField, passwordField, passwordStrength, sectionTitle, tabsMarkup,
  devCredit, initials, daysUntil, barChart, commentCards,
} from '../helpers.js';

/* ---------------- cliente: registro ---------------- */

export function viewClientReg1() {
  const c = state.clientReg;
  const invalid = !(c.name.trim() && c.email.trim() && c.phone.trim() && passwordStrength(c.password) >= 2 && c.photoFile) || state.busy;
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
        ${emailField('clientReg.email', 'usuario *', c.email)}
        ${phoneField('clientReg.phonePrefix', 'clientReg.phone', c.phonePrefix, c.phone, 'Teléfono *')}
        ${passwordField('clientReg.password', 'Contraseña *', c.password, { strength: true })}
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
export function viewClientPhotoRequired() {
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

export function viewClientReg2() {
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

export function viewClientReg3() {
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

export function viewClientReg4() {
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

export function viewClientInicio() {
  const plan = state.myClientPlan || { name: '—', price: 0, duration: 'mensual' };
  const trainer = state.myClientTrainer;
  const total = plan.price + (trainer ? trainer.price : 0);
  return `<div class="pane">
    ${errorBanner()}
    <div style="background:linear-gradient(135deg,#1a0d0f,var(--surface));border:1px solid rgba(228,0,58,0.3);border-radius:16px;padding:18px;margin-bottom:16px">
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

export function viewClientEntrenar() {
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
    ${exercises.length ? `<div class="card" style="border-color:rgba(228,0,58,0.3);padding:16px">
      <div style="font-size:12.5px;color:var(--lime);font-weight:700;margin-bottom:10px">Rutina recomendada · ${esc(goalLabel)}</div>
      ${exercises.map(ex => `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
        <div style="width:6px;height:6px;border-radius:50%;background:var(--lime);flex-shrink:0"></div>
        <div style="font-size:13px">${esc(ex.text)}</div>
      </div>`).join('')}
      <div style="font-size:10.5px;color:var(--muted);margin-top:10px">Basado en el equipo disponible de ${esc(state.gym.name)}</div>
    </div>` : ''}
  </div>`;
}

export function viewClientProgreso() {
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

export function viewClientTrafico() {
  const max = Math.max.apply(null, HOUR_VALUES);
  const h = state.clientVisitHour;
  let info = '';
  if (h !== null) {
    const v = HOUR_VALUES[h];
    const pct = Math.round(v / max * 100);
    let level, color, bg;
    if (v < 35) { level = 'Bajo'; color = '#34D399'; bg = 'rgba(52,211,153,0.1)'; }
    else if (v < 65) { level = 'Medio'; color = '#FBBF24'; bg = 'rgba(251,191,36,0.1)'; }
    else { level = 'Alto'; color = '#FF5C5C'; bg = 'rgba(255,92,92,0.1)'; }
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

export function viewClientPago() {
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

export function viewClientComentarios() {
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

export const CLIENT_TABS = [['inicio', 'Inicio', 'home'], ['ia', 'Entrenar', 'zap'], ['progreso', 'Progreso', 'camera'], ['trafico', 'Tráfico', 'clock'], ['pago', 'Pago', 'card'], ['comentarios', 'Reseñas', 'chat']];

export function viewClientHome() {
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
  const alert = (days !== null && days <= 5) ? `<div style="margin:0 22px 12px;background:${urgent ? 'rgba(255,92,92,0.12)' : 'rgba(251,191,36,0.1)'};border:1px solid ${urgent ? 'rgba(255,92,92,0.4)' : 'rgba(251,191,36,0.35)'};border-radius:14px;padding:12px 14px;display:flex;gap:10px;align-items:center">
      <div style="width:30px;height:30px;border-radius:8px;background:${urgent ? 'rgba(255,92,92,0.2)' : 'rgba(251,191,36,0.2)'};display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">⏰</div>
      <div style="flex:1">
        <div style="font-size:12.5px;font-weight:800;color:${urgent ? 'var(--red)' : 'var(--amber)'}">${days <= 0 ? '¡Tu plan vence hoy!' : days === 1 ? '¡Tu plan vence mañana!' : 'Tu plan vence en ' + days + ' días'}</div>
        <div style="font-size:11px;color:var(--text-soft);margin-top:2px">Renueva ${esc(plan.name)} ($${esc(plan.price)}) para no perder tu acceso.</div>
      </div>
      <div ${act('goPayTab')} style="font-size:11px;font-weight:700;color:${urgent ? 'var(--red)' : 'var(--amber)'};cursor:pointer;white-space:nowrap">Pagar</div>
    </div>` : '';

  return `<div class="dash-shell">
    <div class="dash-main">
      <div class="app-head">
        <div>
          <div class="app-title">Hola, ${esc((client.name || 'Cliente').split(' ')[0])}</div>
          <div class="app-sub">${esc(state.gym.name)}</div>
        </div>
        <div ${act('signOut')} class="link-muted">Salir</div>
      </div>
      ${alert}
      ${(panes[state.clientTab] || panes.inicio)()}
      ${devCredit()}
    </div>
    <div class="tabbar tabbar--client">${tabsMarkup(CLIENT_TABS, state.clientTab, 'selectClientTab')}</div>
  </div>`;
}
