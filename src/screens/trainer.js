/* Bolá — panel de entrenador (pendiente de aprobación, Panel, Mis clientes,
   Calendario, Mensajes, Perfil). Movido 1:1 desde app.js (Fase 3, ver
   docs/MIGRATION_PLAN.md); rediseñado y ampliado en la Etapa 2 (ver
   docs/plans, "aqui-esta-el-logo") — antes solo tenía "Mis clientes" y
   "Perfil", con la rutina como texto libre. */
'use strict';

import { state } from '../state.js';
import { GOALS, MESES, DAY_LABELS, iconSpan } from '../data.js';
import { esc, act, textField, errorBanner, sectionTitle, tabsMarkup, devCredit, initials, statusMeta, money } from '../helpers.js';
// Fase 16 — is_platform_admin puede caer en una cuenta de cualquier rol
// (ver src/screens/client.js, mismo comentario) — se reutiliza la misma
// vista que ya usa el panel de dueño/admin en vez de duplicar el formulario.
import { viewOwnerPlatform } from './owner.js';

export function viewTrainerPending() {
  return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px 28px;position:relative;z-index:0">
    <div class="gym-watermark gym-watermark--amber">${iconSpan('clipboard')}</div>
    <div style="width:64px;height:64px;border-radius:50%;background:var(--warn-dim);display:flex;align-items:center;justify-content:center;color:var(--warn);margin-bottom:20px">${iconSpan('clock', 28)}</div>
    <div style="font-size:19px;font-weight:800">Perfil en revisión</div>
    <div style="font-size:13px;color:var(--muted);margin-top:8px;line-height:1.6;max-width:280px">Hola ${esc(state.pendingTrainerName)}, tu perfil como entrenador fue enviado. El administrador del gimnasio debe aprobarlo antes de que puedas acceder a tu panel.</div>
    <button class="btn btn--ghost" style="margin-top:28px" ${act('signOut')}>Volver al inicio</button>
    <div style="font-size:11.5px;color:var(--muted);margin-top:14px;cursor:pointer;text-decoration:underline" ${act('goto', 'login')}>Ya fui aprobado, iniciar sesión</div>
  </div>`;
}

const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
function formatSessionWhen(iso) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} · ${hh}:${mm}`;
}

/* ---------------- Panel (pantalla nueva del plan) ---------------- */

export function viewTrainerPanel() {
  const now = Date.now();
  const upcoming = state.trainerClassSessions
    .filter(s => new Date(s.starts_at).getTime() >= now)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const ratingCount = state.trainerReviewsList.length;
  const ratingAvg = ratingCount ? (state.trainerReviewsList.reduce((sum, r) => sum + r.rating, 0) / ratingCount).toFixed(1) : null;

  return `<div class="pane">
    ${errorBanner()}
    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat">
        <div class="stat__label">Clientes</div>
        <div class="stat__value">${state.trainerClients.length}</div>
        <div class="stat__hint">asignados</div>
      </div>
      <div class="stat stat--brand">
        <div class="stat__label">Calificación</div>
        <div class="stat__value">${ratingAvg || '—'}${ratingAvg ? '<span style="font-size:14px;color:var(--muted)">/5</span>' : ''}</div>
        <div class="stat__hint">${ratingCount} ${ratingCount === 1 ? 'reseña' : 'reseñas'}</div>
      </div>
    </div>
    ${sectionTitle('Próximas clases', 'calendar', 'margin-bottom:8px')}
    ${upcoming.length ? upcoming.slice(0, 4).map(s => `<div class="row">
        <div class="avatar avatar--sq avatar--action">${iconSpan('dumbbell', 18)}</div>
        <div class="row__body">
          <div class="row__title">${esc((s.class || {}).name || 'Clase')}</div>
          <div class="row__meta">${esc(formatSessionWhen(s.starts_at))}</div>
        </div>
      </div>`).join('') : `<div class="empty"><div class="empty__title">Sin clases próximas</div>El dueño o admin te asigna clases desde su panel</div>`}
    ${sectionTitle('Accesos rápidos', 'zap', 'margin:20px 0 8px')}
    <div class="row" ${act('trainerTab', 'clientes')}>
      <div class="row__body"><div class="row__title">Mis clientes</div><div class="row__meta">Ver progreso, armar rutinas</div></div>
      <div class="row__action">${iconSpan('chevronRight', 16)}</div>
    </div>
    <div class="row" ${act('trainerTab', 'mensajes')}>
      <div class="row__body"><div class="row__title">Mensajes</div><div class="row__meta">Hablar con tus clientes</div></div>
      <div class="row__action">${iconSpan('chevronRight', 16)}</div>
    </div>
  </div>`;
}

