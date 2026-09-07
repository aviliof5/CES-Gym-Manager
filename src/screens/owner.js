/* Bolá — panel de dueño: registro del gimnasio + dashboard. El dueño tiene
   paridad total con el administrador (ve y hace todo lo que ve/hace un
   admin) más la aprobación de administradores nuevos — ver
   docs/ROLES_AND_PERMISSIONS.md. Este archivo es lo que antes era
   src/screens/admin.js completo (el admin creaba el gimnasio) — movido acá
   sin reescribir su lógica; admin.js pasó a ser el flujo de unión+aprobación
   (ver docs/MIGRATION_PLAN.md Fase 4). */
'use strict';

import { state } from '../state.js';
import { EQUIPMENT_SUGGESTIONS, DURATION_LABELS, MESES, DAY_LABELS, iconSpan, brandMark } from '../data.js';
import {
  esc, act, stepHead, stepBars, errorBanner, textField, sectionTitle,
  tabsMarkup, devCredit, initials, statusMeta, enrichClient, commentCards, money,
  emailField, phoneField, passwordField, passwordStrength, daysUntil,
} from '../helpers.js';

/* ---------------- dueño: registro ---------------- */

export function viewOwnerReg1() {
  const a = state.ownerReg;
  const invalid = !(a.name.trim() && a.email.trim() && a.phone.trim() && passwordStrength(a.password) >= 2) || state.busy;
  return `<div class="col">
    ${stepHead('Paso 1 de 4 · Registro Dueño', 'goto:inviteWelcome')}
    ${stepBars(1, 4, '')}
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
      <button class="btn btn--action" ${act('ownerSignUp')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Creando cuenta…' : 'Continuar'}</button>
    </div>
  </div>`;
}

export function viewOwnerReg2() {
  const g = state.gymReg;
  const invalid = !(g.name.trim() && g.address.trim() && g.hours.trim()) || state.busy;
  return `<div class="col">
    ${stepHead('Paso 2 de 4 · Datos del gimnasio', 'goto:ownerReg1')}
    ${stepBars(2, 4, '')}
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
      <button class="btn btn--action" ${act('ownerCreateGym')} ${invalid ? 'disabled' : ''}>${state.busy ? 'Creando gimnasio…' : 'Continuar'}</button>
    </div>
  </div>`;
}

// Compartido entre el paso 3 del registro y la sección de equipo en
// Configuración (ver viewOwnerConfiguracion) — antes el equipo solo se
// cargaba una vez durante el registro y no había forma de agregar/sacar
// una máquina después. opts.title/opts.subtitle dejan a cada pantalla
// poner su propio encabezado sin duplicar la lista/input/sugeridas.
function equipmentEditor(opts) {
  const o = opts || {};
  const chips = state.equipment.map(e => `
    <div class="pill" style="display:flex;align-items:center;gap:8px;padding:8px 8px 8px 14px">
      <span>${esc(e.name)}</span>
      <span ${act('removeEquipment', e.id)} style="width:18px;height:18px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;color:var(--muted)">&times;</span>
    </div>`).join('');

  const have = new Set(state.equipment.map(e => e.name));
  const suggestions = EQUIPMENT_SUGGESTIONS.filter(s => !have.has(s)).map(s =>
    `<div ${act('addEquipment', s)} style="background:var(--surface-dim);border:1px dashed var(--line-strong);border-radius:100px;padding:7px 13px;font-size:12.5px;color:var(--muted);cursor:pointer">+ ${s}</div>`).join('');

  return `${o.title ? `<div class="title">${esc(o.title)}</div>` : ''}
    ${o.subtitle ? `<div class="subtitle" style="margin-bottom:18px">${esc(o.subtitle)}</div>` : ''}
    <div style="display:flex;gap:8px;margin-bottom:16px">
      ${textField('newEquipment', 'Ej. Máquina de poleas', state.newEquipment, { sm: true, style: 'flex:1' })}
      <button ${act('addEquipmentFromInput')} class="btn btn--brand" style="flex:0 0 auto;width:auto;padding:0 18px;font-size:20px">+</button>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:${state.equipment.length && suggestions ? '16px' : '0'}">${chips}</div>
    ${suggestions ? `<div class="eyebrow" style="margin-bottom:8px">Sugeridas</div><div style="display:flex;flex-wrap:wrap;gap:8px">${suggestions}</div>` : ''}`;
}

export function viewOwnerReg3() {
  return `<div class="col">
    ${stepHead('Paso 3 de 4 · Equipo disponible', 'goto:ownerReg2')}
    ${stepBars(3, 4, '')}
    <div class="form-body">
      ${errorBanner()}
      ${equipmentEditor({ title: 'Máquinas y equipo', subtitle: 'Agrega cada máquina que tenga tu gym. Esto ayuda a recomendar rutinas con IA a tus clientes.' })}
    </div>
    <div class="form-foot">
      <button class="btn btn--action" ${act('goto', 'ownerReg4')}>Continuar</button>
    </div>
  </div>`;
}

export function viewOwnerReg4() {
  return viewPlansEditor({
    stepHeader: `${stepHead('Paso 4 de 4 · Planes de membresía', 'goto:ownerReg3')}${stepBars(4, 4, '')}`,
    finishButton: `<div class="form-foot"><button class="btn btn--action" ${act('ownerDashFromReg')}>Finalizar registro</button></div>`,
  });
}

