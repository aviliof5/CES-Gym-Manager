/* Bolá — panel de cliente (registro + home con sus tabs).
   Movido 1:1 desde app.js (Fase 3, ver docs/MIGRATION_PLAN.md); home
   rediseñado y ampliado en la Etapa 2 (ver docs/plans,
   "aqui-esta-el-logo") — Rutina/Progreso/Logros/Reservas/Pago/Perfil ahora
   leen datos reales en vez de mock estático. */
'use strict';

import { state } from '../state.js';
import { LEVELS, GOALS, DURATION_LABELS, MESES, DAY_LABELS, WEEKDAY_NAMES, todayWeekday, iconSpan, brandMark, EQUIPMENT_CONCEPTS } from '../data.js';
import {
  esc, act, stepHead, stepBars, errorBanner, textField, emailField,
  phoneField, passwordField, passwordStrength, sectionTitle, tabsMarkup,
  devCredit, initials, daysUntil, formatDate, commentCards, money, statusMeta, avatar, achievementBadge, exercisesForToday,
} from '../helpers.js';

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
    ${stepBars(1, 4, '')}
    <div class="form-body">
      <div class="title">Tus datos personales</div>
      <div class="subtitle" style="margin-bottom:20px">Todos los campos y la foto de rostro son obligatorios</div>
      ${errorBanner()}
      <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:20px">
        <div class="slot slot--circle" style="width:110px;height:110px" ${act('pickPhoto', 'face')}>${photo}</div>
        ${c.photoFile ? `<div class="chip chip--action is-active" style="margin-top:12px;padding:8px 16px;font-size:12px">✓ Foto lista</div>` : ''}
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
      <button class="btn btn--action" ${act('clientSignUp')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Creando cuenta…' : 'Continuar'}</button>
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
        ${c.photoFile ? `<div class="chip chip--action is-active" style="margin-top:12px;padding:8px 16px;font-size:12px">✓ Foto lista</div>` : ''}
      </div>
    </div>
    <div class="form-foot">
      <button class="btn btn--action" ${act('confirmRequiredFacePhoto')} ${(!c.photoFile || state.busy) ? 'disabled' : ''}>${state.busy ? 'Subiendo…' : 'Continuar'}</button>
    </div>
  </div>`;
}

export function viewClientReg2() {
  const p = state.clientPhysicalReg;
  const levels = LEVELS.map(lv =>
    `<div ${act('setLevel', lv.id)} class="chip chip--action${p.level === lv.id ? ' is-active' : ''}">${lv.label}</div>`).join('');
  const goals = GOALS.map(g =>
    `<div ${act('setRegGoal', g.id)} class="chip chip--action${p.goal === g.id ? ' is-active' : ''}">${g.label}</div>`).join('');

  return `<div class="col">
    ${stepHead('Paso 2 de 4 · Condición física', 'goto:clientReg1')}
    ${stepBars(2, 4, '')}
    <div class="form-body">
      <div class="title">Condición física</div>
      <div class="subtitle" style="margin-bottom:22px">Opcional — nos ayuda a recomendarte mejores rutinas</div>
      ${errorBanner()}
      <div style="display:flex;gap:10px;margin-bottom:14px">
        ${textField('clientPhysicalReg.weight', 'Peso (kg)', p.weight, { style: 'flex:1' })}
        ${textField('clientPhysicalReg.height', 'Altura (cm)', p.height, { style: 'flex:1' })}
      </div>
      ${textField('clientPhysicalReg.age', 'Edad', p.age, { style: 'margin-bottom:18px' })}
      <div class="eyebrow" style="margin-bottom:8px">Nivel de experiencia</div>
      <div style="display:flex;gap:8px;margin-bottom:18px">${levels}</div>
      <div class="eyebrow" style="margin-bottom:8px">Meta principal</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${goals}</div>
    </div>
    <div class="form-foot" style="display:flex;gap:10px">
      <button class="btn btn--ghost" style="flex:1" ${act('goClientReg3')}>Omitir</button>
      <button class="btn btn--action" style="flex:2" ${act('savePhysicalAndContinue')}>Continuar</button>
    </div>
  </div>`;
}

export function viewClientReg3() {
  const cards = state.plans.map(p => {
    const sel = state.selectedPlanId === p.id;
    return `<div ${act('selectPlan', p.id)} class="row" style="cursor:pointer;margin-bottom:0;${sel ? 'border-color:var(--action);background:var(--action-dim)' : ''}">
      <div class="row__body">
        <div class="row__title">${esc(p.name)}</div>
        <div class="row__meta">${esc(DURATION_LABELS[p.duration] || p.duration)}</div>
      </div>
      <div style="font-family:var(--font-display);font-size:18px;color:var(--action)">${money(p.price)}</div>
    </div>`;
  }).join('');

  return `<div class="col">
    ${stepHead('Paso 3 de 4 · Elige tu plan', 'goto:clientReg2')}
    ${stepBars(3, 4, '')}
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
      <button class="btn btn--action" ${act('choosePlanAndContinue')} ${!state.selectedPlanId ? 'disabled' : ''}>Continuar</button>
    </div>
  </div>`;
}

export function viewClientReg4() {
  const wants = state.wantsTrainer;
  const invalid = wants === null || (wants === true && !state.selectedTrainerId) || state.busy;
  const cards = state.approvedTrainersForReg.map(t => {
    const sel = state.selectedTrainerId === t.id;
    return `<div ${act('selectTrainer', t.id)} class="row" style="cursor:pointer;margin-bottom:0;${sel ? 'border-color:var(--action);background:var(--action-dim)' : ''}">
      <div class="avatar avatar--sq avatar--action">${esc(initials(t.name))}</div>
      <div class="row__body">
        <div class="row__title">${esc(t.name)}</div>
        <div class="row__meta">${esc(t.specialty)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:13px;font-weight:800;color:var(--action)">${money(t.price)}/mes</div>
        ${sel ? `<div style="width:20px;height:20px;border-radius:50%;background:var(--action);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:900">✓</div>` : ''}
      </div>
    </div>`;
  }).join('');

  return `<div class="col">
    ${stepHead('Paso 4 de 4 · Entrenador', 'goto:clientReg3')}
    ${stepBars(4, 4, '')}
    <div class="form-body">
      <div class="title">¿Quieres un entrenador?</div>
      <div class="subtitle" style="margin-bottom:20px">Un entrenador personal te guía, revisa tu progreso y te arma rutinas a medida</div>
      ${errorBanner()}
      <div class="seg">
        <div ${act('chooseWantTrainer')} class="seg__item${wants === true ? ' is-active' : ''}" style="flex:1;text-align:center">Sí, quiero</div>
        <div ${act('chooseNoTrainer')} class="seg__item${wants === false ? ' is-active' : ''}" style="flex:1;text-align:center">No, por mi cuenta</div>
      </div>
      ${wants === true ? (state.approvedTrainersForReg.length
        ? `<div class="section-title" style="margin:16px 0 12px">Elige tu entrenador</div><div style="display:flex;flex-direction:column;gap:10px">${cards}</div>`
        : `<div class="hint">Aún no hay entrenadores disponibles en este gimnasio.</div>`) : ''}
    </div>
    <div class="form-foot">
      <button class="btn btn--action" ${act('finishClientReg')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Guardando…' : 'Crear cuenta'}</button>
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

// "Entrenamiento de hoy" — prioridad entrenador > personalizada > IA (la
// primera que tenga algo cargado). Si esa rutina es semanal (algún
// ejercicio con día asignado) y hoy no le toca nada, se avisa "día de
// descanso" en vez de mostrar la rutina de otra fuente sin avisar — si el
// entrenador armó una semana con descanso el martes, el martes es
// descanso, no "lo que diga la IA".
function todayWorkoutCard() {
  const trainer = state.myClientTrainer;
  const trainerEx = (state.trainerRoutineForMe && state.trainerRoutineForMe.exercises) || [];
  const personalEx = (state.myPersonalRoutine && state.myPersonalRoutine.exercises) || [];
  const aiEx = (state.aiRoutine && state.aiRoutine.exercises) || [];

  let source, allEx, label;
  if (trainer && trainerEx.length) { source = 'trainer'; allEx = trainerEx; label = `Rutina de ${esc(trainer.name.split(' ')[0])}`; }
  else if (personalEx.length) { source = 'personal'; allEx = personalEx; label = 'Tu rutina'; }
  else { source = 'ia'; allEx = aiEx; label = 'Rutina con IA'; }

  if (!allEx.length) {
    return `<div class="row">
      <div class="row__body">
        <div class="row__title">Sin rutina todavía</div>
        <div class="row__meta">Generá una con IA, armá la tuya, o pedile una a tu entrenador</div>
      </div>
      <div class="row__action" ${act('selectClientTab', 'rutina')}>Ir</div>
    </div>`;
  }

  const todays = exercisesForToday(allEx);
  const isWeekly = allEx.some(e => e.dayOfWeek != null);
  if (isWeekly && !todays.length) {
    return `<div class="row">
      <div class="avatar avatar--sq" style="background:var(--ok-dim);color:var(--ok)">${iconSpan('check', 18)}</div>
      <div class="row__body">
        <div class="row__title">Hoy es día de descanso</div>
        <div class="row__meta">${esc(label)} · ${esc(WEEKDAY_NAMES[todayWeekday()])}</div>
      </div>
      <div class="row__action" ${act('selectClientTab', 'rutina')}>Ver semana</div>
    </div>`;
  }

  return `<div class="row">
    <div class="avatar avatar--sq avatar--action">${iconSpan('dumbbell', 18)}</div>
    <div class="row__body">
      <div class="row__title">${label}</div>
      <div class="row__meta">${todays.length} ${todays.length === 1 ? 'ejercicio' : 'ejercicios'}${isWeekly ? ` · ${esc(WEEKDAY_NAMES[todayWeekday()])}` : ''}</div>
    </div>
    <div class="row__action" ${act('startWorkout', source)}>Comenzar</div>
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
    ${equipmentGrid(state.equipment)}
  </div>`;
}

// Máquinas del gym (pedido: "que le salgan las máquinas con foto luego a
// los clientes") — las que el staff les puso foto (equipmentEditor() en
// screens/owner.js) se muestran como tarjeta con foto real; las que
// todavía no tienen foto siguen como el pill de solo texto de siempre, no
// se inventa una imagen de relleno (mismo criterio del proyecto que las
// fotos de progreso/ejercicios: sin foto real, no hay foto).
function equipmentGrid(equipment) {
  const withPhoto = equipment.filter(e => e.photoUrl);
  const withoutPhoto = equipment.filter(e => !e.photoUrl);
  const cards = withPhoto.map(e => `
    <div>
      <div class="thumb" style="width:100%;height:90px">
        <img src="${esc(e.photoUrl)}" alt="${esc(e.name)}"/>
      </div>
      <div style="font-size:var(--fs-xs);color:var(--text-soft);margin-top:6px;text-align:center">${esc(e.name)}</div>
    </div>`).join('');
  return `
    ${withPhoto.length ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:${withoutPhoto.length ? '12px' : '0'}">${cards}</div>` : ''}
    ${withoutPhoto.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${withoutPhoto.map(e => `<div class="pill">${esc(e.name)}</div>`).join('')}</div>` : ''}`;
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

// Antes era un link de texto chiquito, fácil de pasar por alto — ahora es
// una tarjeta grande con ícono y flecha, mismo tratamiento que un CTA de
// verdad (pedido explícito: "más visible").
const libraryLink = () => `<div ${act('openExerciseLibrary')} class="card" style="display:flex;align-items:center;gap:12px;cursor:pointer;padding:14px 16px;margin-bottom:10px;border-color:var(--brand)">
  <div style="width:42px;height:42px;border-radius:11px;background:var(--brand-dim);display:flex;align-items:center;justify-content:center;color:var(--brand);flex-shrink:0">${iconSpan('dumbbell', 20)}</div>
  <div style="flex:1;min-width:0">
    <div style="font-size:var(--fs-sm);font-weight:800">Biblioteca de ejercicios</div>
    <div style="font-size:var(--fs-xs);color:var(--muted)">Técnica, músculo trabajado y errores comunes</div>
  </div>
  ${iconSpan('chevronRight', 18)}
</div>`;
const programsLink = () => `<div ${act('openProgramTemplates')} style="font-size:var(--fs-sm);color:var(--brand);cursor:pointer;font-weight:600;margin-bottom:12px">${iconSpan('dumbbell', 14)} Ver programas de entrenamiento</div>`;

// Si el entrenador armó la rutina aplicando un programa (ver
// applyProgramTemplate), los ejercicios traen dayLabel — se agrupan con un
// encabezado por día. Las rutinas de siempre (sin dayLabel, con IA o
// armadas ejercicio por ejercicio) se ven exactamente igual que antes.
function groupedExerciseRows(exercises) {
  if (!exercises.some(e => e.dayLabel)) return exercises.map(exerciseRow).join('');
  const days = [];
  for (const ex of exercises) {
    const label = ex.dayLabel || '—';
    let d = days.find(d => d.label === label);
    if (!d) { d = { label, items: [] }; days.push(d); }
    d.items.push(ex);
  }
  return days.map(d => `${sectionTitle(d.label, 'dumbbell', 'margin:14px 0 6px')}${d.items.map(exerciseRow).join('')}`).join('');
}

// Selector de día de la semana (opcional) para "Crear rutina"/"Personalizada"
// — dejarlo en blanco sigue siendo "un solo bloque, sin días" como
// funcionaba antes de que existiera la rutina semanal.
function dayOfWeekSelect(field, value) {
  return `<select class="field" data-f="${field}" style="margin-bottom:10px">
    <option value="">Sin día asignado (un solo bloque)</option>
    ${WEEKDAY_NAMES.map((name, i) => `<option value="${i}"${String(value) === String(i) ? ' selected' : ''}>${esc(name)}</option>`).join('')}
  </select>`;
}

function personalRoutineForm() {
  const d = state.personalRoutineDraft;
  const exerciseOptions = state.exercisesLib.map(e => `<option value="${esc(e.id)}"${d.exerciseId === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('');
  return `<div class="card" style="margin-bottom:16px">
    <select class="field" data-f="personalRoutineDraft.exerciseId" style="margin-bottom:10px">
      <option value="">Elegí un ejercicio de la biblioteca (opcional)</option>
      ${exerciseOptions}
    </select>
    ${textField('personalRoutineDraft.text', 'Nombre del ejercicio *', d.text, { style: 'margin-bottom:10px' })}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      ${textField('personalRoutineDraft.sets', 'Series', d.sets)}
      ${textField('personalRoutineDraft.reps', 'Reps (ej. 8 o 10-8-6)', d.reps)}
      ${textField('personalRoutineDraft.weightKg', 'Peso (kg)', d.weightKg)}
      ${textField('personalRoutineDraft.restSeconds', 'Descanso (seg)', d.restSeconds)}
    </div>
    ${dayOfWeekSelect('personalRoutineDraft.dayOfWeek', d.dayOfWeek)}
    <button class="btn btn--brand" style="width:100%;padding:12px;font-size:13px" ${act('addPersonalRoutineExercise')} ${(!d.text.trim() || state.busy) ? 'disabled' : ''}>${state.busy ? 'Agregando…' : '+ Agregar a mi rutina'}</button>
  </div>`;
}

function personalExerciseRow(ex) {
  const info = [ex.sets ? `${ex.sets} series` : null, ex.reps ? `${esc(String(ex.reps))} reps` : null, ex.weightKg != null ? `${ex.weightKg} kg` : null, ex.restSeconds ? `${ex.restSeconds}s descanso` : null].filter(Boolean).join(' · ');
  return `<div class="row">
    <div class="row__body">
      <div class="row__title">${esc(ex.text)}</div>
      ${info ? `<div class="row__meta">${info}</div>` : ''}
    </div>
    <div class="row__action" style="color:var(--danger)" ${act('removePersonalRoutineExercise', ex.id)}>Quitar</div>
  </div>`;
}

function groupedPersonalRows(exercises) {
  if (!exercises.some(e => e.dayLabel)) return exercises.map(personalExerciseRow).join('');
  const days = [];
  for (const ex of exercises) {
    const label = ex.dayLabel || '—';
    let d = days.find(d => d.label === label);
    if (!d) { d = { label, items: [] }; days.push(d); }
    d.items.push(ex);
  }
  return days.map(d => `${sectionTitle(d.label, 'dumbbell', 'margin:14px 0 6px')}${d.items.map(personalExerciseRow).join('')}`).join('');
}

export function viewClientRutina() {
  const trainer = state.myClientTrainer;
  const source = (state.routineSource === 'trainer' && !trainer) ? 'ia' : state.routineSource;

  const toggle = `<div class="seg">
      <div ${act('setRoutineSource', 'ia')} class="seg__item${source === 'ia' ? ' is-active' : ''}">Con IA</div>
      ${trainer ? `<div ${act('setRoutineSource', 'trainer')} class="seg__item${source === 'trainer' ? ' is-active' : ''}">De ${esc(trainer.name.split(' ')[0])}</div>` : ''}
      <div ${act('setRoutineSource', 'personal')} class="seg__item${source === 'personal' ? ' is-active' : ''}">Personalizada</div>
    </div>`;

  if (source === 'personal') {
    const routine = state.myPersonalRoutine;
    const exercises = (routine && routine.exercises) || [];
    const todays = exercisesForToday(exercises);
    const isWeekly = exercises.some(e => e.dayOfWeek != null);
    return `<div class="pane">
      ${errorBanner()}
      ${sectionTitle('Tu rutina personalizada', 'dumbbell', 'margin-bottom:4px')}
      <div class="hint">La armás vos — asignale un día a cada ejercicio para que quede semanal</div>
      ${toggle}
      ${libraryLink()}
      ${programsLink()}
      ${personalRoutineForm()}
      ${exercises.length
        ? `<button class="btn btn--action" style="padding:14px;font-size:14px;margin-bottom:16px;width:100%" ${act('startWorkout', 'personal')} ${!todays.length && isWeekly ? 'disabled' : ''}>${isWeekly ? `Comenzar (${esc(WEEKDAY_NAMES[todayWeekday()])}${todays.length ? '' : ' · descanso'})` : 'Comenzar entrenamiento'}</button>
           ${groupedPersonalRows(exercises)}`
        : `<div class="empty"><div class="empty__title">Sin ejercicios todavía</div>Agregá el primero arriba</div>`}
    </div>`;
  }

  if (source === 'trainer') {
    const routine = state.trainerRoutineForMe;
    const exercises = (routine && routine.exercises) || [];
    return `<div class="pane">
      ${errorBanner()}
      ${sectionTitle('Rutina de tu entrenador', 'dumbbell', 'margin-bottom:4px')}
      <div class="hint">Creada y actualizada por ${esc(trainer.name)}</div>
      ${toggle}
      ${libraryLink()}
      ${programsLink()}
      ${exercises.length
        ? `<button class="btn btn--action" style="padding:14px;font-size:14px;margin:12px 0 16px;width:100%" ${act('startWorkout', 'trainer')}>Comenzar entrenamiento</button>
           ${groupedExerciseRows(exercises)}`
        : `<div class="empty"><div class="empty__title">Sin rutina</div>Tu entrenador aún no ha creado tu rutina.<br/>Mientras tanto, probá la rutina con IA.</div>`}
      ${trainerCandidatesSection()}
    </div>`;
  }

  const goalLabel = (GOALS.find(g => g.id === state.aiGoal) || {}).label || '';
  const exercises = (state.aiRoutine && state.aiRoutine.exercises) || [];
  const hasEval = !!state.myTrainingProfile;
  const isWeekly = exercises.some(e => e.dayOfWeek != null);
  const todays = exercisesForToday(exercises);

  return `<div class="pane">
    ${errorBanner()}
    ${sectionTitle('Rutina con IA', 'zap', 'margin-bottom:4px')}
    ${libraryLink()}
    <div class="hint">Respondé una evaluación corta y armamos tu rutina con lo que tiene tu gimnasio.${hasEval ? ' Ya la hiciste — podés volver a generar o ajustarla.' : ''}</div>
    ${toggle}
    <button class="btn btn--brand" style="padding:14px;font-size:14px;margin:14px 0 16px;width:100%" ${act('openEvaluation')}>${hasEval ? 'Generar / ajustar mi rutina' : 'Generar rutina con IA'}</button>
    ${exercises.length ? `<button class="btn btn--action" style="padding:14px;font-size:14px;margin-bottom:16px;width:100%" ${act('startWorkout', 'ia')} ${isWeekly && !todays.length ? 'disabled' : ''}>${isWeekly ? `Comenzar (${esc(WEEKDAY_NAMES[todayWeekday()])}${todays.length ? '' : ' · descanso'})` : 'Comenzar entrenamiento'}</button>
    ${enginePlanCard()}
    <div class="eyebrow" style="margin-bottom:8px">Rutina recomendada · ${esc(goalLabel)}</div>
    ${groupedExerciseRows(exercises)}
    <div style="font-size:var(--fs-xs);color:var(--muted);margin-top:10px">Basado en el equipo disponible de ${esc(state.gym.name)}</div>` : ''}
    ${trainerCandidatesSection()}
  </div>`;
}

// Motor de entrenamiento (Fases 7-8) — tarjeta con la "estructura" de la
// rutina: split, calentamiento, RIR objetivo, y (honestidad, pedido §36)
// qué ejercicios quedaron afuera porque el gimnasio no tiene el equipo.
// enterClientHome() la reconstruye del perfil guardado, así sigue después
// de recargar la app (state.enginePlan). Null → la rutina se ve igual, como
// lista por día, sin esta tarjeta.
function enginePlanCard() {
  const p = state.enginePlan;
  if (!p) return '';
  const warm = (p.warmup || []).map(w => `<li>${esc(w)}</li>`).join('');

  // ¿La rutina tiene ejercicios marcados con precaución? (aiRoutine.text
  // los trae con "⚠" — ver generator.js). Si sí, mostramos el aviso.
  const routineText = ((state.aiRoutine && state.aiRoutine.exercises) || []).map(e => e.text || '').join(' ');
  const hasCaution = routineText.includes('⚠');

  // "Qué no pudimos incluir" — solo los descartados por falta de equipo
  // (los demás motivos —el cliente los excluyó, patrón de boxeo…— no son
  // una carencia del gimnasio y no aportan nada mostrarlos).
  const eqMissing = (p.rejected || []).filter(r => /falta equipo/.test(r.reason || ''));
  const conceptLabel = t => (EQUIPMENT_CONCEPTS.find(c => c.id === t) || {}).label || t;
  const missingConcepts = [...new Set(eqMissing.flatMap(r => (r.reason.split(':')[1] || '').split(',').map(s => s.trim()).filter(Boolean)))]
    .map(conceptLabel);

  return `<div class="card" style="margin-bottom:16px;border-color:var(--brand)">
    <div class="eyebrow" style="color:var(--brand)">Cómo está armada</div>
    <div style="font-size:var(--fs-sm);font-weight:700;margin:2px 0 6px">${esc(p.splitName)} · ${p.days} días · ${p.exercisesPerSession} ejercicios por sesión</div>
    <div style="font-size:var(--fs-xs);color:var(--muted);line-height:1.6">
      Compuestos ${esc(p.repsCompound)} reps · aislados ${esc(p.repsIsolation)} reps · dejá <strong>RIR ${esc(p.rirTarget)}</strong> (repeticiones en reserva) en cada serie · descanso ${p.restCompound}s / ${p.restIsolation}s.
    </div>
    ${warm ? `<div class="eyebrow" style="margin-top:10px">Calentamiento (antes de cada sesión)</div>
      <ul style="margin:4px 0 0;padding-left:18px;font-size:var(--fs-xs);color:var(--muted);line-height:1.6">${warm}</ul>` : ''}
    ${hasCaution ? `<div style="margin-top:10px;padding:8px 10px;background:var(--warn-dim);border-radius:8px;font-size:var(--fs-xs);color:var(--text);line-height:1.6">
      <strong>⚠</strong> Marcamos así los ejercicios que cargan una articulación donde dijiste tener molestia. No es un diagnóstico: empezá con poco peso y rango corto; si duele (no la molestia normal del esfuerzo), cambialo por otro o consultá con un profesional de la salud.
    </div>` : ''}
    ${missingConcepts.length ? `<div style="font-size:var(--fs-xs);color:var(--muted);margin-top:10px;line-height:1.6">
      Tu gimnasio no tiene <strong>${esc(missingConcepts.join(', '))}</strong>, así que quedaron afuera ${eqMissing.length} ${eqMissing.length === 1 ? 'ejercicio' : 'ejercicios'} que los necesitan. La rutina se armó solo con lo que hay.
    </div>` : ''}
    ${p.safetyNote ? `<div style="font-size:var(--fs-xs);color:var(--muted);margin-top:10px;font-style:italic">${esc(p.safetyNote)}</div>` : ''}
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
    // Fase 10 — qué ajustó el motor en la rutina con lo que se acaba de entrenar.
    const adapt = (w.adaptSummary || []);
    const adaptBlock = adapt.length ? `<div style="margin-top:22px;width:100%;max-width:340px;text-align:left;padding:12px 14px;border-radius:12px;background:var(--ok-dim);border:1px solid rgba(var(--ok-rgb,74,163,110),.25)">
      <div style="font-size:var(--fs-xs);font-weight:800;color:var(--ok);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Ajustamos tu rutina para la próxima</div>
      <ul style="margin:0;padding-left:16px;font-size:var(--fs-xs);color:var(--text);line-height:1.7">${adapt.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
    </div>` : '';
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px 28px">
      <div style="width:64px;height:64px;border-radius:50%;background:var(--ok-dim);display:flex;align-items:center;justify-content:center;color:var(--ok);margin-bottom:20px">${iconSpan('check', 28)}</div>
      <div class="title" style="margin-bottom:0">Entrenamiento completado</div>
      <div style="font-size:13px;color:var(--muted);margin-top:8px;line-height:1.6">${w.exercises.length} ${w.exercises.length === 1 ? 'ejercicio' : 'ejercicios'} · ${totalSets} ${totalSets === 1 ? 'serie marcada' : 'series marcadas'}</div>
      ${adaptBlock}
      <button class="btn btn--action" style="margin-top:28px" ${act('exitWorkout')}>Volver</button>
    </div>`;
  }

  const ex = w.exercises[w.index] || {};
  const doneForThis = w.doneSets[w.index];
  const isLast = w.index + 1 >= w.exercises.length;
  const hasSets = Number(ex.sets) > 0;

  // Un campo de peso/reps por EJERCICIO (no por serie) — se precarga con el
  // último valor conocido o la sugerencia de progresión (ver
  // ACTIONS.startWorkout/nextExercise/prevExercise) y se puede ajustar antes
  // de marcar cada serie: así queda lo que de verdad se levantó (exercise_logs).
  const inputsRow = `<div style="display:flex;gap:10px;margin-bottom:12px">
    ${textField('workout.weightInput', 'Peso (kg)', w.weightInput, { style: 'flex:1' })}
    ${textField('workout.repsInput', 'Reps hechas', w.repsInput, { style: 'flex:1' })}
  </div>`;

  // RIR (reps en reserva) de la serie — Fase 9. Opcional; alimenta el
  // análisis de progresión de la próxima vez (exercise_logs.rir).
  const rirRow = `<div style="margin-bottom:16px">
    <div style="font-size:var(--fs-xs);color:var(--muted);margin-bottom:6px">¿Cuántas reps te quedaban? <span style="opacity:.75">(RIR — opcional)</span></div>
    <div style="display:flex;gap:6px">
      ${['0', '1', '2', '3', '4'].map(v => {
        const on = String(w.rirInput) === v;
        return `<div ${act('setWorkoutRir', v)} style="flex:1;text-align:center;padding:9px 0;border-radius:9px;cursor:pointer;font-size:13px;font-weight:700;border:1px solid ${on ? 'transparent' : 'var(--line-strong)'};background:${on ? 'var(--brand)' : 'transparent'};color:${on ? '#fff' : 'var(--muted)'}">${v === '4' ? '4+' : v}</div>`;
      }).join('')}
    </div>
  </div>`;

  // Sugerencia de progresión para ESTE ejercicio (ver progression.js).
  const prog = ex.prog;
  const progColor = prog && prog.action === 'subir' ? 'var(--ok)' : prog && prog.action === 'bajar' ? 'var(--warn)' : 'var(--brand)';
  const progRow = prog && prog.note ? `<div style="margin-bottom:16px;padding:9px 11px;border-radius:9px;background:var(--surface-2,rgba(127,127,127,.08));border-left:3px solid ${progColor};font-size:var(--fs-xs);color:var(--text);line-height:1.6">
    ${prog.action === 'subir' ? '↑ ' : prog.action === 'bajar' ? '↓ ' : ''}${esc(prog.note)}
  </div>` : '';

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
      ${progRow}
      ${restBlock}
      ${inputsRow}
      ${rirRow}
      ${setsBlock}
    </div>
    <div class="form-foot" style="display:flex;gap:10px">
      ${w.index > 0 ? `<button class="btn btn--ghost" style="flex:1" ${act('prevExercise')}>Anterior</button>` : ''}
      <button class="btn btn--action" style="flex:2" ${act('nextExercise')}>${isLast ? 'Finalizar' : 'Siguiente'}</button>
    </div>
  </div>`;
}

// Reutilizada acá y en viewClientEditProfile (Perfil, "editar... peso,
// medidas") — mismo measurementDraft/saveMeasurement de siempre, un solo
// lugar con el markup del formulario para no repetirlo dos veces.
function measurementForm() {
  const d = state.measurementDraft;
  return `<div class="card" style="margin-bottom:16px">
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
    ${measurementForm()}
    ${sectionTitle('Récords personales', 'crown', 'margin-bottom:8px')}
    ${prRows}
    ${sectionTitle('Fotos de progreso', 'camera', 'margin:20px 0 8px')}
    <button class="btn btn--brand" style="padding:13px;font-size:13.5px;margin-bottom:16px;width:100%" ${act('addProgress')}>+ Agregar foto de hoy</button>
    ${state.progressList.length
      ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${photoCards}</div>`
      : `<div class="empty"><div class="empty__title">Sin fotos</div>Agregá la primera para empezar tu seguimiento</div>`}
  </div>`;
}

// 1003 logros (constancia, fuerza/cardio por ejercicio, medidas, clases —
// ver supabase/migrations/20260909000000_achievements_library.sql) no
// entran en una sola grilla: se filtran por categoría, y fuerza/cardio
// (810+90 de los 1003, uno por ejercicio × nivel) primero muestran un
// directorio de ejercicios en vez de tirar cientos de tarjetas juntas.
const LOGROS_CATS = [
  ['constancia', 'Constancia', 'flame'],
  ['fuerza', 'Fuerza', 'dumbbell'],
  ['cardio', 'Cardio', 'run'],
  ['medidas', 'Medidas', 'ruler'],
  ['clases', 'Clases', 'calendar'],
];

function medalCard(a, mine) {
  const earned = !!mine.earned_at;
  const pct = Math.max(0, Math.min(100, Math.round((mine.progress / a.target) * 100)));
  return `<div class="medal rise${earned ? ' is-earned' : ''}">
    <div class="medal__disc" style="background:none;padding:0">${achievementBadge(a.icon, a.category, a.tier, earned, 52)}</div>
    <div class="medal__name">${esc(a.name)}</div>
    <div class="medal__hint">${earned ? 'Conseguido' : `${mine.progress}/${a.target}`}</div>
    ${!earned ? `<div class="progress" style="margin-top:6px"><div class="progress__fill" style="width:${pct}%"></div></div>` : ''}
  </div>`;
}

export function viewClientLogros() {
  const catalog = state.achievementsCatalog;
  const mineById = new Map(state.myAchievements.map(m => [m.achievement_id, m]));
  const mineFor = a => mineById.get(a.id) || { progress: 0, earned_at: null };
  const totalEarned = catalog.filter(a => mineFor(a).earned_at).length;

  const cat = state.logrosCategoryFilter || 'constancia';
  const inCat = catalog.filter(a => a.category === cat);
  const catTabs = `<div class="seg" style="margin-bottom:14px">${LOGROS_CATS.map(([id, label]) =>
    `<div ${act('setLogrosCategory', id)} class="seg__item${cat === id ? ' is-active' : ''}">${esc(label)}</div>`).join('')}</div>`;

  const groupable = cat === 'fuerza' || cat === 'cardio';
  const exFilter = state.logrosExerciseFilter;

  if (groupable && !exFilter) {
    // Directorio de ejercicios de esta categoría (peso o veces hechas,
    // según el ejercicio — ver classify() en la migración) + los logros
    // generales de la categoría (récords, volumen, variedad) arriba.
    const general = inCat.filter(a => !a.exerciseName);
    const byExercise = new Map();
    inCat.filter(a => a.exerciseName).forEach(a => {
      if (!byExercise.has(a.exerciseName)) byExercise.set(a.exerciseName, []);
      byExercise.get(a.exerciseName).push(a);
    });
    const exRows = [...byExercise.entries()].map(([name, items]) => {
      const earned = items.filter(a => mineFor(a).earned_at).length;
      return `<div class="row" style="cursor:pointer" ${act('setLogrosExercise', name)}>
        <div class="row__body"><div class="row__title">${esc(name)}</div><div class="row__meta">${earned}/${items.length} conseguidos</div></div>
        <div class="row__action">${iconSpan('chevronRight', 16)}</div>
      </div>`;
    }).join('');

    return `<div class="pane">
      ${sectionTitle('Logros', 'crown', 'margin-bottom:2px')}
      <div class="hint" style="margin-bottom:14px">${totalEarned}/${catalog.length} conseguidos en total</div>
      ${catTabs}
      ${general.length ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px 10px;margin-bottom:20px">${general.map(a => medalCard(a, mineFor(a))).join('')}</div>` : ''}
      <div class="eyebrow" style="margin-bottom:8px">Por ejercicio</div>
      ${exRows}
    </div>`;
  }

  const items = groupable ? inCat.filter(a => a.exerciseName === exFilter) : inCat;
  const backRow = groupable
    ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div class="back" ${act('setLogrosExercise', '')}>&lsaquo;</div>
        <div style="font-size:15px;font-weight:800">${esc(exFilter)}</div>
      </div>`
    : '';

  return `<div class="pane">
    ${groupable ? backRow : `${sectionTitle('Logros', 'crown', 'margin-bottom:2px')}
      <div class="hint" style="margin-bottom:14px">${totalEarned}/${catalog.length} conseguidos en total</div>
      ${catTabs}`}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px 10px">${items.map(a => medalCard(a, mineFor(a))).join('')}</div>
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
  const client = state.myClient;
  const plan = state.myClientPlan || { name: '—', price: 0, duration: 'mensual' };
  const trainer = state.myClientTrainer;
  const total = plan.price + (trainer ? trainer.price : 0);
  const pending = state.pendingPayment;
  let body = '';

  if (!pending && client.status === 'al_dia') {
    // Ya pagó y no hay ningún cobro esperando confirmación — antes esto
    // caía en la misma rama que "nunca pagó" ("aún no hay un cobro
    // generado"), que sonaba a que le faltaba pagar aunque ya estuviera al
    // día. Acá se le muestra hasta cuándo queda vigente su plan.
    body = `<div class="card" style="width:100%;border-radius:16px;padding:24px;margin-top:20px">
      <div style="width:44px;height:44px;border-radius:50%;background:var(--ok-dim);display:flex;align-items:center;justify-content:center;color:var(--ok);margin:0 auto 12px">${iconSpan('check', 22)}</div>
      <div class="eyebrow">Estás al día</div>
      <div style="font-family:var(--font-display);font-size:22px;margin-top:6px">${esc(plan.name)}</div>
      <div style="font-size:var(--fs-sm);color:var(--muted);margin-top:10px">Tu plan queda vigente hasta el ${formatDate(client.membershipExpiresAt)}.</div>
    </div>`;
  } else if (!pending) {
    body = `<div class="card" style="width:100%;border-radius:16px;padding:24px;margin-top:20px">
      <div class="eyebrow">Próximo pago</div>
      <div style="font-family:var(--font-display);font-size:28px;margin-top:6px">${money(total)}</div>
      ${trainer ? `<div style="font-size:var(--fs-xs);color:var(--muted);margin-top:6px">Incluye plan (${money(plan.price)}) + entrenador (${money(trainer.price)})</div>` : ''}
      <div style="font-size:var(--fs-sm);color:var(--muted);margin-top:10px">Aún no hay un cobro generado. Pide al administrador que genere tu código QR para pagar.</div>
    </div>`;
  } else {
    // El QR ya no lo dibuja el cliente — lo genera y muestra el mostrador
    // (dueño/admin, ver viewOwnerSocios). Acá solo hay un botón para abrir
    // la cámara y escanear ESE código, que confirma el pago al instante
    // (ver ACTIONS.handlePaymentScan) — sin esperar a que el staff lo haga
    // a mano, aunque esa opción se mantiene abajo por si no hay cámara.
    body = `<div style="margin-top:20px;font-size:var(--fs-md);font-weight:700">Paga ${money(pending.amount)} en efectivo en el mostrador</div>
      <div style="font-size:var(--fs-sm);color:var(--muted);margin-top:10px;max-width:280px">Pedile al mostrador que te muestre su código y escaneálo para confirmar tu pago al instante</div>
      <button class="btn btn--action" ${act('goToScanPayment')} style="margin-top:20px;padding:14px 28px;display:inline-flex;align-items:center;gap:8px;font-size:14px">${iconSpan('camera', 16)} Escanear QR para confirmar</button>
      <div style="font-size:var(--fs-sm);color:var(--warn);margin-top:18px;font-weight:700">Esperando confirmación del gimnasio…</div>
      <div ${act('refreshPendingPayment')} style="font-size:var(--fs-sm);color:var(--muted);margin-top:14px;cursor:pointer;text-decoration:underline">¿Ya te confirmaron? Actualizar</div>`;
  }

  return `<div class="pane" style="display:flex;flex-direction:column;align-items:center;text-align:center">${errorBanner()}${body}</div>`;
}

// Pantalla de escaneo del QR de cobro (mismo mecanismo que viewScanCheckin
// en owner.js, ver src/qr.js) pero del lado del cliente: apunta la cámara
// al código que le muestra el mostrador y ACTIONS.handlePaymentScan
// confirma el pago apenas lo lee — sin esperar al staff.
export function viewClientScanPayment() {
  const status = state.scanStatus;
  return `<div class="pane">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div class="back" ${act('exitScanPayment')}>&lsaquo;</div>
      <div style="font-size:15px;font-weight:800">Escanear QR de pago</div>
    </div>
    ${state.scanError
      ? `<div class="card" style="text-align:center;padding:28px 20px">
          <div style="color:var(--danger);font-size:13px;font-weight:700;margin-bottom:6px">No pudimos abrir la cámara</div>
          <div style="font-size:12px;color:var(--muted);line-height:1.5">${esc(state.scanError)}</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:14px;line-height:1.5">Mientras tanto, esperá a que el mostrador confirme tu pago desde su panel.</div>
          <div style="display:flex;gap:18px;justify-content:center;margin-top:12px">
            <div ${act('goToScanPayment')} style="font-size:12px;color:var(--ok);cursor:pointer;font-weight:700">Reintentar</div>
            <div ${act('exitScanPayment')} style="font-size:12px;color:var(--info);cursor:pointer;font-weight:700">Volver a Pago</div>
          </div>
        </div>`
      : `<div style="position:relative;border-radius:16px;overflow:hidden;background:#000;aspect-ratio:1/1">
          <video id="qrScanVideo" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;display:block"></video>
          <div style="position:absolute;inset:16%;border:2px solid rgba(255,255,255,0.55);border-radius:16px;pointer-events:none"></div>
        </div>
        ${status ? `<div class="card" style="margin-top:14px;text-align:center;border-color:${status.ok ? 'var(--ok)' : 'var(--danger)'}">
            <div style="font-size:13px;font-weight:700;color:${status.ok ? 'var(--ok)' : 'var(--danger)'}">${esc(status.text)}</div>
            ${status.ok ? `<div ${act('exitScanPayment')} style="font-size:12px;color:var(--info);cursor:pointer;font-weight:700;margin-top:10px;text-decoration:underline">Volver a Pago</div>` : ''}
          </div>` : `<div style="font-size:11.5px;color:var(--muted);text-align:center;margin-top:14px">Apuntá la cámara al código que te muestra el mostrador</div>`}`}
  </div>`;
}

// "Perfil" (pantalla nueva del plan) — datos propios + membresía, la
// calificación al propio entrenador asignado (trainer_reviews, distinto de
// `reviews` que son del gimnasio) y las reseñas del gimnasio (antes su
// propia tab "Reseñas", ahora una sección acá).
export function viewClientEditProfile() {
  const d = state.editProfileDraft;
  const client = state.myClient;
  const photo = d.photoPreviewUrl
    ? `<img src="${esc(d.photoPreviewUrl)}" alt="Foto de rostro"/>`
    : (client.faceUrl ? `<img src="${esc(client.faceUrl)}" alt="Foto de rostro"/>` : initials(client.name));
  const levels = LEVELS.map(lv =>
    `<div ${act('setEditLevel', lv.id)} class="chip chip--action${d.level === lv.id ? ' is-active' : ''}">${lv.label}</div>`).join('');
  const goals = GOALS.map(g =>
    `<div ${act('setEditGoal', g.id)} class="chip chip--action${d.goal === g.id ? ' is-active' : ''}">${g.label}</div>`).join('');
  const planCards = state.plans.map(p => {
    const sel = state.editProfileSelectedPlanId === p.id;
    return `<div ${act('selectEditPlan', p.id)} class="row" style="cursor:pointer;margin-bottom:0;${sel ? 'border-color:var(--action);background:var(--action-dim)' : ''}">
      <div class="row__body">
        <div class="row__title">${esc(p.name)}</div>
        <div class="row__meta">${esc(DURATION_LABELS[p.duration] || p.duration)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-family:var(--font-display);font-size:16px;color:var(--action)">${money(p.price)}</div>
        ${sel ? `<div style="width:20px;height:20px;border-radius:50%;background:var(--action);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:900">✓</div>` : ''}
      </div>
    </div>`;
  }).join('');

  return `<div class="col">
    <div class="step-head" style="justify-content:space-between">
      <div class="back" ${act('closeEditProfile')}>&lsaquo;</div>
      <div class="step-label">Editar perfil</div>
      <div style="width:32px"></div>
    </div>
    <div class="form-body">
      ${errorBanner()}
      <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:20px">
        <div class="slot slot--circle" style="width:110px;height:110px" ${act('pickPhoto', 'editface')}>${photo}</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:8px;text-align:center">Tocá para cambiar tu foto de rostro</div>
      </div>
      ${sectionTitle('Datos físicos', 'bars', 'margin-bottom:10px')}
      <div style="display:flex;gap:10px;margin-bottom:14px">
        ${textField('editProfileDraft.weight', 'Peso (kg)', d.weight, { style: 'flex:1' })}
        ${textField('editProfileDraft.height', 'Altura (cm)', d.height, { style: 'flex:1' })}
      </div>
      ${textField('editProfileDraft.age', 'Edad', d.age, { style: 'margin-bottom:18px' })}
      <div class="eyebrow" style="margin-bottom:8px">Nivel de experiencia</div>
      <div style="display:flex;gap:8px;margin-bottom:18px">${levels}</div>
      <div class="eyebrow" style="margin-bottom:8px">Meta principal</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:22px">${goals}</div>
      ${sectionTitle('Medidas', 'ruler', 'margin-bottom:10px')}
      ${measurementForm()}
      ${sectionTitle('Tu plan', 'crown', 'margin-bottom:12px')}
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:8px">${planCards}</div>
    </div>
    <div class="form-foot">
      <button class="btn btn--action" ${act('saveEditProfile')} ${state.busy ? 'disabled' : ''}>${state.busy ? 'Guardando…' : 'Guardar cambios'}</button>
    </div>
  </div>`;
}

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
  const achievementsEarned = state.myAchievements.filter(a => a.earned_at).length;
  const earnedIds = new Set(state.myAchievements.filter(a => a.earned_at).map(a => a.achievement_id));
  const earnedMedals = state.achievementsCatalog.filter(a => earnedIds.has(a.id)).slice(0, 5);

  return `<div class="pane">
    ${errorBanner()}
    <div class="row">
      ${avatar(client.name, client.faceUrl, 'avatar--sq avatar--brand', 'width:48px;height:48px;font-size:16px')}
      <div class="row__body">
        <div class="row__title">${esc(client.name)}</div>
        <div class="row__meta">${esc(client.email)} · ${esc(client.phone)}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <span class="${meta.cls}">${meta.label}</span>
        <div ${act('openEditProfile')} style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--info);cursor:pointer;font-weight:700;white-space:nowrap">${iconSpan('settings', 13)} Editar perfil</div>
      </div>
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
    ${sectionTitle('Tu rutina', 'dumbbell', 'margin-bottom:8px')}
    <div style="margin-bottom:16px">${todayWorkoutCard()}</div>
    ${sectionTitle('Logros', 'crown', 'margin-bottom:8px')}
    <div class="stat rise" ${act('selectClientTab', 'logros')} style="cursor:pointer;margin-bottom:${earnedMedals.length ? '10px' : '16px'}">
      <div class="stat__label">Medallas conseguidas</div>
      <div class="stat__value">${achievementsEarned}<span style="font-size:16px;color:var(--muted)">/${state.achievementsCatalog.length}</span></div>
    </div>
    ${earnedMedals.length ? `<div style="display:flex;gap:10px;margin-bottom:16px">${earnedMedals.map(a => achievementBadge(a.icon, a.category, a.tier, true, 44)).join('')}</div>` : ''}
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

// (La vieja tab "Plataforma" — Fase 16, is_platform_admin sobre cualquier
// rol — se movió a su propio panel dedicado, ver src/screens/platform.js.)
const CLIENT_BASE_TABS = [
  ['inicio', 'Inicio', 'home'],
  ['rutina', 'Rutina', 'dumbbell'],
  ['progreso', 'Progreso', 'bars'],
  ['logros', 'Logros', 'crown'],
  ['reservas', 'Reservas', 'calendar'],
  ['pago', 'Pago', 'card'],
  ['perfil', 'Perfil', 'idcard'],
];

// Campanita de notificaciones (dueño/admin crea un evento -> le llega a
// todos los socios, ver notify_gym_clients()) — punto Edición en el header
// de Inicio, con el conteo de no leídas.
function bellIcon() {
  const unread = state.notifications.filter(n => !n.readAt).length;
  return `<div ${act('openNotifications')} style="position:relative;cursor:pointer;color:var(--text)">
    ${iconSpan('bell', 18)}
    ${unread ? `<span style="position:absolute;top:-5px;right:-7px;background:var(--action);color:#fff;font-size:9px;font-weight:800;min-width:15px;height:15px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px;line-height:1">${unread > 9 ? '9+' : unread}</span>` : ''}
  </div>`;
}

function formatNotifWhen(iso) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MESES[d.getMonth()]} · ${hh}:${mm}`;
}

export function viewClientNotifications() {
  const list = state.notifications;
  const rows = list.length ? list.map(n => `<div class="row" style="cursor:pointer;align-items:flex-start" ${act('markNotificationRead', n.id)}>
      ${!n.readAt ? `<div style="width:8px;height:8px;border-radius:50%;background:var(--action);margin-top:7px;flex-shrink:0"></div>` : `<div style="width:8px;flex-shrink:0"></div>`}
      <div class="row__body">
        <div class="row__title" style="font-weight:${n.readAt ? '600' : '800'}">${esc(n.title)}</div>
        ${n.body ? `<div class="row__meta">${esc(n.body)}</div>` : ''}
        <div style="font-size:var(--fs-xs);color:var(--muted);margin-top:2px">${formatNotifWhen(n.createdAt)}</div>
      </div>
    </div>`).join('') : `<div class="empty"><div class="empty__title">Sin notificaciones</div>Acá te van a avisar cuando el gimnasio cree un evento nuevo</div>`;

  return `<div class="col">
    <div class="step-head" style="justify-content:space-between">
      <div class="back" ${act('closeNotifications')}>&lsaquo;</div>
      <div class="step-label">Notificaciones</div>
      <div style="width:32px"></div>
    </div>
    <div class="form-body">${rows}</div>
  </div>`;
}

export function viewClientHome() {
  const client = state.myClient;
  const panes = {
    inicio: viewClientInicio,
    rutina: viewClientRutina,
    progreso: viewClientProgreso,
    logros: viewClientLogros,
    reservas: viewClientReservas,
    pago: viewClientPago,
    perfil: viewClientPerfil,
  };
  // Cliente sin pago al día (vencido, o "pendiente" = todavía no hizo su
  // primer pago) solo puede usar "Pago" hasta ponerse al día — antes esto
  // era nada más un badge visual en Socios, nada se lo impedía usar acá
  // adentro (ver conversación 2026-09-07, "como se lleva el control para
  // que no entren sin pagar"). El check-in físico en el gimnasio lo sigue
  // autorizando el staff a mano (eso es un tema aparte, de mostrador); esto
  // es el candado del lado de la app. "suspendido" queda afuera a propósito
  // — es una decisión manual del staff, no de plata: pagar no lo resuelve,
  // lo tiene que reactivar el gimnasio.
  const locked = client.status === 'vencido' || client.status === 'pendiente';
  const activeTab = locked ? 'pago' : state.clientTab;
  // Los demás tabs se quedan clickeables (evita una tabbar que parece rota)
  // pero cualquiera de ellos vuelve a caer en Pago (activeTab de arriba) —
  // el candado con el 🔒 en la etiqueta avisa por qué antes de tocarlo.
  const tabs = locked ? CLIENT_BASE_TABS.map(([id, label, ic]) => id === 'pago' ? [id, label, ic] : [id, `🔒 ${label}`, ic]) : CLIENT_BASE_TABS;

  const days = daysUntil(client.membershipExpiresAt);
  const urgent = days !== null && days <= 1;
  const plan = state.myClientPlan || { name: '—', price: 0, duration: 'mensual' };
  // Los planes "diario" se pagan y vencen el mismo día — un aviso de "te
  // quedan 5 días" no aplica ahí (ver migración payment_qr_flip.sql, mismo
  // motivo por el que confirm_cash_payment() ya no suma +30 días fijos).
  const expiryAlert = (!locked && days !== null && days <= 5 && plan.duration !== 'diario') ? `<div class="alert${urgent ? '' : ' alert--warn'}" style="margin:0 22px 12px">
      <div style="width:30px;height:30px;border-radius:8px;background:${urgent ? 'var(--danger-dim)' : 'var(--warn-dim)'};display:flex;align-items:center;justify-content:center;color:${urgent ? 'var(--danger)' : 'var(--warn)'};flex-shrink:0">${iconSpan('clock', 16)}</div>
      <div style="flex:1">
        <div style="font-size:var(--fs-sm);font-weight:800;color:${urgent ? 'var(--danger)' : 'var(--warn)'}">${days <= 0 ? '¡Tu plan vence hoy!' : days === 1 ? '¡Tu plan vence mañana!' : 'Tu plan vence en ' + days + ' días'}</div>
        <div class="alert__text">Renová ${esc(plan.name)} (${money(plan.price)}) para no perder tu acceso.</div>
      </div>
      <div ${act('goPayTab')} style="font-size:var(--fs-sm);font-weight:700;color:${urgent ? 'var(--danger)' : 'var(--warn)'};cursor:pointer;white-space:nowrap">Pagar</div>
    </div>` : '';
  const lockBanner = locked ? `<div class="alert" style="margin:0 22px 12px">
      <div style="width:30px;height:30px;border-radius:8px;background:var(--danger-dim);display:flex;align-items:center;justify-content:center;color:var(--danger);flex-shrink:0">${iconSpan('lock', 16)}</div>
      <div style="flex:1">
        <div style="font-size:var(--fs-sm);font-weight:800;color:var(--danger)">App bloqueada</div>
        <div class="alert__text">${client.status === 'pendiente' ? 'Todavía no registramos ningún pago tuyo.' : 'Tu membresía está vencida.'} Pagá el servicio para restablecer el uso completo de la app.</div>
      </div>
    </div>` : '';
  const alert = lockBanner || expiryAlert;

  return `<div class="dash-shell">
    <div class="dash-main">
      <div class="app-head">
        <div style="display:flex;align-items:center;gap:10px">
          ${brandMark('sm')}
          <div>
            <div class="app-title">Hola, ${esc((client.name || 'Cliente').split(' ')[0])}</div>
            <div class="app-sub">${esc(state.gym.name)}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:14px">
          ${bellIcon()}
          <div ${act('signOut')} class="link-muted">Salir</div>
        </div>
      </div>
      ${alert}
      ${(panes[activeTab] || panes.inicio)()}
      ${devCredit()}
    </div>
    <div class="tabbar tabbar--client">${tabsMarkup(tabs, activeTab, 'selectClientTab')}</div>
  </div>`;
}
