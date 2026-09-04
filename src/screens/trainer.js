/* Bolá — panel de entrenador (pendiente de aprobación, clientes, perfil).
   Movido 1:1 desde app.js (Fase 3, ver docs/MIGRATION_PLAN.md). */
'use strict';

import { state } from '../state.js';
import { GOALS, iconSpan } from '../data.js';
import { esc, act, textField, errorBanner, sectionTitle, tabsMarkup, devCredit, initials } from '../helpers.js';

export function viewTrainerPending() {
  return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px 28px;position:relative;z-index:0">
    <div class="gym-watermark gym-watermark--amber">${iconSpan('clipboard')}</div>
    <div style="width:64px;height:64px;border-radius:50%;background:rgba(251,191,36,0.15);display:flex;align-items:center;justify-content:center;color:var(--amber);margin-bottom:20px">${iconSpan('clock', 28)}</div>
    <div style="font-size:19px;font-weight:800">Perfil en revisión</div>
    <div style="font-size:13px;color:var(--muted);margin-top:8px;line-height:1.6;max-width:280px">Hola ${esc(state.pendingTrainerName)}, tu perfil como entrenador fue enviado. El administrador del gimnasio debe aprobarlo antes de que puedas acceder a tu panel.</div>
    <button class="btn btn--ghost" style="margin-top:28px" ${act('signOut')}>Volver al inicio</button>
    <div style="font-size:11.5px;color:var(--muted);margin-top:14px;cursor:pointer;text-decoration:underline" ${act('goto', 'trainerAuth')}>Ya fui aprobado, iniciar sesión</div>
  </div>`;
}

export function viewTrainerClientes() {
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

export function viewTrainerPerfil() {
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

export const TRAINER_TABS = [['clientes', 'Mis clientes', 'users'], ['perfil', 'Perfil', 'idcard']];

export function viewTrainerDash() {
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
