/* Bolá — panel de dueño: registro del gimnasio + dashboard. El dueño tiene
   paridad total con el administrador (ve y hace todo lo que ve/hace un
   admin) más la aprobación de administradores nuevos — ver
   docs/ROLES_AND_PERMISSIONS.md. Este archivo es lo que antes era
   src/screens/admin.js completo (el admin creaba el gimnasio) — movido acá
   sin reescribir su lógica; admin.js pasó a ser el flujo de unión+aprobación
   (ver docs/MIGRATION_PLAN.md Fase 4). */
'use strict';

import { state } from '../state.js';
import { EQUIPMENT_SUGGESTIONS, DURATION_LABELS, HEATMAP, DAY_LABELS } from '../data.js';
import {
  esc, act, chip, stepHead, stepBars, errorBanner, textField, sectionTitle,
  tabsMarkup, devCredit, initials, statusMeta, enrichClient, barChart, commentCards,
  emailField, phoneField, passwordField, passwordStrength,
} from '../helpers.js';

/* ---------------- dueño: registro ---------------- */

export function viewOwnerReg1() {
  const a = state.ownerReg;
  const invalid = !(a.name.trim() && a.email.trim() && a.phone.trim() && passwordStrength(a.password) >= 2) || state.busy;
  return `<div class="col">
    ${stepHead('Paso 1 de 4 · Registro Dueño', 'goto:ownerAuth')}
    ${stepBars(1, 4, 'lime')}
    <div class="form-body">
      <div class="title">Tus datos personales</div>
      <div class="subtitle">Campos obligatorios para completar tu registro</div>
      ${errorBanner()}
      <div class="stack">
        ${textField('ownerReg.name', 'Nombre completo *', a.name)}
        ${emailField('ownerReg.email', 'usuario *', a.email)}
        ${phoneField('ownerReg.phonePrefix', 'ownerReg.phone', a.phonePrefix, a.phone, 'Teléfono *')}
        ${passwordField('ownerReg.password', 'Contraseña *', a.password, { strength: true })}
      </div>
    </div>
    <div class="form-foot">
      <button class="btn btn--lime" ${act('ownerSignUp')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Creando cuenta…' : 'Continuar'}</button>
    </div>
  </div>`;
}

export function viewOwnerReg2() {
  const g = state.gymReg;
  const invalid = !(g.name.trim() && g.address.trim() && g.hours.trim()) || state.busy;
  return `<div class="col">
    ${stepHead('Paso 2 de 4 · Datos del gimnasio', 'goto:ownerReg1')}
    ${stepBars(2, 4, 'lime')}
    <div class="form-body">
      <div class="title">Tu gimnasio</div>
      <div class="subtitle">Estos datos los verán tus clientes</div>
      ${errorBanner()}
      <div class="stack">
        ${textField('gymReg.name', 'Nombre del gimnasio *', g.name)}
        ${textField('gymReg.address', 'Dirección *', g.address)}
        ${textField('gymReg.hours', 'Horario (ej. 6:00 - 22:00) *', g.hours)}
      </div>
    </div>
    <div class="form-foot">
      <button class="btn btn--lime" ${act('ownerCreateGym')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Creando gimnasio…' : 'Continuar'}</button>
    </div>
  </div>`;
}

export function viewOwnerReg3() {
  const chips = state.equipment.map(e => `
    <div style="display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--line);border-radius:100px;padding:8px 8px 8px 14px;font-size:13px">
      <span>${esc(e.name)}</span>
      <span ${act('removeEquipment', e.id)} style="width:18px;height:18px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;color:var(--muted)">&times;</span>
    </div>`).join('');

  const have = new Set(state.equipment.map(e => e.name));
  const suggestions = EQUIPMENT_SUGGESTIONS.filter(s => !have.has(s)).map(s =>
    `<div ${act('addEquipment', s)} style="background:var(--surface-dim);border:1px dashed rgba(255,255,255,0.18);border-radius:100px;padding:7px 13px;font-size:12.5px;color:var(--muted);cursor:pointer">+ ${s}</div>`).join('');

  return `<div class="col">
    ${stepHead('Paso 3 de 4 · Equipo disponible', 'goto:ownerReg2')}
    ${stepBars(3, 4, 'lime')}
    <div class="form-body">
      <div class="title">Máquinas y equipo</div>
      <div class="subtitle" style="margin-bottom:18px">Agrega cada máquina que tenga tu gym. Esto ayuda a recomendar rutinas con IA a tus clientes.</div>
      ${errorBanner()}
      <div style="display:flex;gap:8px;margin-bottom:16px">
        ${textField('newEquipment', 'Ej. Máquina de poleas', state.newEquipment, { sm: true, style: 'flex:1' })}
        <button ${act('addEquipmentFromInput')} style="background:var(--lime);border:none;border-radius:12px;padding:0 18px;color:var(--bg);font-weight:700;font-size:20px;cursor:pointer">+</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:${state.equipment.length && suggestions ? '16px' : '0'}">${chips}</div>
      ${suggestions ? `<div style="font-size:11px;color:var(--muted);margin-bottom:8px">Sugeridas</div><div style="display:flex;flex-wrap:wrap;gap:8px">${suggestions}</div>` : ''}
    </div>
    <div class="form-foot">
      <button class="btn btn--lime" ${act('goto', 'ownerReg4')}>Continuar</button>
    </div>
  </div>`;
}

