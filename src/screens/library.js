/* Bolá — "Biblioteca de ejercicios" (pantalla #23 del plan, transversal a
   los 3 roles: cliente y entrenador solo la consultan, dueño/admin además
   puede agregar ejercicios propios del gimnasio — ver exercises/
   exercisesLib en supabase/migrations/20260905000300_etapa2_features_schema.sql
   y su contenido real en 20260908000200_exercise_library_real_content.sql).
   Las fotos quedan con espacio reservado (.thumb--pending): el dueño las
   mandará más adelante, nunca se inventa una imagen. */
'use strict';

import { state } from '../state.js';
import { iconSpan } from '../data.js';
import { esc, act, errorBanner, textField, sectionTitle } from '../helpers.js';

const LEVEL_ORDER = ['Principiante', 'Intermedio', 'Avanzado'];
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

function formatRestShort(seconds) {
  if (!seconds) return null;
  return `${seconds} s`;
}

export function viewExerciseLibrary() {
  const isStaff = !!(state.myProfile && (state.myProfile.role === 'owner' || state.myProfile.role === 'admin'));
  const lib = state.exercisesLib || [];
  const expanded = state.libraryExpandedId ? lib.find(e => e.id === state.libraryExpandedId) : null;

  if (expanded) {
    const rest = formatRestShort(expanded.suggestedRestSeconds);
    return `<div class="col">
      <div class="step-head" style="justify-content:space-between">
        <div class="back" ${act('closeLibraryDetail')}>&lsaquo;</div>
        <div class="step-label">${esc(expanded.name)}</div>
        <div style="width:32px"></div>
      </div>
      <div class="form-body">
        <div class="thumb thumb--pending" style="width:100%;height:160px;margin-bottom:14px">${iconSpan('dumbbell', 30)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
          ${levelBadge(expanded.level)}
          <span class="badge" style="background:rgba(255,255,255,0.08);color:var(--muted)">${esc(expanded.muscleGroup)}</span>
          ${expanded.kind ? `<span class="badge" style="background:rgba(255,255,255,0.08);color:var(--muted)">${esc(expanded.kind)}</span>` : ''}
        </div>
        ${expanded.equipmentName ? `<div class="hint" style="margin-bottom:10px">${iconSpan('dumbbell', 13)} ${esc(expanded.equipmentName)}</div>` : ''}
        ${expanded.description ? `<div style="font-size:var(--fs-sm);line-height:1.5;margin-bottom:16px">${esc(expanded.description)}</div>` : ''}
        ${(expanded.suggestedSets || expanded.suggestedReps || rest) ? `<div class="stat-grid" style="margin-bottom:16px">
          ${expanded.suggestedSets ? `<div class="stat"><div class="stat__label">Series</div><div class="stat__value">${esc(expanded.suggestedSets)}</div></div>` : ''}
          ${expanded.suggestedReps ? `<div class="stat"><div class="stat__label">Repeticiones</div><div class="stat__value" style="font-size:18px">${esc(expanded.suggestedReps)}</div></div>` : ''}
          ${rest ? `<div class="stat"><div class="stat__label">Descanso</div><div class="stat__value" style="font-size:18px">${esc(rest)}</div></div>` : ''}
        </div>` : ''}
        ${expanded.goal ? `<div class="hint" style="margin-bottom:16px">Objetivo: ${esc(expanded.goal)}</div>` : ''}
        <div class="alert alert--warn"><div class="alert__text">Detené el ejercicio ante dolor agudo. Adaptá carga, rango y variante al nivel de cada persona.</div></div>
      </div>
    </div>`;
  }

  const query = state.libraryQuery.trim().toLowerCase();
  const muscleFilter = state.libraryMuscleFilter;
  const levelFilter = state.libraryLevelFilter;
  const muscles = ['todos', ...new Set(lib.map(e => e.muscleGroup))];
  const levels = ['todos', ...LEVEL_ORDER.filter(l => lib.some(e => e.level === l))];

  const filtered = lib.filter(e =>
    (muscleFilter === 'todos' || e.muscleGroup === muscleFilter) &&
    (levelFilter === 'todos' || e.level === levelFilter) &&
    (!query || e.name.toLowerCase().includes(query)));

  const cards = filtered.map(e => `<div ${act('openLibraryDetail', e.id)} style="cursor:pointer">
    <div class="thumb thumb--pending" style="width:100%;height:90px">${iconSpan('dumbbell', 22)}</div>
    <div style="font-size:var(--fs-sm);font-weight:700;margin-top:6px">${esc(e.name)}</div>
    <div style="font-size:var(--fs-xs);color:var(--muted)">${esc(e.muscleGroup)}${e.equipmentName ? ' · ' + esc(e.equipmentName) : ''}</div>
    ${e.level ? `<div style="margin-top:4px">${levelBadge(e.level)}</div>` : ''}
  </div>`).join('');

  const d = state.libraryDraft;

  return `<div class="col">
    <div class="step-head" style="justify-content:space-between">
      <div class="back" ${act('closeExerciseLibrary')}>&lsaquo;</div>
      <div class="step-label">Biblioteca de ejercicios</div>
      <div style="width:32px"></div>
    </div>
    <div class="form-body">
      ${errorBanner()}
      <div class="search">
        <span class="search__icon">${iconSpan('dumbbell', 16)}</span>
        <input class="field" data-f="libraryQuery" placeholder="Buscar ejercicio…" value="${esc(state.libraryQuery)}"/>
      </div>
      ${levels.length > 2 ? `<div class="seg">${levels.map(l => `<div ${act('setLibraryLevelFilter', l)} class="seg__item${levelFilter === l ? ' is-active' : ''}">${esc(l === 'todos' ? 'Todos los niveles' : l)}</div>`).join('')}</div>` : ''}
      <div class="seg">${muscles.map(m => `<div ${act('setLibraryMuscleFilter', m)} class="seg__item${muscleFilter === m ? ' is-active' : ''}">${esc(m === 'todos' ? 'Todos' : m)}</div>`).join('')}</div>
      ${filtered.length
        ? `<div class="hint" style="margin-bottom:10px">${filtered.length} ejercicio${filtered.length === 1 ? '' : 's'} · tocá uno para ver la técnica</div>
           <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">${cards}</div>`
        : `<div class="empty"><div class="empty__title">Sin resultados</div>Nadie coincide con esa búsqueda/filtro</div>`}
      ${isStaff ? `
        ${sectionTitle('Agregar ejercicio propio', 'plus', 'margin-bottom:8px')}
        <div class="hint" style="margin-bottom:10px">Se suma al catálogo de tu gimnasio, además del catálogo global</div>
        <div class="card">
          ${textField('libraryDraft.name', 'Nombre del ejercicio *', d.name, { style: 'margin-bottom:10px' })}
          ${textField('libraryDraft.muscleGroup', 'Grupo muscular (ej. Piernas)', d.muscleGroup, { style: 'margin-bottom:10px' })}
          ${textField('libraryDraft.equipmentName', 'Equipo necesario (opcional)', d.equipmentName, { style: 'margin-bottom:10px' })}
          ${textField('libraryDraft.description', 'Descripción (opcional)', d.description, { style: 'margin-bottom:10px' })}
          <button class="btn btn--brand" style="width:100%;padding:12px;font-size:13px" ${act('addLibraryExercise')} ${!d.name.trim() ? 'disabled' : ''}>${state.busy ? 'Agregando…' : '+ Agregar a la biblioteca'}</button>
        </div>` : ''}
    </div>
  </div>`;
}