/* ---------------- Mis clientes ---------------- */

export function viewTrainerClientes() {
  const myClients = state.trainerClients;
  const selectedId = state.trainerSelectedClientId;
  const detail = state.trainerSelectedClientDetail;

  if (selectedId && detail) {
    const selected = myClients.find(c => c.id === selectedId);
    const routine = detail.routine.exercises;
    const progress = detail.progress;
    const meta = statusMeta(selected.status);
    const goalLabel = (GOALS.find(g => g.id === (selected.physical && selected.physical.goal)) || {}).label || 'Sin meta definida';
    const lastMeasure = detail.measurements[detail.measurements.length - 1];
    const d = state.trainerRoutineDraft;
    const exerciseOptions = state.exercisesLib.map(e => `<option value="${esc(e.id)}"${d.exerciseId === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('');

    return `<div class="pane">
      ${errorBanner()}
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <div class="back" ${act('closeClientDetail')}>&lsaquo;</div>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:800">${esc(selected.name)}</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:1px">${esc(selected.plan)} · ${esc(goalLabel)}</div>
        </div>
        <span class="${meta.cls}">${meta.label}</span>
      </div>

      <div class="stat-grid" style="margin-bottom:16px">
        <div class="stat"><div class="stat__label">Peso</div><div class="stat__value">${lastMeasure && lastMeasure.weight_kg != null ? lastMeasure.weight_kg : '—'}<span style="font-size:14px;color:var(--muted)">kg</span></div></div>
        <div class="stat stat--brand"><div class="stat__label">Récords</div><div class="stat__value">${detail.prs.length}</div></div>
      </div>

      ${sectionTitle('Progreso del cliente', 'camera')}
      ${progress.length
        ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
            ${progress.map(pg => `<div>
              <div class="thumb${pg.url ? '' : ' thumb--pending'}" style="width:100%;height:110px">
                ${pg.url ? `<img src="${esc(pg.url)}" alt="Progreso ${esc(pg.taken_at)}"/>` : 'Sin foto'}
              </div>
              <div style="font-size:var(--fs-xs);color:var(--muted);margin-top:6px;text-align:center">${esc(pg.taken_at)}</div>
            </div>`).join('')}
          </div>`
        : `<div class="empty" style="margin-bottom:16px"><div class="empty__title">Sin fotos</div>Este cliente aún no subió fotos de progreso</div>`}

      ${sectionTitle('Crear rutina', 'zap')}
      <div class="hint" style="margin-bottom:10px">Estos ejercicios se muestran al cliente si elige "De tu entrenador"</div>
      <div ${act('openExerciseLibrary')} style="font-size:var(--fs-sm);color:var(--brand);cursor:pointer;font-weight:600;margin-bottom:10px">${iconSpan('dumbbell', 14)} Ver biblioteca completa</div>
      <div class="card" style="margin-bottom:16px">
        <select class="field" data-f="trainerRoutineDraft.exerciseId" style="margin-bottom:10px">
          <option value="">Elegí un ejercicio de la biblioteca (opcional)</option>
          ${exerciseOptions}
        </select>
        ${textField('trainerRoutineDraft.text', 'Nombre del ejercicio *', d.text, { style: 'margin-bottom:10px' })}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
          ${textField('trainerRoutineDraft.sets', 'Series', d.sets)}
          ${textField('trainerRoutineDraft.reps', 'Reps (ej. 8 o 10-8-6)', d.reps)}
          ${textField('trainerRoutineDraft.weightKg', 'Peso (kg)', d.weightKg)}
          ${textField('trainerRoutineDraft.restSeconds', 'Descanso (seg)', d.restSeconds)}
        </div>
        <button class="btn btn--brand" style="width:100%;padding:12px;font-size:13px" ${act('addTrainerRoutineExercise')} ${!d.text.trim() ? 'disabled' : ''}>+ Agregar a la rutina</button>
      </div>
      ${routine.length ? routine.map(ex => {
        const info = [ex.sets ? `${ex.sets} series` : null, ex.reps ? `${esc(String(ex.reps))} reps` : null, ex.weightKg != null ? `${ex.weightKg} kg` : null, ex.restSeconds ? `${ex.restSeconds}s descanso` : null].filter(Boolean).join(' · ');
        return `<div class="row">
          <div class="row__body">
            <div class="row__title">${esc(ex.text)}</div>
            ${info ? `<div class="row__meta">${info}</div>` : ''}
          </div>
          <div class="row__action" style="color:var(--danger)" ${act('removeTrainerRoutineExercise', ex.id)}>Quitar</div>
        </div>`;
      }).join('')
        : `<div class="empty"><div class="empty__title">Sin ejercicios</div>Todavía no armaste la rutina de este cliente</div>`}
    </div>`;
  }

  const query = state.trainerClientQuery.trim().toLowerCase();
  const filtered = query ? myClients.filter(c => c.name.toLowerCase().includes(query)) : myClients;

  return `<div class="pane">
    ${errorBanner()}
    <div class="search">
      <span class="search__icon">${iconSpan('users', 16)}</span>
      <input class="field" data-f="trainerClientQuery" placeholder="Buscar cliente por nombre…" value="${esc(state.trainerClientQuery)}"/>
    </div>
    <div class="hint" style="margin-bottom:10px">${filtered.length} de ${myClients.length} ${myClients.length === 1 ? 'cliente asignado' : 'clientes asignados'}</div>
    ${filtered.length ? filtered.map(c => {
      const meta = statusMeta(c.status);
      return `<div class="row" style="cursor:pointer" ${act('openClientDetail', c.id)}>
        <div class="avatar avatar--sq avatar--action">${esc(initials(c.name))}</div>
        <div class="row__body">
          <div class="row__title">${esc(c.name)}</div>
          <div class="row__meta">${esc(c.plan)}</div>
        </div>
        <span class="${meta.cls}">${meta.label}</span>
      </div>`;
    }).join('')
      : `<div class="empty"><div class="empty__title">Sin resultados</div>${myClients.length ? 'Nadie coincide con esa búsqueda' : 'Cuando un cliente te elija al registrarse, aparecerá acá'}</div>`}
  </div>`;
}

/* ---------------- Calendario / agenda (pantalla nueva del plan) ---------------- */

function dayIndexMon(date) { return (date.getDay() + 6) % 7; }

export function viewTrainerCalendario() {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstOffset = dayIndexMon(new Date(year, month, 1));
  const todayNum = now.getDate();
  const selectedDay = state.trainerSelectedDay || todayNum;

  const sessionsByDay = {};
  state.trainerClassSessions.forEach(s => {
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
    cells.push(`<div class="${cls.join(' ')}" ${act('setTrainerSelectedDay', day)}>${day}</div>`);
  }

  const daySessions = (sessionsByDay[selectedDay] || []).slice().sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const list = daySessions.length ? daySessions.map(s => `<div class="row">
      <div class="avatar avatar--sq avatar--action">${iconSpan('dumbbell', 18)}</div>
      <div class="row__body">
        <div class="row__title">${esc((s.class || {}).name || 'Clase')}</div>
        <div class="row__meta">${esc(formatSessionWhen(s.starts_at))} · ${(s.class || {}).duration_minutes || 60} min</div>
      </div>
    </div>`).join('') : `<div class="empty"><div class="empty__title">Sin clases este día</div>Elegí otro día del calendario</div>`;

  return `<div class="pane">
    ${sectionTitle('Calendario', 'calendar', 'margin-bottom:12px')}
    <div class="cal" style="margin-bottom:16px">
      <div class="cal__head"><div class="cal__month">${MESES[month]} ${year}</div></div>
      <div class="cal__grid">${DAY_LABELS.map(d => `<div class="cal__dow">${d}</div>`).join('')}${cells.join('')}</div>
    </div>
    ${list}
  </div>`;
}

/* ---------------- Mensajes (pantalla nueva del plan) ---------------- */

export function viewTrainerMensajes() {
  const activeId = state.trainerActiveConversationId;
  if (activeId) {
    const conv = state.trainerConversations.find(c => c.conversationId === activeId);
    const myId = state.myTrainer.id;
    const bubbles = state.trainerMessages.map(m => {
      const mine = m.sender_user_id === myId;
      return `<div style="display:flex;justify-content:${mine ? 'flex-end' : 'flex-start'};margin-bottom:8px">
        <div style="max-width:78%;background:${mine ? 'var(--action)' : 'var(--surface-2)'};color:${mine ? '#fff' : 'var(--text)'};padding:10px 14px;border-radius:14px;font-size:13px;line-height:1.4">${esc(m.body)}</div>
      </div>`;
    }).join('');
    return `<div class="pane" style="display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div class="back" ${act('closeTrainerConversation')}>&lsaquo;</div>
        <div style="font-size:15px;font-weight:800">${esc(conv ? conv.clientName : 'Cliente')}</div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;margin-bottom:12px">
        ${bubbles || `<div class="empty"><div class="empty__title">Sin mensajes</div>Escribile a tu cliente</div>`}
      </div>
      <div style="display:flex;gap:8px">
        <input class="field" style="flex:1" data-f="trainerMessageDraft" placeholder="Escribe un mensaje…" value="${esc(state.trainerMessageDraft)}"/>
        <button class="btn btn--action" ${act('sendTrainerMessage')}>Enviar</button>
      </div>
    </div>`;
  }

  return `<div class="pane">
    ${sectionTitle('Mensajes', 'chat', 'margin-bottom:12px')}
    ${state.trainerConversations.length ? state.trainerConversations.map(c => `<div class="row" style="cursor:pointer" ${act('openTrainerConversation', c.clientId)}>
        <div class="avatar avatar--sq avatar--action">${esc(initials(c.clientName))}</div>
        <div class="row__body"><div class="row__title">${esc(c.clientName)}</div></div>
        <div class="row__action">${iconSpan('chevronRight', 16)}</div>
      </div>`).join('') : `<div class="empty"><div class="empty__title">Sin clientes</div>Cuando tengas clientes asignados vas a poder escribirles acá</div>`}
  </div>`;
}

/* ---------------- Perfil ---------------- */

export function viewTrainerPerfil() {
  const trainer = state.myTrainer;
  const draft = state.trainerProfileDraft;
  const ratingCount = state.trainerReviewsList.length;
  const ratingAvg = ratingCount ? (state.trainerReviewsList.reduce((sum, r) => sum + r.rating, 0) / ratingCount).toFixed(1) : null;

  return `<div class="pane">
    ${errorBanner()}
    <div class="row">
      <div class="avatar avatar--sq avatar--action" style="width:52px;height:52px;font-size:18px">${esc(initials(trainer.name))}</div>
      <div class="row__body">
        <div class="row__title">${esc(trainer.name)}</div>
        <div class="row__meta">${esc(trainer.email)}</div>
      </div>
    </div>
    <div class="stat-grid" style="margin:12px 0 16px">
      <div class="stat"><div class="stat__label">Precio</div><div class="stat__value" style="font-size:20px">${money(trainer.price)}<span style="font-size:12px;color:var(--muted)">/mes</span></div></div>
      <div class="stat stat--brand"><div class="stat__label">Calificación</div><div class="stat__value" style="font-size:20px">${ratingAvg || '—'}${ratingAvg ? '<span style="font-size:12px;color:var(--muted)">/5</span>' : ''}</div><div class="stat__hint">${ratingCount} ${ratingCount === 1 ? 'reseña' : 'reseñas'}</div></div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="eyebrow" style="margin-bottom:10px">Editar perfil</div>
      ${textField('trainerProfileDraft.specialty', 'Especialidad', draft.specialty, { style: 'margin-bottom:10px' })}
      ${textField('trainerProfileDraft.price', 'Precio del servicio (mensual)', draft.price, { style: 'margin-bottom:10px' })}
      <button class="btn btn--action" style="width:100%;padding:12px;font-size:13px" ${act('saveTrainerProfile')}>Guardar cambios</button>
    </div>
    <button class="btn btn--ghost" style="width:100%" ${act('signOut')}>Cerrar sesión</button>
  </div>`;
}

const TRAINER_BASE_TABS = [
  ['panel', 'Panel', 'home'],
  ['clientes', 'Mis clientes', 'users'],
  ['calendario', 'Calendario', 'calendar'],
  ['mensajes', 'Mensajes', 'chat'],
  ['perfil', 'Perfil', 'idcard'],
];

export function viewTrainerDash() {
  const isPlatformAdmin = !!(state.myProfile && state.myProfile.is_platform_admin);
  const tabs = isPlatformAdmin ? [...TRAINER_BASE_TABS, ['plataforma', 'Plataforma', 'shield']] : TRAINER_BASE_TABS;
  const panes = {
    panel: viewTrainerPanel,
    clientes: viewTrainerClientes,
    calendario: viewTrainerCalendario,
    mensajes: viewTrainerMensajes,
    perfil: viewTrainerPerfil,
    plataforma: viewOwnerPlatform,
  };
  const activeTab = (state.trainerTab === 'plataforma' && !isPlatformAdmin) ? 'panel' : state.trainerTab;
  return `<div class="dash-shell">
    <div class="dash-main">
      <div class="app-head">
        <div>
          <div class="app-title">${esc(state.myTrainer.name)}</div>
          <div class="app-sub">Panel de entrenador · ${esc(state.gym.name)}</div>
        </div>
        <div ${act('signOut')} class="link-muted">Salir</div>
      </div>
      ${(panes[activeTab] || panes.panel)()}
      ${devCredit()}
    </div>
    <div class="tabbar tabbar--trainer">${tabsMarkup(tabs, activeTab, 'trainerTab')}</div>
  </div>`;
}