// Compartido entre el paso 4 del registro y una futura edición de planes; hoy
// solo lo usa el registro, pero queda separado para no duplicar el formulario.
export function viewPlansEditor({ stepHeader, finishButton }) {
  const rows = state.plans.map(p => `
    <div class="card" style="border-color:${state.editingPlanId === p.id ? 'var(--brand)' : 'var(--line)'};padding:14px 16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div>
        <div style="font-size:14.5px;font-weight:700">${esc(p.name)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(DURATION_LABELS[p.duration] || p.duration)} · ${money(p.price)}</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <div ${act('editPlan', p.id)} style="font-size:12px;font-weight:700;color:var(--brand);cursor:pointer">Editar</div>
        <div ${act('deletePlan', p.id)} style="font-size:12px;font-weight:700;color:var(--danger);cursor:pointer">Eliminar</div>
      </div>
    </div>`).join('');

  const durations = ['Diario', 'Mensual', 'Anual'].map(d =>
    `<div ${act('setPlanDuration', d)} class="chip chip--brand${state.newPlanDuration === d ? ' is-active' : ''}">${d}</div>`).join('');

  const editing = !!state.editingPlanId;

  return `<div class="col">
    ${stepHeader}
    <div class="form-body">
      <div class="title">Crea tus planes</div>
      <div class="subtitle" style="margin-bottom:18px">Tus clientes elegirán entre estos al registrarse. Puedes editar o eliminar cualquiera.</div>
      ${errorBanner()}
      <div style="margin-bottom:8px">${rows}</div>
      <div class="card--dashed">
        <div class="eyebrow">${editing ? 'Editar plan' : 'Agregar plan'}</div>
        ${textField('newPlanName', 'Nombre del plan', state.newPlanName, { sm: true })}
        ${textField('newPlanPrice', 'Precio', state.newPlanPrice, { sm: true })}
        <div style="display:flex;gap:8px">${durations}</div>
        <div style="display:flex;gap:8px">
          <button ${act('savePlan')} class="btn btn--brand" style="flex:1;padding:12px;font-size:13.5px">${editing ? 'Guardar cambios' : 'Agregar plan'}</button>
          ${editing ? `<button ${act('cancelEditPlan')} class="btn btn--ghost" style="padding:12px 16px;font-size:13.5px">Cancelar</button>` : ''}
        </div>
      </div>
    </div>
    ${finishButton}
  </div>`;
}

/* ---------------- dashboard (dueño y administrador aprobado) ---------------- */

// "Socios" (pantalla #16 del plan) — buscador + filtro por estado real +
// suspender/reactivar (membership_status='suspendido', Etapa 2). El cobro
// en efectivo y el check-in manual son los mismos de siempre.
const STATUS_FILTERS = [['todos', 'Todos'], ['al_dia', 'Al día'], ['pendiente', 'Pendiente'], ['vencido', 'Vencido'], ['suspendido', 'Suspendido']];

