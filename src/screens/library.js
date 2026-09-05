/* Bolá — "Biblioteca de ejercicios" (pantalla #23 del plan, transversal a
   los 3 roles: cliente y entrenador solo la consultan, dueño/admin además
   puede agregar ejercicios propios del gimnasio — ver exercises/
   exercisesLib en supabase/migrations/20260905000300_etapa2_features_schema.sql).
   Las fotos quedan con espacio reservado (.thumb--pending): el dueño las
   mandará más adelante, nunca se inventa una imagen. */
'use strict';

import { state } from '../state.js';
import { iconSpan } from '../data.js';
import { esc, act, errorBanner, textField, sectionTitle } from '../helpers.js';

export function viewExerciseLibrary() {
  const isStaff = !!(state.myProfile && (state.myProfile.role === 'owner' || state.myProfile.role === 'admin'));
  const query = state.libraryQuery.trim().toLowerCase();
  const muscleFilter = state.libraryMuscleFilter;
  const muscles = ['todos', ...new Set(state.exercisesLib.map(e => e.muscleGroup))];

  const filtered = state.exercisesLib.filter(e =>
    (muscleFilter === 'todos' || e.muscleGroup === muscleFilter) &&
    (!query || e.name.toLowerCase().includes(query)));

  const cards = filtered.map(e => `<div>
    <div class="thumb thumb--pending" style="width:100%;height:90px">${iconSpan('dumbbell', 22)}</div>
    <div style="font-size:var(--fs-sm);font-weight:700;margin-top:6px">${esc(e.name)}</div>
    <div style="font-size:var(--fs-xs);color:var(--muted)">${esc(e.muscleGroup)}${e.equipmentName ? ' · ' + esc(e.equipmentName) : ''}</div>
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
      <div class="seg">${muscles.map(m => `<div ${act('setLibraryMuscleFilter', m)} class="seg__item${muscleFilter === m ? ' is-active' : ''}">${esc(m === 'todos' ? 'Todos' : m)}</div>`).join('')}</div>
      ${filtered.length
        ? `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">${cards}</div>`
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
