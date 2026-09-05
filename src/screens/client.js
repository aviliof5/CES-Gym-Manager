/* Bolá — panel de cliente (registro + home con sus tabs).
   Movido 1:1 desde app.js (Fase 3, ver docs/MIGRATION_PLAN.md); home
   rediseñado y ampliado en la Etapa 2 (ver docs/plans,
   "aqui-esta-el-logo") — Rutina/Progreso/Logros/Reservas/Pago/Perfil ahora
   leen datos reales en vez de mock estático. */
'use strict';

import { state } from '../state.js';
import { LEVELS, GOALS, DURATION_LABELS, MESES, DAY_LABELS, iconSpan } from '../data.js';
import {
  esc, act, chip, stepHead, stepBars, errorBanner, textField, emailField,
  phoneField, passwordField, passwordStrength, sectionTitle, tabsMarkup,
  devCredit, initials, daysUntil, commentCards, money, statusMeta,
} from '../helpers.js';
// Fase 16 — la tab "Plataforma" (generar invitación de dueño) no depende del
// rol: is_platform_admin puede caer en una cuenta de cualquier rol (ver
// docs/MIGRATION_PLAN.md Fase 16 seguimiento — el alta de cliente es la
// única sin invitación, así que en la práctica termina siendo la más usada
// para esto). Se reutiliza la misma vista que ya usa el panel de
// dueño/admin en vez de duplicar el formulario acá.
import { viewOwnerPlatform } from './owner.js';

/* ---------------- cliente: registro ---------------- */

export function viewClientReg1() {
  const c = state.clientReg;
  const invalid = !(c.name.trim() && c.email.trim() && c.phone.trim() && passwordStrength(c.password) >= 2 && c.photoFile) || state.busy;
  const photo = c.photoPreviewUrl
    ? `<img src="${esc(c.photoPreviewUrl)}" alt="Foto de rostro"/>`
    : 'Foto de rostro *';

  // Llega desde viewInviteWelcome (con link) o directo desde viewLanding
  // ("¿Sos cliente nuevo?", sin invitación) — el back vuelve adonde vino.
  const backTo = state.inviteRole === 'client' ? 'goto:inviteWelcome' : 'goto:landing';
  return `<div class="col">
    ${stepHead('Paso 1 de 4 · Registro Cliente', backTo)}
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

const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function formatSessionWhen(iso) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} · ${hh}:${mm}`;
}