export function viewOwnerSocios() {
  const query = state.ownerClientQuery.trim().toLowerCase();
  const filter = state.ownerClientStatusFilter;
  const enriched = state.clientsForGym.map(enrichClient);
  const filtered = enriched.filter(c =>
    (filter === 'todos' || c.status === filter) &&
    (!query || c.name.toLowerCase().includes(query)));

  const rows = filtered.map(c => {
    const m = statusMeta(c.status);
    const showCharge = state.activeCharge && state.activeCharge.clientId === c.id;
    const checkedInToday = state.todayCheckins.some(chk => chk.client_user_id === c.id);
    const suspending = state.ownerSuspendingClientId === c.id;
    return `<div class="card" style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="avatar">${esc(initials(c.name))}</div>
          <div>
            <div style="font-size:14.5px;font-weight:700">${esc(c.name)}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(c.plan)} · ${money(c.amount)}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <span class="${m.cls}">${m.label}</span>
          <div ${act('generateCharge', c.id)} style="font-size:11.5px;color:var(--action);cursor:pointer;font-weight:600">Cobrar / QR</div>
          ${checkedInToday
            ? `<div style="font-size:11px;color:var(--ok);font-weight:700">✓ Hoy</div>`
            : `<div ${act('checkInClient', c.id)} style="font-size:11.5px;color:var(--info);cursor:pointer;font-weight:600">Registrar entrada</div>`}
          ${c.status === 'suspendido'
            ? `<div ${act('unsuspendClient', c.id)} style="font-size:11.5px;color:var(--ok);cursor:pointer;font-weight:600">Reactivar</div>`
            : `<div ${act('promptSuspendClient', c.id)} style="font-size:11.5px;color:var(--danger);cursor:pointer;font-weight:600">Suspender</div>`}
        </div>
      </div>
      ${showCharge ? `<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px;display:flex;gap:12px;align-items:center">
        <div ${act('toggleChargeQrExpanded')} style="cursor:pointer" title="Ver en grande">
          <canvas class="qr-canvas" data-qr="${esc(JSON.stringify({ t: 'payment', id: state.activeCharge.paymentId }))}" data-qr-size="56"></canvas>
        </div>
        <div style="flex:1">
          <div style="font-size:12.5px;font-weight:700">Cobro pendiente · ${money(state.activeCharge.amount)} en efectivo</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:2px">Que ${esc(c.name)} escanee este código para confirmar su pago, o confirmalo vos cuando te entregue el efectivo</div>
          <div style="display:flex;gap:14px;margin-top:6px;align-items:center">
            <div ${act('toggleChargeQrExpanded')} style="display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--info);cursor:pointer;font-weight:700">${iconSpan('eye', 14)} Ver en grande</div>
            <div ${act('confirmCharge')} style="font-size:11.5px;color:var(--ok);cursor:pointer;font-weight:700">Confirmar efectivo recibido</div>
            <div ${act('cancelCharge')} style="font-size:11.5px;color:var(--danger);cursor:pointer;font-weight:600">Cancelar</div>
          </div>
        </div>
      </div>` : ''}
      ${suspending ? `<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px">¿Por qué suspendés a ${esc(c.name)}? (opcional)</div>
        ${textField('ownerSuspendReason', 'Motivo', state.ownerSuspendReason, { style: 'margin-bottom:8px' })}
        <div style="display:flex;gap:8px">
          <button class="btn btn--action" style="flex:1;padding:10px;font-size:12.5px" ${act('confirmSuspendClient')}>Confirmar suspensión</button>
          <button class="btn btn--ghost" style="padding:10px 16px;font-size:12.5px" ${act('cancelSuspendClient')}>Cancelar</button>
        </div>
      </div>` : ''}
    </div>`;
  }).join('');

  return `<div class="pane">
    ${errorBanner()}
    <div class="search">
      <span class="search__icon">${iconSpan('users', 16)}</span>
      <input class="field" data-f="ownerClientQuery" placeholder="Buscar socio por nombre…" value="${esc(state.ownerClientQuery)}"/>
    </div>
    <div class="seg">${STATUS_FILTERS.map(([k, label]) => `<div ${act('setOwnerClientStatusFilter', k)} class="seg__item${filter === k ? ' is-active' : ''}">${label}</div>`).join('')}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:12px;color:var(--muted)">${filtered.length} de ${state.clientsForGym.length} socios</div>
      <div ${act('goToScanCheckin')} style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--info);cursor:pointer;font-weight:700">${iconSpan('camera', 14)} Escanear QR</div>
    </div>
    ${rows || `<div class="empty"><div class="empty__title">Sin resultados</div>Nadie coincide con esa búsqueda/filtro</div>`}
    ${state.activeCharge && state.chargeQrExpanded ? `<div ${act('toggleChargeQrExpanded')} style="position:fixed;inset:0;background:rgba(11,13,16,0.94);z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px">
        <canvas class="qr-canvas" data-qr="${esc(JSON.stringify({ t: 'payment', id: state.activeCharge.paymentId }))}" data-qr-size="260"></canvas>
        <div style="text-align:center">
          <div style="font-size:16px;font-weight:800;color:#fff">${esc(state.activeCharge.clientName)}</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.65);margin-top:4px">${money(state.activeCharge.amount)} · que escanee este código para confirmar</div>
        </div>
        <div style="font-size:12px;color:rgba(255,255,255,0.55);text-decoration:underline;cursor:pointer">Cerrar</div>
      </div>` : ''}
  </div>`;
}

// Pantalla de check-in por cámara (Fase 15) — alternativa a clickear
// "Registrar entrada" cliente por cliente: apunta la cámara al "Mi QR" del
// cliente (ver src/screens/client.js qrCard()) y check_in_client() se llama
// solo apenas se lee un código válido de este gimnasio. La lectura en sí
// vive en src/qr.js; acá solo se arma el visor y el estado del último
// resultado — router.js es quien prende/apaga la cámara según
// state.screen (ver render() ahí).
export function viewScanCheckin() {
  const status = state.scanStatus;
  return `<div class="pane">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div class="back" ${act('goto', 'ownerDash')}>&lsaquo;</div>
      <div style="font-size:15px;font-weight:800">Escanear QR de check-in</div>
    </div>
    ${state.scanError
      ? `<div class="card" style="text-align:center;padding:28px 20px">
          <div style="color:var(--danger);font-size:13px;font-weight:700;margin-bottom:6px">No pudimos abrir la cámara</div>
          <div style="font-size:12px;color:var(--muted);line-height:1.5">${esc(state.scanError)}</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:14px;line-height:1.5">Mientras tanto podés registrar la entrada a mano desde la lista de clientes.</div>
          <div style="display:flex;gap:18px;justify-content:center;margin-top:12px">
            <div ${act('goToScanCheckin')} style="font-size:12px;color:var(--ok);cursor:pointer;font-weight:700">Reintentar</div>
            <div ${act('goto', 'ownerDash')} style="font-size:12px;color:var(--info);cursor:pointer;font-weight:700">Volver a Clientes</div>
          </div>
        </div>`
      : `<div style="position:relative;border-radius:16px;overflow:hidden;background:#000;aspect-ratio:1/1">
          <video id="qrScanVideo" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;display:block"></video>
          <div style="position:absolute;inset:16%;border:2px solid rgba(255,255,255,0.55);border-radius:16px;pointer-events:none"></div>
        </div>
        ${status ? `<div class="card" style="margin-top:14px;text-align:center;border-color:${status.ok ? 'var(--ok)' : 'var(--danger)'}">
            <div style="font-size:13px;font-weight:700;color:${status.ok ? 'var(--ok)' : 'var(--danger)'}">${esc(status.text)}</div>
          </div>` : `<div style="font-size:11.5px;color:var(--muted);text-align:center;margin-top:14px">Apuntá la cámara al código "Mi QR" del cliente</div>`}`}
  </div>`;
}