export function viewOwnerReg4() {
  return viewPlansEditor({
    stepHeader: `${stepHead('Paso 4 de 4 · Planes de membresía', 'goto:ownerReg3')}${stepBars(4, 4, 'lime')}`,
    finishButton: `<div class="form-foot"><button class="btn btn--lime" ${act('ownerDashFromReg')}>Finalizar registro</button></div>`,
  });
}

// Compartido entre el paso 4 del registro y una futura edición de planes; hoy
// solo lo usa el registro, pero queda separado para no duplicar el formulario.
export function viewPlansEditor({ stepHeader, finishButton }) {
  const rows = state.plans.map(p => `
    <div class="card" style="border-color:${state.editingPlanId === p.id ? 'var(--lime)' : 'var(--line)'};padding:14px 16px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:14.5px;font-weight:700">${esc(p.name)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(DURATION_LABELS[p.duration] || p.duration)} · $${esc(p.price)}</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <div ${act('editPlan', p.id)} style="font-size:12px;font-weight:700;color:var(--lime);cursor:pointer">Editar</div>
        <div ${act('deletePlan', p.id)} style="font-size:12px;font-weight:700;color:var(--red);cursor:pointer">Eliminar</div>
      </div>
    </div>`).join('');

  const durations = ['Diario', 'Mensual', 'Anual'].map(d =>
    `<div ${act('setPlanDuration', d)} ${chip(state.newPlanDuration === d, 'lime')}>${d}</div>`).join('');

  const editing = !!state.editingPlanId;

  return `<div class="col">
    ${stepHeader}
    <div class="form-body">
      <div class="title">Crea tus planes</div>
      <div class="subtitle" style="margin-bottom:18px">Tus clientes elegirán entre estos al registrarse. Puedes editar o eliminar cualquiera.</div>
      ${errorBanner()}
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:18px">${rows}</div>
      <div class="card--dashed">
        <div style="font-size:13px;font-weight:700;color:var(--muted)">${editing ? 'Editar plan' : 'Agregar plan'}</div>
        ${textField('newPlanName', 'Nombre del plan', state.newPlanName, { sm: true })}
        ${textField('newPlanPrice', 'Precio (USD)', state.newPlanPrice, { sm: true })}
        <div style="display:flex;gap:8px">${durations}</div>
        <div style="display:flex;gap:8px">
          <button ${act('savePlan')} style="flex:1;background:var(--lime);border:none;border-radius:10px;padding:12px;color:var(--bg);font-weight:700;font-size:13.5px;cursor:pointer">${editing ? 'Guardar cambios' : 'Agregar plan'}</button>
          ${editing ? `<button ${act('cancelEditPlan')} style="background:var(--surface-2);border:none;border-radius:10px;padding:12px 16px;color:var(--muted);font-weight:700;font-size:13.5px;cursor:pointer">Cancelar</button>` : ''}
        </div>
      </div>
    </div>
    ${finishButton}
  </div>`;
}

/* ---------------- dashboard (dueño y administrador aprobado) ---------------- */