// "Mi QR" (sección 13 del pedido original) — el QR es real (Fase 15, ver
// src/qr.js): codifica {t:'checkin', gym, u} en JSON, y la pantalla
// "Escanear QR" del staff (viewScanCheckin en owner.js) lo lee con la
// cámara y llama al mismo check_in_client() que ya usaba el botón manual
// "Registrar entrada" — la seguridad real sigue siendo 100% del RPC
// server-side, esto solo evita que el staff tenga que buscar al cliente en
// una lista. Lo que SÍ era real desde antes es el historial debajo.
function formatCheckinTime(iso) {
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 10)} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function qrCard() {
  const history = state.checkinHistory;
  const payload = JSON.stringify({ t: 'checkin', gym: state.gym.id, u: state.myClient.id });
  return `<div class="card" style="margin-bottom:12px">
    <div style="display:flex;align-items:center;gap:14px">
      <canvas class="qr-canvas" data-qr="${esc(payload)}" data-qr-size="64"></canvas>
      <div style="flex:1">
        <div class="eyebrow">Mi QR</div>
        <div style="font-size:var(--fs-sm);color:var(--muted);margin-top:2px">Mostrá este código en recepción al llegar al gym</div>
      </div>
    </div>
    ${history.length ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
      <div class="eyebrow" style="margin-bottom:6px">Últimos check-ins</div>
      ${history.map(h => `<div style="font-size:var(--fs-sm);color:var(--text-soft);padding:3px 0">${esc(formatCheckinTime(h.created_at))}</div>`).join('')}
    </div>` : `<div style="font-size:var(--fs-xs);color:var(--muted);margin-top:10px">Todavía no tenés check-ins registrados.</div>`}
  </div>`;
}

// "Próxima clase" (pantalla #1 del plan) — la reserva más próxima entre las
// activas de este cliente, cruzada con las sesiones ya cargadas en
// enterClientHome(). Vacío cuando no reservó nada: manda directo a Reservas.
function nextClassCard() {
  const now = Date.now();
  const upcoming = state.myBookings
    .map(b => ({ booking: b, session: state.classSessions.find(s => s.id === b.session_id) }))
    .filter(x => x.session && new Date(x.session.starts_at).getTime() >= now)
    .sort((a, b) => new Date(a.session.starts_at) - new Date(b.session.starts_at));

  if (!upcoming.length) {
    return `<div class="row">
      <div class="row__body">
        <div class="row__title">Sin clases reservadas</div>
        <div class="row__meta">Reservá tu próxima clase en la pestaña Reservas</div>
      </div>
      <div class="row__action" ${act('selectClientTab', 'reservas')}>Ver clases</div>
    </div>`;
  }
  const { session } = upcoming[0];
  const cls = session.class || {};
  return `<div class="row">
    <div class="avatar avatar--sq avatar--brand">${iconSpan('calendar', 18)}</div>
    <div class="row__body">
      <div class="row__title">${esc(cls.name || 'Clase')}</div>
      <div class="row__meta">${esc(formatSessionWhen(session.starts_at))}</div>
    </div>
    <div class="row__action" ${act('selectClientTab', 'reservas')}>Ver</div>
  </div>`;
}

// "Entrenamiento de hoy" — cuál de las dos rutinas (la del entrenador si
// tiene una cargada, si no la de IA) tiene ejercicios listos para arrancar.
function todayWorkoutCard() {
  const trainer = state.myClientTrainer;
  const trainerEx = (state.trainerRoutineForMe && state.trainerRoutineForMe.exercises) || [];
  const aiEx = (state.aiRoutine && state.aiRoutine.exercises) || [];
  const useTrainer = trainer && trainerEx.length > 0;
  const exercises = useTrainer ? trainerEx : aiEx;

  if (!exercises.length) {
    return `<div class="row">
      <div class="row__body">
        <div class="row__title">Sin rutina todavía</div>
        <div class="row__meta">Generá una con IA en la pestaña Rutina</div>
      </div>
      <div class="row__action" ${act('selectClientTab', 'rutina')}>Ir</div>
    </div>`;
  }
  return `<div class="row">
    <div class="avatar avatar--sq avatar--action">${iconSpan('dumbbell', 18)}</div>
    <div class="row__body">
      <div class="row__title">${useTrainer ? `Rutina de ${esc(trainer.name.split(' ')[0])}` : 'Rutina con IA'}</div>
      <div class="row__meta">${exercises.length} ${exercises.length === 1 ? 'ejercicio' : 'ejercicios'}</div>
    </div>
    <div class="row__action" ${act('startWorkout', useTrainer ? 'trainer' : 'ia')}>Comenzar</div>
  </div>`;
}

export function viewClientInicio() {
  const achievementsEarned = state.myAchievements.filter(a => a.earned_at).length;
  const lastMeasure = state.bodyMeasurements[state.bodyMeasurements.length - 1];
  return `<div class="pane">
    ${errorBanner()}
    <div class="eyebrow" style="margin-bottom:8px">Próxima clase</div>
    ${nextClassCard()}
    <div class="eyebrow" style="margin:16px 0 8px">Entrenamiento de hoy</div>
    ${todayWorkoutCard()}
    <div class="stat-grid" style="margin:16px 0">
      <div class="stat rise" ${act('selectClientTab', 'logros')} style="cursor:pointer">
        <div class="stat__label">Logros</div>
        <div class="stat__value">${achievementsEarned}<span style="font-size:16px;color:var(--muted)">/${state.achievementsCatalog.length}</span></div>
        <div class="stat__hint">Medallas conseguidas</div>
      </div>
      <div class="stat rise" ${act('selectClientTab', 'progreso')} style="cursor:pointer">
        <div class="stat__label">Peso actual</div>
        <div class="stat__value">${lastMeasure && lastMeasure.weight_kg != null ? lastMeasure.weight_kg : '—'}<span style="font-size:14px;color:var(--muted)">kg</span></div>
        <div class="stat__hint">${state.workoutsThisMonth} ${state.workoutsThisMonth === 1 ? 'entreno' : 'entrenos'} este mes</div>
      </div>
    </div>
    ${qrCard()}
    ${sectionTitle('Máquinas disponibles en tu gym', 'dumbbell')}
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${state.equipment.map(e => `<div class="pill">${esc(e.name)}</div>`).join('')}
    </div>
  </div>`;
}

// "¿Quieres ser entrenador de Fight Club?" (sección 11 del pedido original)
// — desde el lado del cliente: candidatos pendientes de SU gimnasio, con el
// conteo real de interés (state.trainerInterest, cargado junto al resto de
// enterClientHome) y un toggle para marcar/desmarcar. Etapa 2: se eliminó
// la regla de los 10 (el dueño aprueba a mano) — acá solo se informa el
// conteo, sin gate.
function trainerCandidatesSection() {
  const pending = state.trainersForGym.filter(t => t.status === 'pending');
  if (!pending.length) return '';
  const myId = state.myClient.id;

  const cards = pending.map(t => {
    const interested = state.trainerInterest.filter(i => i.candidate_user_id === t.id);
    const iAmInterested = interested.some(i => i.client_user_id === myId);
    return `<div class="row">
      <div class="avatar avatar--sq avatar--brand">${esc(initials(t.name))}</div>
      <div class="row__body">
        <div class="row__title">${esc(t.name)}</div>
        <div class="row__meta">${esc(t.specialty)} · ${interested.length} ${interested.length === 1 ? 'interesado' : 'interesados'}</div>
      </div>
      <div ${act(iAmInterested ? 'unmarkTrainerInterest' : 'markTrainerInterest', t.id)} class="chip chip--brand${iAmInterested ? ' is-active' : ''}">${iAmInterested ? '✓ Te interesa' : 'Me interesa'}</div>
    </div>`;
  }).join('');

  return `${sectionTitle('¿Querés que sea tu entrenador?', 'idcard', 'margin:20px 0 8px')}
    <div class="hint" style="margin-bottom:10px">Marcá tu interés — el gimnasio lo tiene en cuenta al aprobar entrenadores</div>
    ${cards}`;
}

// Fila de un ejercicio de rutina con sus datos estructurados (Etapa 2 —
// antes esto era un string libre tipo "Sentadilla en rack - 4x8"; ahora
// routine_exercises trae sets/reps/weightKg/restSeconds de verdad). Se
// exporta porque trainer.js (pantalla "Mis clientes" → rutina del cliente)
// muestra exactamente la misma fila.
export function exerciseRow(ex) {
  const detail = [
    ex.sets ? `${ex.sets} series` : null,
    ex.reps ? `${esc(String(ex.reps))} reps` : null,
    ex.weightKg != null ? `${ex.weightKg} kg` : null,
    ex.restSeconds ? `${ex.restSeconds}s descanso` : null,
  ].filter(Boolean).join(' · ');
  return `<div class="row">
    <div class="row__body">
      <div class="row__title">${esc(ex.text)}</div>
      ${detail ? `<div class="row__meta">${detail}</div>` : ''}
    </div>
  </div>`;
}

export function viewClientRutina() {
  const trainer = state.myClientTrainer;
  const source = trainer ? state.routineSource : 'ia';

  const toggle = trainer ? `<div class="seg">
      <div ${act('setRoutineSource', 'ia')} class="seg__item${source === 'ia' ? ' is-active' : ''}">Con IA</div>
      <div ${act('setRoutineSource', 'trainer')} class="seg__item${source === 'trainer' ? ' is-active' : ''}">De ${esc(trainer.name.split(' ')[0])}</div>
    </div>` : '';

  if (source === 'trainer') {
    const routine = state.trainerRoutineForMe;
    const exercises = (routine && routine.exercises) || [];
    return `<div class="pane">
      ${errorBanner()}
      ${sectionTitle('Rutina de tu entrenador', 'dumbbell', 'margin-bottom:4px')}
      <div class="hint">Creada y actualizada por ${esc(trainer.name)}</div>
      ${toggle}
      ${exercises.length
        ? `<button class="btn btn--action" style="padding:14px;font-size:14px;margin:12px 0 16px;width:100%" ${act('startWorkout', 'trainer')}>Comenzar entrenamiento</button>
           ${exercises.map(exerciseRow).join('')}`
        : `<div class="empty"><div class="empty__title">Sin rutina</div>Tu entrenador aún no ha creado tu rutina.<br/>Mientras tanto, probá la rutina con IA.</div>`}
      ${trainerCandidatesSection()}
    </div>`;
  }

  const goals = GOALS.map(g => `<div ${act('setAiGoal', g.id)} ${chip(state.aiGoal === g.id, 'action')}>${g.label}</div>`).join('');
  const goalLabel = (GOALS.find(g => g.id === state.aiGoal) || {}).label || '';
  const exercises = (state.aiRoutine && state.aiRoutine.exercises) || [];

  return `<div class="pane">
    ${errorBanner()}
    ${sectionTitle('Rutina con IA', 'zap', 'margin-bottom:4px')}
    <div class="hint">Elige tu meta y generamos una rutina según las máquinas de tu gym</div>
    ${toggle}
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 16px">${goals}</div>
    <button class="btn btn--brand" style="padding:14px;font-size:14px;margin-bottom:16px;width:100%" ${act('generateRoutine')}>${state.busy ? 'Generando…' : 'Generar rutina con IA'}</button>
    ${exercises.length ? `<button class="btn btn--action" style="padding:14px;font-size:14px;margin-bottom:16px;width:100%" ${act('startWorkout', 'ia')}>Comenzar entrenamiento</button>
    <div class="eyebrow" style="margin-bottom:8px">Rutina recomendada · ${esc(goalLabel)}</div>
    ${exercises.map(exerciseRow).join('')}
    <div style="font-size:var(--fs-xs);color:var(--muted);margin-top:10px">Basado en el equipo disponible de ${esc(state.gym.name)}</div>` : ''}
    ${trainerCandidatesSection()}
  </div>`;
}

function formatRest(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function viewWorkout() {
  const w = state.workout;
  if (!w) return `<div class="pane"></div>`;

  if (w.finished) {
    const totalSets = Object.values(w.doneSets).reduce((sum, v) => sum + (v instanceof Set ? v.size : (v === true ? 1 : 0)), 0);
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px 28px">
      <div style="width:64px;height:64px;border-radius:50%;background:var(--ok-dim);display:flex;align-items:center;justify-content:center;color:var(--ok);margin-bottom:20px">${iconSpan('check', 28)}</div>
      <div class="title" style="margin-bottom:0">Entrenamiento completado</div>
      <div style="font-size:13px;color:var(--muted);margin-top:8px;line-height:1.6">${w.exercises.length} ${w.exercises.length === 1 ? 'ejercicio' : 'ejercicios'} · ${totalSets} ${totalSets === 1 ? 'serie marcada' : 'series marcadas'}</div>
      <button class="btn btn--action" style="margin-top:28px" ${act('exitWorkout')}>Volver</button>
    </div>`;
  }

  const ex = w.exercises[w.index] || {};
  const doneForThis = w.doneSets[w.index];
  const isLast = w.index + 1 >= w.exercises.length;
  const hasSets = Number(ex.sets) > 0;

  // Un campo de peso/reps por EJERCICIO (no por serie) — se precarga con el
  // último valor conocido (ver ACTIONS.startWorkout/nextExercise/
  // prevExercise) y se puede ajustar antes de marcar cada serie: así queda
  // lo que de verdad se levantó, no solo un check (ver exercise_logs).
  const inputsRow = `<div style="display:flex;gap:10px;margin-bottom:16px">
    ${textField('workout.weightInput', 'Peso (kg)', w.weightInput, { style: 'flex:1' })}
    ${textField('workout.repsInput', 'Reps hechas', w.repsInput, { style: 'flex:1' })}
  </div>`;

  const setsBlock = hasSets
    ? `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
        ${Array.from({ length: Number(ex.sets) }, (_, i) => i + 1).map(n => {
          const checked = doneForThis instanceof Set && doneForThis.has(n);
          return `<div ${act('toggleSet', n)} class="row" style="margin-bottom:0;cursor:pointer;${checked ? 'border-color:var(--action);background:var(--action-dim)' : ''}">
            <div style="width:22px;height:22px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:${checked ? 'var(--action)' : 'transparent'};border:1px solid ${checked ? 'transparent' : 'var(--line-strong)'};color:#fff">${checked ? iconSpan('check', 13) : ''}</div>
            <div class="row__body" style="font-size:13.5px;font-weight:600">Serie ${n}${ex.reps ? ` · ${esc(String(ex.reps))} reps` : ''}</div>
          </div>`;
        }).join('')}
      </div>`
    : `<div ${act('toggleSimpleDone')} class="row" style="cursor:pointer;margin-bottom:20px;${doneForThis === true ? 'border-color:var(--action);background:var(--action-dim)' : ''}">
        <div style="width:22px;height:22px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:${doneForThis === true ? 'var(--action)' : 'transparent'};border:1px solid ${doneForThis === true ? 'transparent' : 'var(--line-strong)'};color:#fff">${doneForThis === true ? iconSpan('check', 13) : ''}</div>
        <div class="row__body" style="font-size:13.5px;font-weight:600">Marcar como completado${ex.reps ? ` · ${esc(String(ex.reps))}` : ''}</div>
      </div>`;

  const restBlock = w.restSecondsLeft > 0 ? `<div class="card--dashed" style="align-items:center;text-align:center;margin-bottom:20px">
      <div class="eyebrow">Descanso</div>
      <div style="font-family:var(--font-display);font-size:32px;color:var(--action)">${formatRest(w.restSecondsLeft)}</div>
      <div ${act('skipRest')} style="font-size:12px;color:var(--muted);cursor:pointer;text-decoration:underline">Saltar descanso</div>
    </div>` : '';

  return `<div class="col">
    <div class="step-head" style="justify-content:space-between">
      <div class="back" ${act('exitWorkout')}>&lsaquo;</div>
      <div class="step-label">Ejercicio ${w.index + 1} de ${w.exercises.length}</div>
      <div style="width:32px"></div>
    </div>
    ${stepBars(w.index + 1, w.exercises.length, '')}
    <div class="form-body">
      <div class="title">${esc(ex.text)}</div>
      ${restBlock}
      ${inputsRow}
      ${setsBlock}
    </div>
    <div class="form-foot" style="display:flex;gap:10px">
      ${w.index > 0 ? `<button class="btn btn--ghost" style="flex:1" ${act('prevExercise')}>Anterior</button>` : ''}
      <button class="btn btn--action" style="flex:2" ${act('nextExercise')}>${isLast ? 'Finalizar' : 'Siguiente'}</button>
    </div>
  </div>`;
}