// Link/código de invitación (sección 10 del pedido original, separado por
// rol en la Fase 16 — antes había un solo código compartido, asumiendo
// siempre "cliente") — el código lo generó create_gym() solo (los 3, uno
// por rol), nadie lo "genera" a mano acá, esta tarjeta solo lo muestra y
// arma el link para compartir. El QR es real (Fase 15, ver src/qr.js) —
// codifica el mismo link con ?invite=CODE, así que cualquier cámara (la de
// esta app o la del sistema) lo abre directo, y router.js resuelve el rol
// automáticamente al abrirlo (ver resolveGymInviteFromUrl).
const INVITE_CARD_COPY = {
  client: { title: 'Invitá clientes', desc: 'quien se registre como cliente con él' },
  trainer: { title: 'Invitá entrenadores', desc: 'quien se registre como entrenador con él' },
  admin: { title: 'Invitá administradores', desc: 'quien se registre como administrador con él' },
};

function inviteCard(role) {
  const code = state.gymInvites && state.gymInvites[role];
  if (!code) return ''; // todavía no cargó (o gimnasio viejo sin backfill) — no hay nada honesto que mostrar
  const link = `${window.location.origin}${window.location.pathname}?invite=${code}`;
  const copy = INVITE_CARD_COPY[role];
  return `<div class="card--dashed" style="margin-bottom:18px">
    <div style="font-size:13px;font-weight:700;color:var(--muted)">${copy.title}</div>
    <div style="font-size:11.5px;color:var(--muted);line-height:1.5">Compartí este código o link — ${copy.desc} queda unido directo a tu gimnasio, sin elegirlo de una lista.</div>
    <div style="display:flex;align-items:center;gap:12px;margin-top:4px">
      <canvas class="qr-canvas" data-qr="${esc(link)}" data-qr-size="64"></canvas>
      <div style="flex:1;min-width:0">
        <div style="font-size:10.5px;color:var(--muted)">Código</div>
        <div style="font-size:16px;font-weight:800;letter-spacing:0.04em;font-family:var(--font-display)">${esc(code)}</div>
      </div>
      <button ${act('copyInviteLink', link)} style="background:${state.inviteLinkCopyFailed ? 'transparent' : 'var(--action)'};border:${state.inviteLinkCopyFailed ? '1px solid var(--danger)' : 'none'};border-radius:10px;padding:10px 16px;color:${state.inviteLinkCopyFailed ? 'var(--danger)' : '#fff'};font-weight:700;font-size:12.5px;cursor:pointer;white-space:nowrap">${state.inviteLinkCopied ? '¡Copiado!' : state.inviteLinkCopyFailed ? 'No se pudo copiar' : 'Copiar link'}</button>
    </div>
    ${state.inviteLinkCopyFailed ? `<div style="font-size:11px;color:var(--danger);margin-top:8px">Tu navegador no dejó copiar automático — copiá el código de arriba a mano.</div>` : ''}
    <div ${act('regenerateGymInvite', role)} style="font-size:11px;color:var(--info);cursor:pointer;margin-top:8px;text-decoration:underline">Regenerar código</div>
  </div>`;
}

// Resumen del gimnasio al abrir el panel (sección 4 del pedido original:
// "Clientes / Entrenadores / Check-ins / Ingresos"). Solo se muestran
// métricas reales ya cargadas en memoria — nada inventado. "Check-ins hoy"
// ahora sí es real (checkin_events, ver docs/DATABASE_MAP.md) — antes de
// esa migración este cuarto valor mostraba "Clientes al día" en su lugar.
function gymRevenue() {
  return state.clientsForGym.map(enrichClient)
    .filter(c => c.status === 'al_dia')
    .reduce((sum, c) => sum + c.amount, 0);
}

function ownerMetricsGrid() {
  const trainersActivos = state.trainersForGym.filter(t => t.status === 'approved').length;
  return `<div class="stat-grid" style="margin-bottom:16px">
    <div class="stat"><div class="stat__label">Clientes</div><div class="stat__value">${state.clientsForGym.length}</div></div>
    <div class="stat stat--brand"><div class="stat__label">Entrenadores</div><div class="stat__value">${trainersActivos}</div></div>
    <div class="stat"><div class="stat__label">Ingresos (al día)</div><div class="stat__value" style="font-size:24px">${money(gymRevenue())}</div></div>
    <div class="stat stat--brand"><div class="stat__label">Check-ins hoy</div><div class="stat__value">${state.todayCheckins.length}</div></div>
  </div>`;
}