export function viewOwnerClientes() {
  const rows = state.clientsForGym.map(enrichClient).map(c => {
    const m = statusMeta(c.status);
    const showCharge = state.activeCharge && state.activeCharge.clientId === c.id;
    return `<div class="card" style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="avatar">${esc(initials(c.name))}</div>
          <div>
            <div style="font-size:14.5px;font-weight:700">${esc(c.name)}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(c.plan)} · $${esc(c.amount)}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <div class="${m.cls}">${m.label}</div>
          <div ${act('generateCharge', c.id)} style="font-size:11.5px;color:var(--lime);cursor:pointer;font-weight:600">Cobrar / QR</div>
        </div>
      </div>
      ${showCharge ? `<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px;display:flex;gap:12px;align-items:center">
        <div class="qr qr--sm"></div>
        <div style="flex:1">
          <div style="font-size:12.5px;font-weight:700">Cobro pendiente · $${esc(state.activeCharge.amount)} en efectivo</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:2px">Confirma solo cuando ${esc(c.name)} te entregue el efectivo en el mostrador</div>
          <div style="display:flex;gap:14px;margin-top:6px">
            <div ${act('confirmCharge')} style="font-size:11.5px;color:var(--mint);cursor:pointer;font-weight:700">Confirmar efectivo recibido</div>
            <div ${act('cancelCharge')} style="font-size:11.5px;color:var(--red);cursor:pointer;font-weight:600">Cancelar</div>
          </div>
        </div>
      </div>` : ''}
    </div>`;
  }).join('');

  return `<div class="pane">
    ${errorBanner()}
    ${ownerMetricsGrid()}
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px">${state.clientsForGym.length} clientes registrados</div>
    ${rows}
  </div>`;
}

// Resumen del gimnasio al abrir el panel (sección 4 del pedido original:
// "Clientes / Entrenadores / Check-ins / Ingresos"). Solo se muestran
// métricas reales ya cargadas en memoria — nada inventado; "check-ins" no
// aparece acá todavía porque no hay eventos de check-in reales (ver el gap
// en docs/DATABASE_MAP.md), así que el cuarto valor es "Al día" en su lugar.
function ownerMetricsGrid() {
  const trainersActivos = state.trainersForGym.filter(t => t.status === 'approved').length;
  const alDia = state.clientsForGym.filter(c => c.status === 'al_dia').length;
  const ingresos = state.clientsForGym.map(enrichClient)
    .filter(c => c.status === 'al_dia')
    .reduce((sum, c) => sum + c.amount, 0);

  const tile = (label, value, color) => `<div class="card" style="padding:14px;text-align:center">
    <div style="font-size:20px;font-weight:900;color:${color}">${value}</div>
    <div style="font-size:10.5px;color:var(--muted);margin-top:3px">${label}</div>
  </div>`;

  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px">
    ${tile('Clientes', state.clientsForGym.length, 'var(--text)')}
    ${tile('Entrenadores', trainersActivos, 'var(--amber)')}
    ${tile('Ingresos (al día)', '$' + ingresos, 'var(--lime)')}
    ${tile('Clientes al día', alDia, 'var(--mint)')}
  </div>`;
}

export function viewOwnerEntrenadores() {
  const pending = state.trainersForGym.filter(t => t.status === 'pending');
  const approved = state.trainersForGym.filter(t => t.status === 'approved');
  const clientsOf = trainerId => state.clientsForGym.filter(c => c.trainerUserId === trainerId).map(c => c.name);

  const pendingBlock = pending.length ? `
    <div class="section-title" style="color:var(--amber);margin-bottom:10px">Solicitudes pendientes (${pending.length})</div>
    ${pending.map(t => `
      <div class="card" style="border-color:rgba(251,191,36,0.35);margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="avatar avatar--sq avatar--amber">${esc(initials(t.name))}</div>
          <div style="flex:1">
            <div style="font-size:14.5px;font-weight:700">${esc(t.name)}</div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:2px">${esc(t.specialty)} · $${esc(t.price)}/mes</div>
            <div style="font-size:11px;color:var(--muted);margin-top:1px">${esc(t.email)} · ${esc(t.phone)}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button ${act('approveTrainer', t.id)} style="flex:1;background:var(--mint);border:none;border-radius:10px;padding:10px;color:var(--bg);font-weight:700;font-size:12.5px;cursor:pointer">Aprobar</button>
          <button ${act('rejectTrainer', t.id)} style="flex:1;background:var(--surface-2);border:none;border-radius:10px;padding:10px;color:var(--red);font-weight:700;font-size:12.5px;cursor:pointer">Rechazar</button>
        </div>
      </div>`).join('')}
  ` : '';

  const rows = approved.map(t => {
    const names = clientsOf(t.id);
    return `<div class="card" style="margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="avatar avatar--sq avatar--lime">${esc(initials(t.name))}</div>
        <div style="flex:1">
          <div style="font-size:14.5px;font-weight:700">${esc(t.name)}</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:2px">${esc(t.specialty)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:var(--muted)">${names.length} ${names.length === 1 ? 'cliente' : 'clientes'}</div>
          <div style="font-size:12px;font-weight:700;color:var(--lime);margin-top:2px">$${esc(t.price)}/mes</div>
        </div>
      </div>
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06)">
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px">Clientes asignados</div>
        ${names.length
          ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${names.map(n => `<div class="pill pill--flat">${esc(n)}</div>`).join('')}</div>`
          : `<div style="font-size:11.5px;color:var(--muted-dim)">Sin clientes asignados aún</div>`}
      </div>
    </div>`;
  }).join('');

  return `<div class="pane">
    ${errorBanner()}
    ${pendingBlock}
    <div style="font-size:12px;color:var(--muted);margin-bottom:12px">${approved.length} entrenadores activos en tu gym</div>
    ${rows}
  </div>`;
}

