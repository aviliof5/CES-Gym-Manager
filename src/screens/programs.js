/* Bolá — "Programas de entrenamiento" (plantillas de rutina de varios
   días — Push/Pull/Legs, Upper/Lower, etc.). Catálogo global de solo
   lectura para cliente y entrenador; el entrenador además puede "usar" un
   programa para armar de una la rutina de un cliente (ver
   supabase/migrations/20260908000300_program_templates.sql y
   applyProgramTemplate en src/actions.js). Mismo patrón visual que
   src/screens/library.js. */
'use strict';

import { state } from '../state.js';
import { iconSpan } from '../data.js';
import { esc, act, errorBanner, sectionTitle } from '../helpers.js';

const LEVEL_STYLE = {
  Principiante: 'background:var(--ok-dim);color:var(--ok)',
  Intermedio: 'background:var(--warn-dim);color:var(--warn)',
  Avanzado: 'background:var(--danger-dim);color:var(--danger)',
};

function levelBadge(level) {
  if (!level) return '';
  const style = LEVEL_STYLE[level] || 'background:rgba(255,255,255,0.08);color:var(--muted)';
  return `<span class="badge" style="${style}">${esc(level)}</span>`;
}

function exerciseLine(it) {
  const detail = [
    it.sets ? `${it.sets} series` : null,
    it.reps ? `${esc(String(it.reps))} reps` : null,
    it.restSeconds ? `${it.restSeconds}s descanso` : null,
  ].filter(Boolean).join(' · ');
  return `<div class="row">
    <div class="row__body">
      <div class="row__title">${esc(it.exerciseName)}</div>
      ${detail ? `<div class="row__meta">${detail}</div>` : ''}
    </div>
  </div>`;
}

export function viewProgramTemplates() {
  const programs = state.programTemplates || [];
  const allItems = state.programTemplateItems || [];
  const canApply = state.programApplyContext === 'trainer';
  const expanded = state.programExpandedId ? programs.find(p => p.id === state.programExpandedId) : null;

  if (expanded) {
    const items = allItems.filter(it => it.programId === expanded.id).sort((a, b) => (a.dayPosition - b.dayPosition) || (a.position - b.position));
    const days = [];
    for (const it of items) {
      let d = days.find(d => d.label === it.dayLabel);
      if (!d) { d = { label: it.dayLabel, items: [] }; days.push(d); }
      d.items.push(it);
    }
    return `<div class="col">
      <div class="step-head" style="justify-content:space-between">
        <div class="back" ${act('closeProgramDetail')}>&lsaquo;</div>
        <div class="step-label">${esc(expanded.name)}</div>
        <div style="width:32px"></div>
      </div>
      <div class="form-body">
        ${errorBanner()}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
          ${levelBadge(expanded.level)}
          ${expanded.daysPerWeek ? `<span class="badge" style="background:rgba(255,255,255,0.08);color:var(--muted)">${expanded.daysPerWeek} días/semana</span>` : ''}
          ${expanded.durationLabel ? `<span class="badge" style="background:rgba(255,255,255,0.08);color:var(--muted)">${esc(expanded.durationLabel)}</span>` : ''}
        </div>
        ${expanded.goal ? `<div class="hint" style="margin-bottom:16px">Objetivo: ${esc(expanded.goal)}</div>` : ''}
        ${canApply ? `<button class="btn btn--action" style="width:100%;padding:14px;font-size:14px;margin-bottom:18px" ${act('applyProgramTemplate', expanded.id)} ${!items.length || state.busy ? 'disabled' : ''}>${state.busy ? 'Aplicando…' : 'Usar este programa para este cliente'}</button>` : ''}
        ${days.length
          ? days.map(d => `${sectionTitle(d.label, 'dumbbell', 'margin:14px 0 6px')}${d.items.map(exerciseLine).join('')}`).join('')
          : `<div class="empty"><div class="empty__title">Sin ejercicios definidos</div>Este programa todavía no tiene el día a día cargado.</div>`}
        <div class="alert alert--warn" style="margin-top:16px"><div class="alert__text">Es una plantilla general — el entrenador debe adaptar volumen, carga, técnica y ejercicios a cada persona.</div></div>
      </div>
    </div>`;
  }

  return `<div class="col">
    <div class="step-head" style="justify-content:space-between">
      <div class="back" ${act('closeProgramTemplates')}>&lsaquo;</div>
      <div class="step-label">Programas de entrenamiento</div>
      <div style="width:32px"></div>
    </div>
    <div class="form-body">
      ${errorBanner()}
      ${canApply ? `<div class="hint" style="margin-bottom:14px">Elegí un programa para reemplazar la rutina actual de este cliente</div>` : ''}
      ${programs.length ? programs.map(p => {
        const count = allItems.filter(it => it.programId === p.id).length;
        return `<div class="row" style="cursor:pointer" ${act('openProgramDetail', p.id)}>
          <div class="row__body">
            <div class="row__title">${esc(p.name)}</div>
            <div class="row__meta">${esc(p.goal || '')}${p.daysPerWeek ? ' · ' + p.daysPerWeek + ' días/semana' : ''}${count ? '' : ' · sin ejercicios cargados'}</div>
          </div>
          ${levelBadge(p.level)}
          <div class="row__action">${iconSpan('chevronRight', 16)}</div>
        </div>`;
      }).join('') : `<div class="empty"><div class="empty__title">Sin programas</div>Todavía no hay programas cargados</div>`}
    </div>
  </div>`;
}