// "Panel de administración" (pantalla #15 del plan) — mismas métricas de
// siempre + alertas reales (solicitudes pendientes, socios vencidos) +
// accesos rápidos a las demás tabs.
export function viewOwnerPanel() {
  const isOwner = state.myProfile && state.myProfile.role === 'owner';
  const pendingTrainers = state.trainersForGym.filter(t => t.status === 'pending').length;
  const pendingAdmins = isOwner ? state.gymAdminsForGym.filter(a => a.status === 'pending').length : 0;
  const vencidos = state.clientsForGym.filter(c => c.status === 'vencido').length;
  // Socios a 5 días o menos de que se les venza el plan (mismo criterio que
  // el aviso del propio cliente en viewClientHome) — excluye "diario", que
  // vence el mismo día que se paga y no tiene sentido "avisar con tiempo".
  const porVencer = state.clientsForGym.map(enrichClient)
    .filter(c => c.status === 'al_dia' && c.type !== 'diario' && (d => d !== null && d >= 0 && d <= 5)(daysUntil(c.membershipExpiresAt))).length;

  const alerts = [];
  if (pendingTrainers) alerts.push({ text: `${pendingTrainers} ${pendingTrainers === 1 ? 'entrenador espera' : 'entrenadores esperan'} aprobación`, tab: 'entrenadores' });
  if (pendingAdmins) alerts.push({ text: `${pendingAdmins} ${pendingAdmins === 1 ? 'administrador espera' : 'administradores esperan'} aprobación`, tab: 'admins' });
  if (vencidos) alerts.push({ text: `${vencidos} ${vencidos === 1 ? 'socio tiene' : 'socios tienen'} el pago vencido`, tab: 'socios' });
  if (porVencer) alerts.push({ text: `${porVencer} ${porVencer === 1 ? 'socio vence' : 'socios vencen'} su plan en 5 días o menos`, tab: 'socios' });

  return `<div class="pane">
    ${errorBanner()}
    ${ownerMetricsGrid()}
    ${alerts.length ? `${sectionTitle('Alertas', 'clock', 'margin-bottom:8px')}
      ${alerts.map(a => `<div class="alert alert--warn"><div class="alert__text" style="flex:1">${esc(a.text)}</div><div ${act('ownerTab', a.tab)} style="color:var(--warn);font-weight:700;cursor:pointer;white-space:nowrap;font-size:var(--fs-sm)">Ver</div></div>`).join('')}` : ''}
    ${sectionTitle('Accesos rápidos', 'zap', 'margin:20px 0 8px')}
    <div class="row" ${act('ownerTab', 'socios')}><div class="row__body"><div class="row__title">Socios</div><div class="row__meta">Buscar, filtrar, cobrar, suspender</div></div><div class="row__action">${iconSpan('chevronRight', 16)}</div></div>
    <div class="row" ${act('ownerTab', 'asistencia')}><div class="row__body"><div class="row__title">Asistencia</div><div class="row__meta">Check-ins reales del mes</div></div><div class="row__action">${iconSpan('chevronRight', 16)}</div></div>
    <div class="row" ${act('ownerTab', 'reportes')}><div class="row__body"><div class="row__title">Reportes</div><div class="row__meta">Ingresos, retención, reseñas</div></div><div class="row__action">${iconSpan('chevronRight', 16)}</div></div>
    <div class="row" ${act('ownerTab', 'configuracion')}><div class="row__body"><div class="row__title">Configuración</div><div class="row__meta">Moneda, marca, links de invitación</div></div><div class="row__action">${iconSpan('chevronRight', 16)}</div></div>
  </div>`;
}