// Aprobación de administradores — EXCLUSIVA del dueño (no aparece en las
// tabs si quien mira el panel es un admin aprobado, ver OWNER_TABS/viewOwnerDash).
export function viewOwnerAdmins() {
  const pending = state.gymAdminsForGym.filter(a => a.status === 'pending');
  const approved = state.gymAdminsForGym.filter(a => a.status === 'approved');

  const pendingBlock = pending.length ? `
    <div class="section-title" style="color:var(--sky);margin-bottom:10px">Solicitudes pendientes (${pending.length})</div>
    ${pending.map(a => `
      <div class="card" style="border-color:rgba(56,189,248,0.35);margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="avatar avatar--sq avatar--sky">${esc(initials(a.name))}</div>
          <div style="flex:1">
            <div style="font-size:14.5px;font-weight:700">${esc(a.name)}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(a.email)} · ${esc(a.phone)}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button ${act('approveAdmin', a.id)} style="flex:1;background:var(--mint);border:none;border-radius:10px;padding:10px;color:var(--bg);font-weight:700;font-size:12.5px;cursor:pointer">Aprobar</button>
          <button ${act('rejectAdmin', a.id)} style="flex:1;background:var(--surface-2);border:none;border-radius:10px;padding:10px;color:var(--red);font-weight:700;font-size:12.5px;cursor:pointer">Rechazar</button>
        </div>
      </div>`).join('')}
  ` : '';

  const rows = approved.map(a => `
    <div class="card" style="margin-bottom:10px;display:flex;align-items:center;gap:12px">
      <div class="avatar avatar--sq avatar--sky">${esc(initials(a.name))}</div>
      <div style="flex:1">
        <div style="font-size:14.5px;font-weight:700">${esc(a.name)}</div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:2px">${esc(a.email)}</div>
      </div>
    </div>`).join('');

  return `<div class="pane">
    ${errorBanner()}
    ${pendingBlock}
    <div style="font-size:12px;color:var(--muted);margin-bottom:12px">${approved.length} ${approved.length === 1 ? 'administrador activo' : 'administradores activos'} en tu gym</div>
    ${rows || `<div class="card" style="border:1px dashed rgba(255,255,255,0.12);padding:24px;text-align:center">
        <div style="font-size:12.5px;color:var(--muted)">Todavía no tienes administradores. Compartí el nombre de tu gimnasio para que alguien se una como admin.</div>
      </div>`}
  </div>`;
}

