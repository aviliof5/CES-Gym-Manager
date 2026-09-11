/* Bolá — "Biblioteca de ejercicios" (pantalla #23 del plan, transversal a
   los 3 roles: cliente y entrenador solo la consultan, dueño/admin además
   puede agregar ejercicios propios del gimnasio — ver exercises/
   exercisesLib en supabase/migrations/20260905000300_etapa2_features_schema.sql,
   su contenido real en 20260908000200_exercise_library_real_content.sql y
   la técnica (para qué sirve, qué músculo trabaja, buenas prácticas,
   errores comunes) en 20260915000000_exercise_technique_content.sql.

   Nunca se inventa una foto real de cada ejercicio — no tenemos, y
   pretender que sí sería mentirle a quien la mira. En su lugar, cada
   ejercicio del catálogo global trae 2 ilustraciones esquemáticas
   (posición inicial/final) generadas por código a partir de su patrón de
   movimiento (ver src/diagrams.js) — un ejercicio propio que carga el
   gimnasio, sin patrón asignado, se queda con el ícono de siempre. */
'use strict';

import { state } from '../state.js';
import { iconSpan } from '../data.js';
import { esc, act, errorBanner, textField, sectionTitle } from '../helpers.js';
import { exercisePoseSvg, DIAGRAM_STAGE_LABELS } from '../diagrams.js';

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

// Las 2 ilustraciones esquemáticas (inicio/fin) de un ejercicio, una al
// lado de la otra — ver el comentario grande arriba del archivo sobre por
// qué son diagramas y no fotos. Si el ejercicio no tiene diagramPattern
// (uno propio del gimnasio, cargado sin ese dato) no se dibuja nada, en
// vez de mostrar un patrón que no le corresponde.
function techniqueDiagrams(pattern) {
  if (!pattern) return '';
  const stage = (key) => `<div style="flex:1;background:var(--surface-2);border-radius:var(--r-md);padding:10px;text-align:center">
    ${exercisePoseSvg(pattern, key, 88, 'var(--brand)')}
    <div style="font-size:10.5px;color:var(--muted);margin-top:2px">${esc(DIAGRAM_STAGE_LABELS[key])}</div>
  </div>`;
  return `<div style="display:flex;gap:10px;margin-bottom:14px">${stage('a')}${stage('b')}</div>
    <div class="hint" style="margin:-8px 0 14px;text-align:center">Ilustración esquemática de la técnica — no es una foto real</div>`;
}

function bulletList(items, color) {
  if (!items || !items.length) return '';
  return `<div style="display:flex;flex-direction:column;gap:6px">
    ${items.map(t => `<div style="display:flex;gap:8px;align-items:flex-start;font-size:var(--fs-sm);line-height:1.4">
      <span style="color:${color};flex-shrink:0;margin-top:1px">●</span><span>${esc(t)}</span>
    </div>`).join('')}
  </div>`;
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
        ${expanded.diagramPattern ? techniqueDiagrams(expanded.diagramPattern) : `<div class="thumb thumb--pending" style="width:100%;height:160px;margin-bottom:14px">${iconSpan('dumbbell', 30)}</div>`}
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
        ${expanded.purpose ? `${sectionTitle('Para qué sirve', 'zap', 'margin-bottom:6px')}<div style="font-size:var(--fs-sm);line-height:1.5;margin-bottom:16px">${esc(expanded.purpose)}</div>` : ''}
        ${expanded.muscleWorked ? `${sectionTitle('Qué músculo trabaja', 'run', 'margin-bottom:6px')}<div style="font-size:var(--fs-sm);line-height:1.5;margin-bottom:16px">${esc(expanded.muscleWorked)}</div>` : ''}
        ${expanded.bestPractices && expanded.bestPractices.length ? `${sectionTitle('Buenas prácticas', 'check', 'margin-bottom:8px')}<div style="margin-bottom:16px">${bulletList(expanded.bestPractices, 'var(--ok)')}</div>` : ''}
        ${expanded.commonMistakes && expanded.commonMistakes.length ? `${sectionTitle('Errores comunes', 'x', 'margin-bottom:8px')}<div style="margin-bottom:16px">${bulletList(expanded.commonMistakes, 'var(--danger)')}</div>` : ''}
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
    <div class="thumb thumb--pending" style="width:100%;height:90px;display:flex;align-items:center;justify-content:center">${e.diagramPattern ? exercisePoseSvg(e.diagramPattern, 'a', 56, 'var(--brand)') : iconSpan('dumbbell', 22)}</div>
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
        <input class="field" data-f="libraryQuery" data-live="true" placeholder="Buscar ejercicio…" value="${esc(state.libraryQuery)}"/>
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
