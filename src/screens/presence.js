/* Bolá — "Presencia en el gym" (pantalla nueva, compartida owner/admin/
   entrenador, mismo patrón de "screen compartido + xReturn" que la
   Biblioteca de ejercicios, ver src/screens/library.js). Un solo QR físico
   del gimnasio: quien esté de turno lo escanea para quedar de encargado, y
   cada cliente lo escanea al llegar para arrancar su sesión de 2 horas —
   ver scan_gym_qr() en supabase/migrations/20260920000000_gym_presence_sessions.sql
   y docs/SECURITY_AUDIT.md Fase 17 para la decisión de seguridad detrás de
   dejar que el cliente se autoacredite acá (a diferencia del check-in de
   siempre, que sigue siendo solo el staff, ver viewScanCheckin en owner.js). */
'use strict';

import { state } from '../state.js';
import { iconSpan } from '../data.js';
import { esc, act, errorBanner, initials, avatar } from '../helpers.js';

function formatSince(iso) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Tiempo restante en vivo — puramente informativo, calculado del lado del
// cliente contra expiresAt (la autoridad real es el servidor, ver
// sync_gym_sessions()). "Vencida" solo debería verse un instante, hasta que
// el próximo refresh/tiempo real la saque de la lista.
function formatRemaining(expiresAtIso) {
  const ms = new Date(expiresAtIso).getTime() - Date.now();
  if (ms <= 0) return 'Vencida';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m restantes` : `${m}m restantes`;
}

function encargadoCard() {
  const gym = state.gym;
  const isCurrentEncargado = gym.current_encargado_user_id && (gym.current_encargado_user_id === state.myProfile.id);
  // El nombre del encargado actual: si soy staff, lo busco en las listas ya
  // cargadas (clientsForGym no aplica — es owner/admin/entrenador, no un
  // cliente); si no está en trainersForGym, es el propio dueño/admin.
  const encargadoName = () => {
    if (!gym.current_encargado_user_id) return null;
    if (isCurrentEncargado) return state.myProfile.name;
    const t = (state.trainersForGym || []).find(x => x.id === gym.current_encargado_user_id);
    return t ? t.name : 'Otro miembro del staff';
  };
  const name = encargadoName();
  const canEndShift = isCurrentEncargado || (state.myProfile && state.myProfile.role === 'owner');
  // Escanear siempre TOMA el turno (mismo scan_gym_qr() de siempre, sin
  // importar quién esté de turno ahora) — el botón queda visible igual
  // para el cambio de turno físico (llega el siguiente encargado y
  // escanea), no solo cuando no hay nadie.
  const takeOverLabel = isCurrentEncargado ? null : (name ? 'Escanear QR y tomar el turno' : 'Escanear QR y ser encargado');

  return `<div class="card" style="margin-bottom:16px">
    <div class="eyebrow" style="margin-bottom:8px">Encargado de turno</div>
    ${name
      ? `<div style="display:flex;align-items:center;gap:10px">
          <div class="avatar avatar--sq avatar--brand">${esc(initials(name))}</div>
          <div style="flex:1">
            <div style="font-size:14.5px;font-weight:700">${esc(name)}${isCurrentEncargado ? ' (vos)' : ''}</div>
            <div style="font-size:11.5px;color:var(--muted)">Desde las ${formatSince(gym.current_encargado_since)}</div>
          </div>
        </div>
        ${canEndShift ? `<div ${act('endEncargadoShift')} style="font-size:11.5px;color:var(--danger);cursor:pointer;font-weight:600;margin-top:10px">Terminar mi turno</div>` : ''}`
      : `<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">Nadie está de turno ahora mismo.</div>`}
    ${takeOverLabel ? `<button class="btn btn--brand" style="width:100%;padding:11px;font-size:13px;margin-top:${name ? '10px' : '0'}" ${act('goToScanGymPresence')}>${iconSpan('camera', 15)} ${takeOverLabel}</button>` : ''}
  </div>`;
}

function gymQrCard() {
  const payload = JSON.stringify({ t: 'gym_presence', gym: state.gym.id });
  return `<div class="card" style="margin-bottom:16px">
    <div style="display:flex;align-items:center;gap:14px">
      <div ${act('toggleGymQrExpanded')} style="cursor:pointer" title="Ver en grande">
        <canvas class="qr-canvas" data-qr="${esc(payload)}" data-qr-size="64"></canvas>
      </div>
      <div style="flex:1">
        <div class="eyebrow">QR de acceso del gimnasio</div>
        <div style="font-size:var(--fs-sm);color:var(--muted);margin-top:2px">Mostralo en la entrada — el staff lo escanea para quedar de encargado, y cada socio lo escanea al llegar</div>
      </div>
    </div>
    <div style="display:flex;gap:16px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
      <div ${act('toggleGymQrExpanded')} style="display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--info);cursor:pointer;font-weight:700">${iconSpan('eye', 14)} Ver en grande</div>
      <div ${act('downloadGymQr')} style="display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--brand);cursor:pointer;font-weight:700">${iconSpan('download', 14)} Descargar para imprimir</div>
    </div>
  </div>`;
}

function activeSessionRow(sess) {
  const client = (state.clientsForGym || []).find(c => c.id === sess.clientUserId);
  const name = client ? client.name : 'Socio';
  const remaining = formatRemaining(sess.expiresAt);
  const soon = new Date(sess.expiresAt).getTime() - Date.now() < 15 * 60000;
  return `<div class="row">
    ${avatar(name, client && client.faceUrl)}
    <div class="row__body">
      <div class="row__title">${esc(name)}</div>
      <div class="row__meta">Entró a las ${formatSince(sess.startedAt)}</div>
    </div>
    <div style="font-size:11.5px;font-weight:700;color:${soon ? 'var(--warn)' : 'var(--ok)'};white-space:nowrap">${remaining}</div>
  </div>`;
}

export function viewGymPresence() {
  const sessions = (state.gymActiveSessions || []).slice().sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
  return `<div class="col">
    <div class="step-head" style="justify-content:space-between">
      <div class="back" ${act('closeGymPresence')}>&lsaquo;</div>
      <div class="step-label">Presencia en el gym</div>
      <div style="width:32px"></div>
    </div>
    <div class="form-body">
      ${errorBanner()}
      ${encargadoCard()}
      ${gymQrCard()}
      <div class="eyebrow" style="margin-bottom:8px">${sessions.length ? `${sessions.length} ${sessions.length === 1 ? 'socio activo' : 'socios activos'} ahora` : 'Quién está adentro'}</div>
      ${sessions.length ? sessions.map(activeSessionRow).join('') : `<div class="empty"><div class="empty__title">Nadie está en el gym ahora mismo</div>Se llena solo apenas alguien escanea el código al llegar</div>`}
    </div>
    ${state.gymQrExpanded ? `<div ${act('toggleGymQrExpanded')} style="position:fixed;inset:0;background:rgba(11,13,16,0.94);z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px">
        <canvas class="qr-canvas" data-qr="${esc(JSON.stringify({ t: 'gym_presence', gym: state.gym.id }))}" data-qr-size="260"></canvas>
        <div style="text-align:center">
          <div style="font-size:16px;font-weight:800;color:#fff">${esc(state.gym.name)}</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.65);margin-top:4px">Código de acceso — encargado y socios escanean acá</div>
        </div>
        <button ${act('downloadGymQr')} class="btn btn--brand" style="width:auto;padding:12px 22px;font-size:13px">${iconSpan('download', 15)} Descargar para imprimir</button>
        <div style="font-size:12px;color:rgba(255,255,255,0.55);text-decoration:underline;cursor:pointer">Cerrar</div>
      </div>` : ''}
  </div>`;
}

// Cámara de lectura (ver src/qr.js) — clon del mismo layout que
// viewScanCheckin/viewClientScanPayment; el ciclo de vida de la cámara lo
// maneja router.js entero (QR_SCAN_SCREENS), no este archivo.
export function viewScanGymPresence() {
  const status = state.scanStatus;
  return `<div class="pane">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div class="back" ${act('exitScanGymPresence')}>&lsaquo;</div>
      <div style="font-size:15px;font-weight:800">Escanear QR del gimnasio</div>
    </div>
    ${state.scanError
      ? `<div class="card" style="text-align:center;padding:28px 20px">
          <div style="color:var(--danger);font-size:13px;font-weight:700;margin-bottom:6px">No pudimos abrir la cámara</div>
          <div style="font-size:12px;color:var(--muted);line-height:1.5">${esc(state.scanError)}</div>
          <div style="display:flex;gap:18px;justify-content:center;margin-top:12px">
            <div ${act('goToScanGymPresence')} style="font-size:12px;color:var(--ok);cursor:pointer;font-weight:700">Reintentar</div>
            <div ${act('exitScanGymPresence')} style="font-size:12px;color:var(--info);cursor:pointer;font-weight:700">Volver</div>
          </div>
        </div>`
      : `<div style="position:relative;border-radius:16px;overflow:hidden;background:#000;aspect-ratio:1/1">
          <video id="qrScanVideo" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;display:block"></video>
          <div style="position:absolute;inset:16%;border:2px solid rgba(255,255,255,0.55);border-radius:16px;pointer-events:none"></div>
        </div>
        ${status ? `<div class="card" style="margin-top:14px;text-align:center;border-color:${status.ok ? 'var(--ok)' : 'var(--danger)'}">
            <div style="font-size:13px;font-weight:700;color:${status.ok ? 'var(--ok)' : 'var(--danger)'}">${esc(status.text)}</div>
            ${status.ok ? `<div ${act('exitScanGymPresence')} style="font-size:12px;color:var(--info);cursor:pointer;font-weight:700;margin-top:10px;text-decoration:underline">Volver</div>` : ''}
          </div>` : `<div style="font-size:11.5px;color:var(--muted);text-align:center;margin-top:14px">Apuntá la cámara al código de acceso del gimnasio</div>`}`}
  </div>`;
}