export function viewOwnerFacturacion() {
  const f = state.billingFilter;
  const enriched = state.clientsForGym.map(enrichClient);
  const inFilter = enriched.filter(c => c.type === f);
  const label = f === 'diario' ? 'diarios' : f === 'mensual' ? 'mensuales' : 'anuales';
  const filters = ['diario', 'mensual', 'anual'].map(k =>
    `<div ${act('setBillingFilter', k)} ${chip(f === k, 'lime', 'flex:1;text-align:center')}>${k === 'diario' ? 'Diario' : k === 'mensual' ? 'Mensual' : 'Anual'}</div>`).join('');

  const total = inFilter.reduce((a, c) => a + c.amount, 0);
  const count = st => inFilter.filter(c => c.status === st).length;

  const rows = inFilter.map(c => {
    const m = statusMeta(c.status);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 4px;border-bottom:1px solid rgba(255,255,255,0.06)">
      <div>
        <div style="font-size:13.5px;font-weight:600">${esc(c.name)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${c.lastPayment ? 'Último pago: ' + esc(c.lastPayment) : 'Sin pagos aún'}</div>
      </div>
      <div class="${m.cls}">${m.label}</div>
    </div>`;
  }).join('');

  return `<div class="pane">
    ${errorBanner()}
    <div style="display:flex;gap:8px;margin-bottom:16px">${filters}</div>
    <div class="card" style="border-radius:16px;padding:18px;margin-bottom:16px">
      <div style="font-size:12px;color:var(--muted)">Ingresos ${label}</div>
      <div style="font-size:26px;font-weight:900;color:var(--lime);margin-top:4px">$${total}</div>
      <div style="display:flex;gap:16px;margin-top:14px">
        <div><div style="font-size:15px;font-weight:800;color:var(--mint)">${count('al_dia')}</div><div style="font-size:10.5px;color:var(--muted)">Al día</div></div>
        <div><div style="font-size:15px;font-weight:800;color:var(--amber)">${count('pendiente')}</div><div style="font-size:10.5px;color:var(--muted)">Pendiente</div></div>
        <div><div style="font-size:15px;font-weight:800;color:var(--red)">${count('vencido')}</div><div style="font-size:10.5px;color:var(--muted)">Vencido</div></div>
      </div>
    </div>
    ${rows}
  </div>`;
}

export function viewOwnerTrafico() {
  const rows = Object.keys(HEATMAP).map(label => `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      <div style="width:44px;font-size:9.5px;color:var(--muted)">${label}</div>
      <div style="flex:1;display:flex;gap:5px">
        ${HEATMAP[label].map(v => `<div style="flex:1;height:22px;border-radius:4px;background:rgba(228,0,58,${v})"></div>`).join('')}
      </div>
    </div>`).join('');

  return `<div class="pane">
    ${sectionTitle('Tráfico por hora (hoy)', 'bars', 'margin-bottom:12px')}
    <div style="font-size:11px;color:var(--muted);margin:-4px 0 10px">Datos de ejemplo — todavía no conectados a check-ins reales.</div>
    ${barChart('admin')}
    <div class="section-title" style="margin:20px 0 12px">Mapa de calor semanal</div>
    <div style="background:var(--surface);border-radius:14px;padding:12px;border:1px solid var(--line)">
      ${rows}
      <div style="display:flex;gap:6px;padding-left:50px;margin-top:2px">
        ${DAY_LABELS.map(d => `<div style="flex:1;text-align:center;font-size:9px;color:var(--muted)">${d}</div>`).join('')}
      </div>
    </div>
  </div>`;
}

export function viewOwnerComentarios() {
  const avg = state.reviews.length
    ? (state.reviews.reduce((a, c) => a + c.rating, 0) / state.reviews.length).toFixed(1)
    : '—';
  return `<div class="pane">
    ${sectionTitle('Opiniones de clientes', 'star', 'margin-bottom:4px')}
    <div class="hint" style="margin-bottom:16px">Promedio ${avg} / 5 · ${state.reviews.length} reseñas</div>
    ${commentCards(state.reviews)}
  </div>`;
}

// Tabs base, iguales para dueño y administrador (paridad total) — la de
// "Admins" se agrega condicionalmente en viewOwnerDash, solo para el dueño.
const BASE_TABS = [['clientes', 'Clientes', 'users'], ['entrenadores', 'Coaches', 'clipboard'], ['facturacion', 'Facturas', 'receipt'], ['trafico', 'Tráfico', 'bars'], ['comentarios', 'Reseñas', 'star']];

export function viewOwnerDash() {
  const isOwner = state.myProfile && state.myProfile.role === 'owner';
  const tabs = isOwner ? [...BASE_TABS, ['admins', 'Admins', 'idcard']] : BASE_TABS;
  const panes = {
    clientes: viewOwnerClientes,
    entrenadores: viewOwnerEntrenadores,
    facturacion: viewOwnerFacturacion,
    trafico: viewOwnerTrafico,
    comentarios: viewOwnerComentarios,
    admins: viewOwnerAdmins,
  };
  const activeTab = (state.ownerTab === 'admins' && !isOwner) ? 'clientes' : state.ownerTab;
  return `<div class="dash-shell">
    <div class="dash-main">
      <div class="app-head">
        <div>
          <div class="app-title">${esc(state.gym.name)}</div>
          <div class="app-sub">${isOwner ? 'Panel de dueño' : 'Panel de administrador'}</div>
        </div>
        <div ${act('signOut')} class="link-muted">Salir</div>
      </div>
      ${(panes[activeTab] || panes.clientes)()}
      ${devCredit()}
    </div>
    <div class="tabbar">${tabsMarkup(tabs, activeTab, 'ownerTab')}</div>
  </div>`;
}