export function viewOwnerEntrenadores() {
  const pending = state.trainersForGym.filter(t => t.status === 'pending');
  const approved = state.trainersForGym.filter(t => t.status === 'approved');
  const clientsOf = trainerId => state.clientsForGym.filter(c => c.trainerUserId === trainerId).map(c => c.name);

  // Los clientes interesados ya NO son requisito para aprobar: la regla de
  // los 10 se eliminó cuando el entrenador pasó a entrar por el link del
  // propio dueño (ver migración 20260905000200). Se sigue mostrando como
  // dato para que el dueño decida con contexto, pero no bloquea nada.
  const interestCountFor = candidateId => state.trainerInterest.filter(i => i.candidate_user_id === candidateId).length;

  const pendingBlock = pending.length ? `
    <div class="section-title" style="color:var(--warn);margin-bottom:10px">Solicitudes pendientes (${pending.length})</div>
    ${pending.map(t => {
      const interest = interestCountFor(t.id);
      return `
      <div class="card" style="border-color:rgba(var(--warn-rgb),0.35);margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="avatar avatar--sq" style="background:var(--warn-dim);color:var(--warn)">${esc(initials(t.name))}</div>
          <div style="flex:1">
            <div style="font-size:14.5px;font-weight:700">${esc(t.name)}</div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:2px">${esc(t.specialty)} · ${money(t.price)}/mes</div>
            <div style="font-size:11px;color:var(--muted);margin-top:1px">${esc(t.email)} · ${esc(t.phone)}</div>
          </div>
        </div>
        <div style="margin-top:10px;font-size:11.5px;font-weight:700;color:var(--muted)">${interest} ${interest === 1 ? 'cliente interesado' : 'clientes interesados'}</div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button ${act('approveTrainer', t.id)} class="btn btn--action" style="flex:1;padding:10px;font-size:12.5px">Aprobar</button>
          <button ${act('rejectTrainer', t.id)} class="btn btn--ghost" style="flex:1;padding:10px;font-size:12.5px;color:var(--danger)">Rechazar</button>
        </div>
      </div>`;
    }).join('')}
  ` : '';

  const rows = approved.map(t => {
    const names = clientsOf(t.id);
    const rating = state.trainerRatingsById[t.id] || { avg: null, count: 0 };
    return `<div class="card" style="margin-bottom:10px;${t.isActive ? '' : 'opacity:0.55'}">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="avatar avatar--sq avatar--action">${esc(initials(t.name))}</div>
        <div style="flex:1">
          <div style="font-size:14.5px;font-weight:700">${esc(t.name)}${!t.isActive ? ' <span style="font-size:11px;color:var(--muted);font-weight:600">(desactivado)</span>' : ''}</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:2px">${esc(t.specialty)}</div>
          <div class="rating" style="margin-top:4px">${iconSpan('star', 12)}<span class="rating__score">${rating.avg != null ? `${rating.avg.toFixed(1)} · ${rating.count} ${rating.count === 1 ? 'reseña' : 'reseñas'}` : 'Sin calificar aún'}</span></div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:var(--muted)">${names.length} ${names.length === 1 ? 'cliente' : 'clientes'}</div>
          <div style="font-size:12px;font-weight:700;color:var(--action);margin-top:2px">${money(t.price)}/mes</div>
        </div>
      </div>
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line)">
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px">Clientes asignados</div>
        ${names.length
          ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${names.map(n => `<div class="pill pill--flat">${esc(n)}</div>`).join('')}</div>`
          : `<div style="font-size:11.5px;color:var(--muted-dim);margin-bottom:10px">Sin clientes asignados aún</div>`}
        <div ${act('toggleTrainerActive', t.id)} style="font-size:11.5px;font-weight:700;color:${t.isActive ? 'var(--danger)' : 'var(--ok)'};cursor:pointer">${t.isActive ? 'Desactivar' : 'Activar'}</div>
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
    <div class="section-title" style="color:var(--info);margin-bottom:10px">Solicitudes pendientes (${pending.length})</div>
    ${pending.map(a => `
      <div class="card" style="border-color:rgba(var(--info-rgb),0.35);margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="avatar avatar--sq" style="background:var(--info-dim);color:var(--info)">${esc(initials(a.name))}</div>
          <div style="flex:1">
            <div style="font-size:14.5px;font-weight:700">${esc(a.name)}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(a.email)} · ${esc(a.phone)}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button ${act('approveAdmin', a.id)} class="btn btn--action" style="flex:1;padding:10px;font-size:12.5px">Aprobar</button>
          <button ${act('rejectAdmin', a.id)} class="btn btn--ghost" style="flex:1;padding:10px;font-size:12.5px;color:var(--danger)">Rechazar</button>
        </div>
      </div>`).join('')}
  ` : '';

  const rows = approved.map(a => `
    <div class="row">
      <div class="avatar avatar--sq" style="background:var(--info-dim);color:var(--info)">${esc(initials(a.name))}</div>
      <div class="row__body">
        <div class="row__title">${esc(a.name)}</div>
        <div class="row__meta">${esc(a.email)}</div>
      </div>
    </div>`).join('');

  return `<div class="pane">
    ${errorBanner()}
    ${pendingBlock}
    <div style="font-size:12px;color:var(--muted);margin-bottom:12px">${approved.length} ${approved.length === 1 ? 'administrador activo' : 'administradores activos'} en tu gym</div>
    ${rows || `<div class="empty"><div class="empty__title">Sin administradores</div>Compartí el link de invitación de administrador desde Configuración para que alguien se una</div>`}
  </div>`;
}

export function viewOwnerPagos() {
  const f = state.billingFilter;
  const enriched = state.clientsForGym.map(enrichClient);
  const inFilter = enriched.filter(c => c.type === f);
  const label = f === 'diario' ? 'diarios' : f === 'mensual' ? 'mensuales' : 'anuales';
  const filters = ['diario', 'mensual', 'anual'].map(k =>
    `<div ${act('setBillingFilter', k)} class="seg__item${f === k ? ' is-active' : ''}">${k === 'diario' ? 'Diario' : k === 'mensual' ? 'Mensual' : 'Anual'}</div>`).join('');

  const total = inFilter.reduce((a, c) => a + c.amount, 0);
  const count = st => inFilter.filter(c => c.status === st).length;

  const rows = inFilter.map(c => {
    const m = statusMeta(c.status);
    return `<div class="row">
      <div class="row__body">
        <div class="row__title">${esc(c.name)}</div>
        <div class="row__meta">${c.lastPayment ? 'Último pago: ' + esc(c.lastPayment) : 'Sin pagos aún'}</div>
      </div>
      <span class="${m.cls}">${m.label}</span>
    </div>`;
  }).join('');

  return `<div class="pane">
    ${errorBanner()}
    <div class="seg">${filters}</div>
    <div class="card" style="border-radius:16px;padding:18px;margin-bottom:16px">
      <div class="eyebrow">Ingresos ${label}</div>
      <div style="font-family:var(--font-display);font-size:28px;color:var(--action);margin-top:4px">${money(total)}</div>
      <div style="display:flex;gap:16px;margin-top:14px">
        <div><div style="font-size:15px;font-weight:800;color:var(--ok)">${count('al_dia')}</div><div style="font-size:10.5px;color:var(--muted)">Al día</div></div>
        <div><div style="font-size:15px;font-weight:800;color:var(--warn)">${count('pendiente')}</div><div style="font-size:10.5px;color:var(--muted)">Pendiente</div></div>
        <div><div style="font-size:15px;font-weight:800;color:var(--danger)">${count('vencido')}</div><div style="font-size:10.5px;color:var(--muted)">Vencido</div></div>
      </div>
    </div>
    ${rows}
  </div>`;
}

/* ---------------- Asistencia (pantalla nueva del plan — reemplaza el
   "Tráfico" con datos inventados: calendario real de checkin_events) ---------------- */

function dayIndexMon(date) { return (date.getDay() + 6) % 7; }

export function viewOwnerAsistencia() {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstOffset = dayIndexMon(new Date(year, month, 1));
  const todayNum = now.getDate();
  const selectedDay = state.attendanceSelectedDay || todayNum;

  const eventsByDay = {};
  state.attendanceEvents.forEach(e => {
    const d = new Date(e.created_at);
    (eventsByDay[d.getDate()] = eventsByDay[d.getDate()] || []).push(e);
  });

  const cells = [];
  for (let i = 0; i < firstOffset; i++) cells.push('<div class="cal__day is-muted"></div>');
  for (let day = 1; day <= daysInMonth; day++) {
    const cls = ['cal__day'];
    if (day === todayNum) cls.push('is-today');
    if (day === selectedDay) cls.push('is-selected');
    if (eventsByDay[day]) cls.push('has-event');
    cells.push(`<div class="${cls.join(' ')}" ${act('setAttendanceSelectedDay', day)}>${day}</div>`);
  }

  const dayEvents = (eventsByDay[selectedDay] || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const clientById = id => state.clientsForGym.find(c => c.id === id);
  const list = dayEvents.length ? dayEvents.map(e => {
    const c = clientById(e.client_user_id);
    const t = new Date(e.created_at);
    return `<div class="row">
      <div class="avatar">${esc(initials(c ? c.name : '?'))}</div>
      <div class="row__body"><div class="row__title">${esc(c ? c.name : 'Socio')}</div></div>
      <div style="font-size:var(--fs-sm);color:var(--muted)">${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}</div>
    </div>`;
  }).join('') : `<div class="empty"><div class="empty__title">Sin check-ins este día</div>Elegí otro día del calendario</div>`;

  return `<div class="pane">
    ${sectionTitle('Asistencia', 'calendar', 'margin-bottom:12px')}
    <div class="cal" style="margin-bottom:16px">
      <div class="cal__head"><div class="cal__month">${MESES[month]} ${year}</div></div>
      <div class="cal__grid">${DAY_LABELS.map(d => `<div class="cal__dow">${d}</div>`).join('')}${cells.join('')}</div>
    </div>
    <div class="hint" style="margin-bottom:10px">${dayEvents.length} ${dayEvents.length === 1 ? 'check-in' : 'check-ins'} este día</div>
    ${list}
  </div>`;
}

/* ---------------- Reportes (pantalla nueva del plan) ---------------- */

export function viewOwnerReportes() {
  const enriched = state.clientsForGym.map(enrichClient);
  const total = enriched.length || 1;
  const byStatus = st => enriched.filter(c => c.status === st).length;
  const breakdown = [
    ['al_dia', 'Al día', 'var(--ok)'],
    ['pendiente', 'Pendiente', 'var(--warn)'],
    ['vencido', 'Vencido', 'var(--danger)'],
    ['suspendido', 'Suspendido', 'var(--muted)'],
  ].map(([st, label, color]) => {
    const n = byStatus(st);
    const pct = Math.round(n / total * 100);
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);margin-bottom:4px"><span>${label}</span><span style="color:var(--muted)">${n} · ${pct}%</span></div>
      <div class="progress"><div class="progress__fill" style="width:${pct}%;background:${color}"></div></div>
    </div>`;
  }).join('');

  const now = new Date();
  const nuevosEsteMes = state.clientsForGym.filter(c => c.createdAt && new Date(c.createdAt).getMonth() === now.getMonth() && new Date(c.createdAt).getFullYear() === now.getFullYear()).length;

  const trainerRatings = Object.values(state.trainerRatingsById).filter(r => r.avg != null);
  const gymTrainerAvg = trainerRatings.length ? (trainerRatings.reduce((s, r) => s + r.avg, 0) / trainerRatings.length).toFixed(1) : null;
  const reviewAvg = state.reviews.length ? (state.reviews.reduce((a, c) => a + c.rating, 0) / state.reviews.length).toFixed(1) : null;

  return `<div class="pane">
    ${sectionTitle('Reportes', 'bars', 'margin-bottom:12px')}
    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat"><div class="stat__label">Ingresos (al día)</div><div class="stat__value" style="font-size:22px">${money(gymRevenue())}</div></div>
      <div class="stat stat--brand"><div class="stat__label">Nuevos este mes</div><div class="stat__value">${nuevosEsteMes}</div></div>
    </div>
    ${sectionTitle('Estado de los socios', 'users', 'margin-bottom:8px')}
    ${breakdown}
    ${sectionTitle('Opiniones', 'star', 'margin:20px 0 8px')}
    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat"><div class="stat__label">Gimnasio</div><div class="stat__value" style="font-size:22px">${reviewAvg || '—'}${reviewAvg ? '<span style="font-size:12px;color:var(--muted)">/5</span>' : ''}</div><div class="stat__hint">${state.reviews.length} reseñas</div></div>
      <div class="stat stat--brand"><div class="stat__label">Entrenadores</div><div class="stat__value" style="font-size:22px">${gymTrainerAvg || '—'}${gymTrainerAvg ? '<span style="font-size:12px;color:var(--muted)">/5</span>' : ''}</div></div>
    </div>
    ${commentCards(state.reviews.slice(0, 5))}
  </div>`;
}

