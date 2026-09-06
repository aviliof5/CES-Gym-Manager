/* Bolá — panel de administrador de plataforma (rol dedicado
   'platform_admin', ver supabase/migrations/20260905000500_platform_admin_role.sql).
   Reemplaza el enfoque de la Fase 16 (profiles.is_platform_admin, un
   booleano que podía caer sobre CUALQUIER rol normal y agregaba una tab
   "Plataforma" extra dentro de su propio panel — cliente, entrenador o
   dueño/admin). Ahora es una cuenta separada, sin gimnasio, que entra
   directo acá (ver ACTIONS.routeAfterLogin en actions.js) y a ningún otro
   lado — no comparte tabbar ni dashboard con nadie.

   Dos cosas: generar links de invitación de dueño (ya existía, solo se
   movió el formulario acá) y ver qué gimnasios existen hoy + quién es su
   dueño (nuevo, ver BolaAPI.platform.listGyms()). */
'use strict';

import { state } from '../state.js';
import { iconSpan } from '../data.js';
import { esc, act, errorBanner, textField, devCredit, initials } from '../helpers.js';

export function viewPlatformDash() {
  const link = state.platformInviteLink;
  const gyms = state.platformGyms;

  const gymRows = gyms.map(g => `<div class="card" style="margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div style="display:flex;align-items:center;gap:10px;min-width:0">
        <div class="avatar">${esc(initials(g.name))}</div>
        <div style="min-width:0">
          <div style="font-size:14.5px;font-weight:700">${esc(g.name)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(g.address || '—')} · ${esc(g.currency || 'USD')}</div>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:12.5px;font-weight:700">${esc(g.ownerName || 'Sin dueño')}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(g.ownerEmail || '—')}</div>
      </div>
    </div>
  </div>`).join('');

  return `<div class="dash-shell">
    <div class="dash-main">
      <div class="app-head">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:34px;height:34px;border-radius:10px;background:var(--brand-dim);display:flex;align-items:center;justify-content:center;color:var(--brand)">${iconSpan('shield', 18)}</div>
          <div>
            <div class="app-title">Plataforma</div>
            <div class="app-sub">Administrador de plataforma</div>
          </div>
        </div>
        <div ${act('signOut')} class="link-muted">Salir</div>
      </div>
      <div class="pane">
        ${errorBanner()}
        <div class="card--dashed" style="margin-bottom:18px">
          <div style="font-size:13px;font-weight:700;color:var(--muted)">Generar invitación de dueño</div>
          <div style="font-size:11.5px;color:var(--muted);line-height:1.5;margin-bottom:12px">Cada link es de un solo uso — quien lo abra puede registrar UN gimnasio nuevo como dueño.</div>
          ${textField('platformInviteNote', 'Nota (ej. nombre del cliente) — opcional', state.platformInviteNote, { sm: true })}
          <button ${act('generatePlatformInvite')} class="btn btn--brand" style="width:100%;padding:12px;font-size:13.5px;margin-top:10px">${state.busy ? 'Generando…' : 'Generar link de invitación'}</button>
        </div>
        ${link ? `<div class="card--dashed" style="margin-bottom:18px">
          <div style="font-size:13px;font-weight:700;color:var(--muted)">Último link generado</div>
          <div style="display:flex;align-items:center;gap:12px;margin-top:4px">
            <canvas class="qr-canvas" data-qr="${esc(link)}" data-qr-size="64"></canvas>
            <div style="flex:1;min-width:0;font-size:11.5px;color:var(--text-soft);word-break:break-all">${esc(link)}</div>
          </div>
          <button ${act('copyInviteLink', link)} style="background:${state.inviteLinkCopyFailed ? 'transparent' : 'var(--brand)'};border:${state.inviteLinkCopyFailed ? '1px solid var(--danger)' : 'none'};border-radius:10px;padding:10px 16px;color:${state.inviteLinkCopyFailed ? 'var(--danger)' : '#fff'};font-weight:700;font-size:12.5px;cursor:pointer;width:100%;margin-top:10px">${state.inviteLinkCopied ? '¡Copiado!' : state.inviteLinkCopyFailed ? 'No se pudo copiar' : 'Copiar link'}</button>
        </div>` : ''}
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px">${gyms.length} gimnasio${gyms.length === 1 ? '' : 's'} registrado${gyms.length === 1 ? '' : 's'}</div>
        ${gymRows || `<div class="empty"><div class="empty__title">Todavía no hay gimnasios</div>Generá un link de invitación de dueño y compartilo para que se cree el primero.</div>`}
      </div>
      ${devCredit()}
    </div>
  </div>`;
}