export function viewClientProgreso() {
  const photoCards = state.progressList.map(p => `
    <div>
      <div class="thumb${p.url ? '' : ' thumb--pending'}" style="width:100%;height:130px" ${act('pickPhoto', 'progress:' + p.id)}>
        ${p.url ? `<img src="${esc(p.url)}" alt="Progreso ${esc(p.taken_at)}"/>` : 'Sube tu foto'}
      </div>
      <div style="font-size:var(--fs-xs);color:var(--muted);margin-top:6px;text-align:center">${esc(p.taken_at)}</div>
    </div>`).join('');

  const last = state.bodyMeasurements[state.bodyMeasurements.length - 1];
  const d = state.measurementDraft;
  const trainer = state.myClientTrainer;

  const prRows = state.personalRecords.length
    ? state.personalRecords.map(pr => `<div class="row">
        <div class="row__body"><div class="row__title">${esc(pr.exerciseName)}</div><div class="row__meta">Récord personal</div></div>
        <div style="font-family:var(--font-display);font-size:20px">${pr.maxWeightKg}<span style="font-size:12px;color:var(--muted)">kg</span></div>
      </div>`).join('')
    : `<div class="empty"><div class="empty__title">Sin récords todavía</div>Se registran solos cuando entrenás con peso</div>`;

  return `<div class="pane">
    ${errorBanner()}
    ${sectionTitle('Progreso', 'bars', 'margin-bottom:4px')}
    <div class="hint" style="margin-bottom:12px">Medidas, récords y fotos — todo lo que registrás de verdad${trainer ? ' · tu entrenador puede verlo' : ''}</div>
    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat"><div class="stat__label">Peso</div><div class="stat__value">${last && last.weight_kg != null ? last.weight_kg : '—'}<span style="font-size:14px;color:var(--muted)">kg</span></div></div>
      <div class="stat stat--brand"><div class="stat__label">% Grasa</div><div class="stat__value">${last && last.body_fat_pct != null ? last.body_fat_pct : '—'}<span style="font-size:14px;color:var(--muted)">%</span></div></div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="eyebrow" style="margin-bottom:10px">Registrar medidas de hoy</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        ${textField('measurementDraft.weight_kg', 'Peso (kg)', d.weight_kg)}
        ${textField('measurementDraft.body_fat_pct', '% grasa', d.body_fat_pct)}
        ${textField('measurementDraft.waist_cm', 'Cintura (cm)', d.waist_cm)}
        ${textField('measurementDraft.chest_cm', 'Pecho (cm)', d.chest_cm)}
        ${textField('measurementDraft.arm_cm', 'Brazo (cm)', d.arm_cm)}
        ${textField('measurementDraft.thigh_cm', 'Muslo (cm)', d.thigh_cm)}
      </div>
      <button class="btn btn--action" style="width:100%;padding:12px;font-size:13px" ${act('saveMeasurement')}>Guardar medidas de hoy</button>
    </div>
    ${sectionTitle('Récords personales', 'crown', 'margin-bottom:8px')}
    ${prRows}
    ${sectionTitle('Fotos de progreso', 'camera', 'margin:20px 0 8px')}
    <button class="btn btn--brand" style="padding:13px;font-size:13.5px;margin-bottom:16px;width:100%" ${act('addProgress')}>+ Agregar foto de hoy</button>
    ${state.progressList.length
      ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${photoCards}</div>`
      : `<div class="empty"><div class="empty__title">Sin fotos</div>Agregá la primera para empezar tu seguimiento</div>`}
  </div>`;
}

export function viewClientLogros() {
  const cards = state.achievementsCatalog.map(a => {
    const mine = state.myAchievements.find(m => m.achievement_id === a.id) || { progress: 0, earned_at: null };
    const pct = Math.max(0, Math.min(100, Math.round((mine.progress / a.target) * 100)));
    return `<div class="medal rise${mine.earned_at ? ' is-earned' : ''}">
      <div class="medal__disc">${iconSpan(a.icon || 'crown', 28)}</div>
      <div class="medal__name">${esc(a.name)}</div>
      <div class="medal__hint">${mine.earned_at ? 'Conseguido' : `${mine.progress}/${a.target}`}</div>
      ${!mine.earned_at ? `<div class="progress" style="margin-top:6px"><div class="progress__fill" style="width:${pct}%"></div></div>` : ''}
    </div>`;
  }).join('');

  return `<div class="pane">
    ${sectionTitle('Logros', 'crown', 'margin-bottom:4px')}
    <div class="hint" style="margin-bottom:16px">Se desbloquean solos a medida que entrenás y hacés check-in</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px 10px">${cards}</div>
  </div>`;
}

function dayIndexMon(date) { return (date.getDay() + 6) % 7; }

// "Reservas y calendario de clases" (pantalla nueva del plan) — calendario
// real del mes actual: los días con `has-event` tienen al menos una sesión
// cargada por el staff (ver classes/class_sessions, Etapa 2). Elegir un día
// filtra la lista de abajo; reservar/cancelar pasa por book_class()/
// cancel_booking() (RPC, valida cupo del lado del servidor).
export function viewClientReservas() {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstOffset = dayIndexMon(new Date(year, month, 1));
  const todayNum = now.getDate();
  const selectedDay = state.reservasSelectedDay || todayNum;

  const sessionsByDay = {};
  state.classSessions.forEach(s => {
    const d = new Date(s.starts_at);
    if (d.getFullYear() === year && d.getMonth() === month) {
      (sessionsByDay[d.getDate()] = sessionsByDay[d.getDate()] || []).push(s);
    }
  });

  const cells = [];
  for (let i = 0; i < firstOffset; i++) cells.push('<div class="cal__day is-muted"></div>');
  for (let day = 1; day <= daysInMonth; day++) {
    const cls = ['cal__day'];
    if (day === todayNum) cls.push('is-today');
    if (day === selectedDay) cls.push('is-selected');
    if (sessionsByDay[day]) cls.push('has-event');
    cells.push(`<div class="${cls.join(' ')}" ${act('selectReservasDay', day)}>${day}</div>`);
  }

  const daySessions = (sessionsByDay[selectedDay] || []).slice().sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const list = daySessions.length ? daySessions.map(s => {
    const cls = s.class || {};
    const booking = state.myBookings.find(b => b.session_id === s.id);
    return `<div class="row">
      <div class="avatar avatar--sq avatar--brand">${iconSpan('dumbbell', 18)}</div>
      <div class="row__body">
        <div class="row__title">${esc(cls.name || 'Clase')}</div>
        <div class="row__meta">${esc(formatSessionWhen(s.starts_at))} · ${cls.duration_minutes || 60} min · cupo ${cls.capacity || '—'}</div>
      </div>
      ${booking
        ? `<div class="row__action" style="color:var(--danger)" ${act('cancelBooking', booking.id)}>Cancelar</div>`
        : `<div class="row__action" ${act('bookClass', s.id)}>Reservar</div>`}
    </div>`;
  }).join('') : `<div class="empty"><div class="empty__title">Sin clases este día</div>Elegí otro día del calendario</div>`;

  return `<div class="pane">
    ${errorBanner()}
    ${sectionTitle('Reservas', 'calendar', 'margin-bottom:12px')}
    <div class="cal" style="margin-bottom:16px">
      <div class="cal__head"><div class="cal__month">${MESES[month]} ${year}</div></div>
      <div class="cal__grid">${DAY_LABELS.map(d => `<div class="cal__dow">${d}</div>`).join('')}${cells.join('')}</div>
    </div>
    ${list}
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
      <div class="eyebrow">Próximo pago</div>
      <div style="font-family:var(--font-display);font-size:28px;margin-top:6px">${money(total)}</div>
      ${trainer ? `<div style="font-size:var(--fs-xs);color:var(--muted);margin-top:6px">Incluye plan (${money(plan.price)}) + entrenador (${money(trainer.price)})</div>` : ''}
      <div style="font-size:var(--fs-sm);color:var(--muted);margin-top:10px">Aún no hay un cobro generado. Pide al administrador que genere tu código QR para pagar.</div>
    </div>`;
  } else {
    body = `<div style="margin-top:20px;font-size:var(--fs-md);font-weight:700">Muestra este código en el mostrador</div>
      <canvas class="qr-canvas" style="margin-top:16px" data-qr="${esc(JSON.stringify({ t: 'payment', id: pending.id }))}" data-qr-size="180"></canvas>
      <div style="font-size:var(--fs-sm);color:var(--muted);margin-top:12px">Paga ${money(pending.amount)} en efectivo. El staff confirmará el cobro desde su panel.</div>
      <div style="font-size:var(--fs-sm);color:var(--warn);margin-top:14px;font-weight:700">Esperando confirmación del gimnasio…</div>
      <div ${act('refreshPendingPayment')} style="font-size:var(--fs-sm);color:var(--muted);margin-top:14px;cursor:pointer;text-decoration:underline">¿Ya te confirmaron? Actualizar</div>`;
  }

  return `<div class="pane" style="display:flex;flex-direction:column;align-items:center;text-align:center">${errorBanner()}${body}</div>`;
}

// "Perfil" (pantalla nueva del plan) — datos propios + membresía, la
// calificación al propio entrenador asignado (trainer_reviews, distinto de
// `reviews` que son del gimnasio) y las reseñas del gimnasio (antes su
// propia tab "Reseñas", ahora una sección acá).
export function viewClientPerfil() {
  const client = state.myClient;
  const trainer = state.myClientTrainer;
  const plan = state.myClientPlan || { name: '—', price: 0, duration: 'mensual' };
  const meta = statusMeta(client.status);
  const draft = state.trainerRatingDraft;
  const ratingStars = [1, 2, 3, 4, 5].map(n =>
    `<span ${act('setTrainerRatingStars', n)} style="cursor:pointer;font-size:22px;color:${n <= draft.rating ? 'var(--action)' : 'var(--muted-dim)'}">★</span>`).join('');
  const reviewStars = [1, 2, 3, 4, 5].map(n =>
    `<div ${act('setStarRating', n)} style="font-size:20px;cursor:pointer;color:${n <= state.newCommentRating ? 'var(--action)' : 'var(--muted-dim)'}">★</div>`).join('');

  return `<div class="pane">
    ${errorBanner()}
    <div class="row">
      <div class="avatar avatar--sq avatar--brand" style="width:48px;height:48px;font-size:16px">${esc(initials(client.name))}</div>
      <div class="row__body">
        <div class="row__title">${esc(client.name)}</div>
        <div class="row__meta">${esc(client.email)} · ${esc(client.phone)}</div>
      </div>
      <span class="${meta.cls}">${meta.label}</span>
    </div>
    <div class="stat-grid" style="margin:12px 0 16px">
      <div class="stat">
        <div class="stat__label">Plan</div>
        <div class="stat__value" style="font-size:18px">${esc(plan.name)}</div>
        <div class="stat__hint">${money(plan.price)} · ${esc(DURATION_LABELS[plan.duration] || plan.duration)}</div>
      </div>
      <div class="stat stat--brand">
        <div class="stat__label">Nivel</div>
        <div class="stat__value" style="font-size:18px">${esc((LEVELS.find(l => l.id === client.physical.level) || {}).label || '—')}</div>
        <div class="stat__hint">${esc((GOALS.find(g => g.id === client.physical.goal) || {}).label || '—')}</div>
      </div>
    </div>
    ${trainer ? `
      ${sectionTitle('Tu entrenador', 'idcard', 'margin-bottom:8px')}
      <div class="row">
        <div class="avatar avatar--sq avatar--action">${esc(initials(trainer.name))}</div>
        <div class="row__body">
          <div class="row__title">${esc(trainer.name)}</div>
          <div class="row__meta">${esc(trainer.specialty)} · ${money(trainer.price)}/mes</div>
        </div>
        <div class="row__action" ${act('openTrainerChat')}>${iconSpan('chat', 18)}</div>
      </div>
      <div class="card" style="margin:10px 0 16px">
        <div class="eyebrow" style="margin-bottom:8px">Calificá a tu entrenador</div>
        <div style="display:flex;gap:4px;margin-bottom:10px">${ratingStars}</div>
        <textarea class="field" data-f="trainerRatingDraft.text" placeholder="¿Cómo te está yendo con tu entrenador?" style="min-height:64px;padding:12px 14px;font-size:13px;resize:none;margin-bottom:10px">${esc(draft.text)}</textarea>
        <button class="btn btn--action" style="width:100%;padding:12px;font-size:13px" ${act('saveTrainerRating')} ${!draft.rating ? 'disabled' : ''}>${state.myTrainerRating ? 'Actualizar calificación' : 'Enviar calificación'}</button>
      </div>` : ''}
    ${sectionTitle('Reseñas del gimnasio', 'star', 'margin-bottom:8px')}
    <div style="display:flex;gap:6px;margin-bottom:10px">${reviewStars}</div>
    <textarea class="field" data-f="newCommentText" placeholder="¿Cómo ha sido tu experiencia en el gym?" style="min-height:70px;padding:12px 14px;font-size:13px;resize:none">${esc(state.newCommentText)}</textarea>
    <button class="btn btn--brand" style="margin-top:10px;padding:12px;font-size:13px;width:100%" ${act('addComment')}>Publicar reseña</button>
    <div class="section-title" style="margin:20px 0 10px">Todas las reseñas</div>
    ${commentCards(state.reviews)}
    <button class="btn btn--ghost" style="width:100%;margin-top:20px" ${act('signOut')}>Cerrar sesión</button>
  </div>`;
}

// Chat con el propio entrenador asignado (get_or_create_conversation +
// messages, Etapa 2) — pantalla completa, no una tab (se entra desde Perfil).
export function viewClientChat() {
  const trainer = state.myClientTrainer;
  const myId = state.myClient.id;
  const bubbles = state.messages.map(m => {
    const mine = m.sender_user_id === myId;
    return `<div style="display:flex;justify-content:${mine ? 'flex-end' : 'flex-start'};margin-bottom:8px">
      <div style="max-width:78%;background:${mine ? 'var(--action)' : 'var(--surface-2)'};color:${mine ? '#fff' : 'var(--text)'};padding:10px 14px;border-radius:14px;font-size:13px;line-height:1.4">${esc(m.body)}</div>
    </div>`;
  }).join('');

  return `<div class="col">
    <div class="step-head" style="justify-content:space-between">
      <div class="back" ${act('closeTrainerChat')}>&lsaquo;</div>
      <div class="step-label">${esc(trainer ? trainer.name : 'Mensajes')}</div>
      <div style="width:32px"></div>
    </div>
    <div class="form-body" style="display:flex;flex-direction:column">
      ${bubbles || `<div class="empty"><div class="empty__title">Sin mensajes</div>Escribile a tu entrenador</div>`}
    </div>
    <div class="form-foot" style="display:flex;gap:8px">
      <input class="field" style="flex:1" data-f="messageDraft" placeholder="Escribe un mensaje…" value="${esc(state.messageDraft)}"/>
      <button class="btn btn--action" ${act('sendMessage')}>Enviar</button>
    </div>
  </div>`;
}

// "Plataforma" (Fase 16) se agrega condicionalmente en viewClientHome, solo
// para is_platform_admin — ver el comentario del import de viewOwnerPlatform
// más arriba.
const CLIENT_BASE_TABS = [
  ['inicio', 'Inicio', 'home'],
  ['rutina', 'Rutina', 'dumbbell'],
  ['progreso', 'Progreso', 'bars'],
  ['logros', 'Logros', 'crown'],
  ['reservas', 'Reservas', 'calendar'],
  ['pago', 'Pago', 'card'],
  ['perfil', 'Perfil', 'idcard'],
];

export function viewClientHome() {
  const client = state.myClient;
  const isPlatformAdmin = !!(state.myProfile && state.myProfile.is_platform_admin);
  const tabs = isPlatformAdmin ? [...CLIENT_BASE_TABS, ['plataforma', 'Plataforma', 'shield']] : CLIENT_BASE_TABS;
  const panes = {
    inicio: viewClientInicio,
    rutina: viewClientRutina,
    progreso: viewClientProgreso,
    logros: viewClientLogros,
    reservas: viewClientReservas,
    pago: viewClientPago,
    perfil: viewClientPerfil,
    plataforma: viewOwnerPlatform,
  };
  const activeTab = (state.clientTab === 'plataforma' && !isPlatformAdmin) ? 'inicio' : state.clientTab;

  const days = daysUntil(client.membershipExpiresAt);
  const urgent = days !== null && days <= 1;
  const plan = state.myClientPlan || { name: '—', price: 0 };
  const alert = (days !== null && days <= 5) ? `<div class="alert${urgent ? '' : ' alert--warn'}" style="margin:0 22px 12px">
      <div style="width:30px;height:30px;border-radius:8px;background:${urgent ? 'var(--danger-dim)' : 'var(--warn-dim)'};display:flex;align-items:center;justify-content:center;color:${urgent ? 'var(--danger)' : 'var(--warn)'};flex-shrink:0">${iconSpan('clock', 16)}</div>
      <div style="flex:1">
        <div style="font-size:var(--fs-sm);font-weight:800;color:${urgent ? 'var(--danger)' : 'var(--warn)'}">${days <= 0 ? '¡Tu plan vence hoy!' : days === 1 ? '¡Tu plan vence mañana!' : 'Tu plan vence en ' + days + ' días'}</div>
        <div class="alert__text">Renová ${esc(plan.name)} (${money(plan.price)}) para no perder tu acceso.</div>
      </div>
      <div ${act('goPayTab')} style="font-size:var(--fs-sm);font-weight:700;color:${urgent ? 'var(--danger)' : 'var(--warn)'};cursor:pointer;white-space:nowrap">Pagar</div>
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
      ${(panes[activeTab] || panes.inicio)()}
      ${devCredit()}
    </div>
    <div class="tabbar tabbar--client">${tabsMarkup(tabs, activeTab, 'selectClientTab')}</div>
  </div>`;
}