/* ---------------- Configuración (pantalla nueva del plan) ---------------- */

export function viewOwnerConfiguracion() {
  const d = state.gymConfigDraft;
  return `<div class="pane">
    ${errorBanner()}
    ${sectionTitle('Configuración del gimnasio', 'settings', 'margin-bottom:12px')}
    <div class="card" style="margin-bottom:18px">
      <div class="eyebrow" style="margin-bottom:10px">Datos del gimnasio</div>
      ${textField('gymConfigDraft.name', 'Nombre del gimnasio', d.name, { style: 'margin-bottom:10px' })}
      ${textField('gymConfigDraft.address', 'Dirección', d.address, { style: 'margin-bottom:10px' })}
      ${textField('gymConfigDraft.hours', 'Horario (ej. 6:00 - 22:00)', d.hours, { style: 'margin-bottom:16px' })}
      <div class="eyebrow" style="margin-bottom:10px">Marca y moneda</div>
      ${textField('gymConfigDraft.currency', 'Moneda (código ISO, ej. USD, CUP, EUR)', d.currency, { style: 'margin-bottom:10px' })}
      ${textField('gymConfigDraft.brandName', 'Nombre de marca (opcional)', d.brandName, { style: 'margin-bottom:10px' })}
      ${textField('gymConfigDraft.brandColor', 'Color de acento en hex (opcional, ej. #E23744)', d.brandColor, { style: 'margin-bottom:10px' })}
      <button class="btn btn--action" style="width:100%;padding:12px;font-size:13px" ${act('saveGymConfig')}>${state.busy ? 'Guardando…' : 'Guardar cambios'}</button>
    </div>
    <div class="card" style="margin-bottom:18px">
      <div class="eyebrow" style="margin-bottom:10px">Equipo disponible</div>
      ${equipmentEditor({})}
    </div>
    <div class="row" ${act('openExerciseLibrary')}>
      <div class="row__body"><div class="row__title">Biblioteca de ejercicios</div><div class="row__meta">Catálogo global + el propio de tu gimnasio</div></div>
      <div class="row__action">${iconSpan('chevronRight', 16)}</div>
    </div>
    ${sectionTitle('Links de invitación', 'idcard', 'margin-bottom:8px')}
    <div class="hint" style="margin-bottom:12px">Un link por rol, reutilizable — quien lo abre queda unido directo a tu gimnasio con ESE rol, sin elegir de una lista.</div>
    ${inviteCard('client')}
    ${inviteCard('trainer')}
    ${inviteCard('admin')}
  </div>`;
}

// Tabs base, iguales para dueño y administrador (paridad total) — la de
// "Admins" se agrega condicionalmente en viewOwnerDash, solo para el dueño.
// (La vieja tab "Plataforma" — Fase 16, is_platform_admin — se movió a su
// propio panel dedicado, ver src/screens/platform.js.)
const BASE_TABS = [
  ['panel', 'Panel', 'home'],
  ['socios', 'Socios', 'users'],
  ['entrenadores', 'Coaches', 'clipboard'],
  ['pagos', 'Pagos', 'receipt'],
  ['asistencia', 'Asistencia', 'calendar'],
  ['reportes', 'Reportes', 'bars'],
  ['configuracion', 'Config', 'settings'],
];

export function viewOwnerDash() {
  const isOwner = state.myProfile && state.myProfile.role === 'owner';
  const tabs = [
    ...BASE_TABS,
    ...(isOwner ? [['admins', 'Admins', 'idcard']] : []),
  ];
  const panes = {
    panel: viewOwnerPanel,
    socios: viewOwnerSocios,
    entrenadores: viewOwnerEntrenadores,
    pagos: viewOwnerPagos,
    asistencia: viewOwnerAsistencia,
    reportes: viewOwnerReportes,
    configuracion: viewOwnerConfiguracion,
    admins: viewOwnerAdmins,
  };
  const activeTab = (state.ownerTab === 'admins' && !isOwner) ? 'panel' : state.ownerTab;
  return `<div class="dash-shell">
    <div class="dash-main">
      <div class="app-head">
        <div style="display:flex;align-items:center;gap:10px">
          ${brandMark('sm')}
          <div>
            <div class="app-title">${esc(state.gym.name)}</div>
            <div class="app-sub">${isOwner ? 'Panel de dueño' : 'Panel de administrador'}</div>
          </div>
        </div>
        <div ${act('signOut')} class="link-muted">Salir</div>
      </div>
      ${(panes[activeTab] || panes.panel)()}
      ${devCredit()}
    </div>
    <div class="tabbar">${tabsMarkup(tabs, activeTab, 'ownerTab')}</div>
  </div>`;
}
