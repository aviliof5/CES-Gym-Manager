/* Bolá — Fight Club Training Engine: formulario de evaluación del cliente
   (Fase 3, ver docs/FIGHT_CLUB_TRAINING_ENGINE_AUDIT.md).

   Se abre al tocar "Generar rutina con IA" en la pestaña Rutina (pantalla
   'clientEvaluation'). 8 pasos, uno por tema, con explicación en cada
   pregunta (pedido §4). Al terminar guarda en training_profiles /
   client_exercise_preferences / client_limitations (migración
   20260917000000) y — hasta que el motor real esté (Fases 6-8) — corre el
   generador actual (buildRoutine), así la rutina sigue saliendo.

   NADA de esto es diagnóstico médico. Las lesiones/dolores son
   restricciones conservadoras para el generador (pedido §11, §31). */
'use strict';

import { state } from '../state.js';
import { esc, act, errorBanner, textField, stepBars } from '../helpers.js';
import {
  EVAL_GOALS, EVAL_TIME_BUCKETS, EVAL_COMFORT, EVAL_DAYS, EVAL_SESSION_MINUTES,
  EVAL_STYLES, EVAL_PRIORITY_MUSCLES, EVAL_JOINTS, EVAL_SOMATOTYPES, EVAL_SEX,
  EVAL_TOTAL_STEPS, iconSpan,
} from '../data.js';

// El dispatcher (router.js) parte data-a en ":" y descarta data-v — así que
// para "setear el campo X al valor Y" el patrón es data-a="evalSet:X:Y"
// (ver ACTIONS.evalSet). setAction() arma ese string.
function setAction(field, value) { return `evalSet:${field}:${value}`; }

// Una grilla de opciones tipo "tarjeta" (radio). `selected` es un id.
function optionCards(options, selected, field) {
  return `<div style="display:flex;flex-direction:column;gap:8px">
    ${options.map(o => `<div ${act(setAction(field, o.id))} class="row" style="cursor:pointer;margin-bottom:0;${selected === o.id ? 'border-color:var(--action);background:var(--action-dim)' : ''}">
      <div class="row__body">
        <div class="row__title">${esc(o.label)}</div>
        ${o.hint ? `<div class="row__meta" style="white-space:normal;line-height:1.4">${esc(o.hint)}</div>` : ''}
      </div>
      ${selected === o.id ? `<div style="width:20px;height:20px;border-radius:50%;background:var(--action);display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0">${iconSpan('check', 12)}</div>` : ''}
    </div>`).join('')}
  </div>`;
}

// Chips compactos (radio) para listas cortas: sexo, días, minutos, somatotipo.
function chipRow(options, selected, field, opts = {}) {
  return `<div style="display:flex;flex-wrap:wrap;gap:8px">
    ${options.map(o => {
      const id = typeof o === 'object' ? o.id : o;
      const label = typeof o === 'object' ? o.label : (opts.suffix ? `${o} ${opts.suffix}` : o);
      return `<div ${act(setAction(field, id))} class="chip chip--action${String(selected) === String(id) ? ' is-active' : ''}">${esc(label)}</div>`;
    }).join('')}
  </div>`;
}

// Chips multi (toggle) — usan su propia acción (sin ":" interno, así data-v vale).
function chipMulti(options, selectedArr, action) {
  return `<div style="display:flex;flex-wrap:wrap;gap:8px">
    ${options.map(o => `<div ${act(action, o.id)} class="chip chip--action${selectedArr.includes(o.id) ? ' is-active' : ''}">${esc(o.label)}</div>`).join('')}
  </div>`;
}

function stepTitle(t, sub) {
  return `<div class="title" style="font-size:20px;margin-bottom:4px">${esc(t)}</div>
    ${sub ? `<div class="subtitle" style="margin-bottom:18px">${esc(sub)}</div>` : '<div style="height:14px"></div>'}`;
}

function eyebrow(t) { return `<div class="eyebrow" style="margin:16px 0 8px">${esc(t)}</div>`; }

function renderStep(d) {
  switch (state.evalStep) {
    case 1:
      return `${stepTitle('Tus datos', 'Todo opcional menos que sepas tu peso y altura — nos ayuda a calibrar la rutina.')}
        <div style="display:flex;gap:10px;margin-bottom:14px">
          ${textField('evalDraft.weight', 'Peso (kg)', d.weight, { style: 'flex:1' })}
          ${textField('evalDraft.height', 'Altura (cm)', d.height, { style: 'flex:1' })}
        </div>
        ${textField('evalDraft.age', 'Edad', d.age, { style: 'margin-bottom:8px' })}
        ${eyebrow('Sexo')}
        ${chipRow(EVAL_SEX, d.sex, 'sex')}
        ${eyebrow('Tipo de cuerpo (opcional — solo de referencia)')}
        <div class="hint" style="margin-bottom:8px">No decide la rutina; el motor se guía por tu objetivo, nivel y rendimiento real.</div>
        ${chipRow(EVAL_SOMATOTYPES, d.somatotype, 'somatotype')}
        ${d.somatotype ? `<div class="hint" style="margin-top:6px">${esc((EVAL_SOMATOTYPES.find(s => s.id === d.somatotype) || {}).hint || '')}</div>` : ''}`;

    case 2: {
      const secOpts = EVAL_GOALS.filter(g => g.id !== d.primaryGoal);
      return `${stepTitle('¿Cuál es tu objetivo principal?', 'El que más te importa. Todo lo demás se acomoda alrededor de esto.')}
        ${optionCards(EVAL_GOALS, d.primaryGoal, 'primaryGoal')}
        ${d.primaryGoal ? `
          ${eyebrow('¿Y un objetivo secundario? (opcional)')}
          <div class="hint" style="margin-bottom:8px">Algo que también te gustaría, sin que le quite prioridad al principal.</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <div ${act('evalSet:secondaryGoal:')} class="chip chip--action${!d.secondaryGoal ? ' is-active' : ''}">Ninguno</div>
            ${secOpts.map(g => `<div ${act('evalSet:secondaryGoal:' + g.id)} class="chip chip--action${d.secondaryGoal === g.id ? ' is-active' : ''}">${esc(g.label)}</div>`).join('')}
          </div>` : ''}`;
    }

    case 3:
      return `${stepTitle('Tu experiencia', 'Con esto definimos qué tan complejos y exigentes pueden ser los ejercicios.')}
        ${eyebrow('¿Cuánto hace que entrenás?')}
        ${optionCards(EVAL_TIME_BUCKETS, d.trainingTimeBucket, 'trainingTimeBucket')}
        ${eyebrow('¿Qué tan cómodo te sentís usando máquinas y pesas?')}
        ${optionCards(EVAL_COMFORT, d.machineComfort, 'machineComfort')}`;

    case 4:
      return `${stepTitle('Tu disponibilidad', 'Afecta directamente cuántos ejercicios entran y cómo se reparten en la semana.')}
        ${eyebrow('¿Cuántos días por semana podés entrenar?')}
        ${chipRow(EVAL_DAYS, d.daysPerWeek, 'daysPerWeek', { suffix: 'días' })}
        ${eyebrow('¿Cuánto tiempo tenés por sesión?')}
        ${chipRow(EVAL_SESSION_MINUTES.map(m => ({ id: m, label: m >= 90 ? '90+ min' : `${m} min` })), d.sessionMinutes, 'sessionMinutes')}
        <div class="hint" style="margin-top:10px">No vamos a armar una rutina que no entre en el tiempo que tenés.</div>`;

    case 5:
      return `${stepTitle('Tus preferencias', 'Las respetamos siempre que no choquen con tu objetivo o tu equipo disponible.')}
        ${eyebrow('¿Qué tipo de entrenamiento preferís?')}
        ${optionCards(EVAL_STYLES, d.preferredStyle, 'preferredStyle')}
        ${eyebrow('¿Qué músculos querés priorizar? (opcional, varios)')}
        <div class="hint" style="margin-bottom:8px">Les damos un poco más de volumen. Elegí 1 o 2 para que tenga efecto real.</div>
        ${chipMulti(EVAL_PRIORITY_MUSCLES, d.priorityMuscles, 'evalToggleMuscle')}`;

    case 6: {
      const q = state.evalExerciseQuery.trim().toLowerCase();
      const lib = (state.exercisesLib || []).filter(e => e.isActive !== false);
      const excludedIds = new Set(state.evalExcluded.map(x => x.exerciseId));
      const shown = (q ? lib.filter(e => e.name.toLowerCase().includes(q)) : lib).slice(0, 40);
      return `${stepTitle('¿Hay ejercicios que no querés hacer?', 'Buscá y marcá los que preferís evitar. El motor los reemplaza por una alternativa que trabaje lo mismo.')}
        <div class="search" style="margin-bottom:10px">
          <span class="search__icon">${iconSpan('dumbbell', 16)}</span>
          <input class="field" data-f="evalExerciseQuery" placeholder="Buscar ejercicio…" value="${esc(state.evalExerciseQuery)}"/>
        </div>
        ${state.evalExcluded.length ? `<div class="hint" style="margin-bottom:8px">${state.evalExcluded.length} marcado${state.evalExcluded.length === 1 ? '' : 's'} para evitar</div>` : ''}
        <div style="display:flex;flex-direction:column;gap:6px">
          ${shown.map(e => {
            const on = excludedIds.has(e.id);
            return `<div ${act('evalToggleExcluded', e.id)} class="row" style="cursor:pointer;margin-bottom:0;${on ? 'border-color:var(--danger);background:var(--danger-dim)' : ''}">
              <div style="width:20px;height:20px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:${on ? 'var(--danger)' : 'transparent'};border:1px solid ${on ? 'transparent' : 'var(--line-strong)'};color:#fff">${on ? iconSpan('x', 12) : ''}</div>
              <div class="row__body"><div class="row__title" style="font-size:13.5px">${esc(e.name)}</div><div class="row__meta">${esc(e.muscleGroup)}</div></div>
            </div>`;
          }).join('')}
        </div>
        ${!shown.length ? `<div class="empty"><div class="empty__title">Sin resultados</div>Probá con otro nombre</div>` : ''}`;
    }

    case 7: {
      const joints = d.limitationJoints;
      return `${stepTitle('Lesiones o molestias', 'Nos ayuda a evitar ejercicios poco adecuados para vos.')}
        <div class="alert alert--warn" style="margin-bottom:16px"><div class="alert__text">Fight Club Training Engine no diagnostica lesiones ni reemplaza la evaluación de un profesional de la salud. Ante una lesión, consultá con un profesional.</div></div>
        ${eyebrow('¿Tenés alguna lesión, dolor o limitación? (varias, o ninguna)')}
        ${chipMulti(EVAL_JOINTS, joints, 'evalToggleJoint')}
        ${eyebrow('¿Algún movimiento te causa dolor actualmente?')}
        <div style="display:flex;gap:8px;margin-bottom:${d.hasPain === true ? '12px' : '0'}">
          <div ${act('evalSet:hasPain:si')} class="chip chip--action${d.hasPain === true ? ' is-active' : ''}">Sí</div>
          <div ${act('evalSet:hasPain:no')} class="chip chip--action${d.hasPain === false ? ' is-active' : ''}">No</div>
        </div>
        ${d.hasPain === true ? textField('evalPainfulNote', 'Contanos qué movimiento (ej. "sentadilla profunda", "press por encima de la cabeza")', state.evalPainfulNote) : ''}`;
    }

    case 8: {
      const goalLabel = id => (EVAL_GOALS.find(g => g.id === id) || {}).label || '—';
      const row = (k, v) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);font-size:13px">
        <span style="color:var(--muted)">${esc(k)}</span><span style="text-align:right;font-weight:600">${esc(v || '—')}</span></div>`;
      const muscles = d.priorityMuscles.map(m => (EVAL_PRIORITY_MUSCLES.find(x => x.id === m) || {}).label).filter(Boolean).join(', ');
      const jointLabels = d.limitationJoints.map(j => (EVAL_JOINTS.find(x => x.id === j) || {}).label).filter(Boolean).join(', ');
      return `${stepTitle('Revisá tu evaluación', 'Si algo no está bien, tocá "Ajustar" y volvé al paso que quieras.')}
        <div class="card" style="margin-bottom:16px">
          ${row('Objetivo principal', goalLabel(d.primaryGoal))}
          ${d.secondaryGoal ? row('Objetivo secundario', goalLabel(d.secondaryGoal)) : ''}
          ${row('Experiencia', (EVAL_TIME_BUCKETS.find(t => t.id === d.trainingTimeBucket) || {}).label)}
          ${row('Comodidad', (EVAL_COMFORT.find(c => c.id === d.machineComfort) || {}).label)}
          ${row('Días por semana', d.daysPerWeek ? `${d.daysPerWeek} días` : '')}
          ${row('Tiempo por sesión', d.sessionMinutes ? `${d.sessionMinutes} min` : '')}
          ${row('Estilo preferido', (EVAL_STYLES.find(s => s.id === d.preferredStyle) || {}).label)}
          ${muscles ? row('Priorizar', muscles) : ''}
          ${state.evalExcluded.length ? row('Ejercicios a evitar', `${state.evalExcluded.length}`) : ''}
          ${jointLabels ? row('Cuidar', jointLabels) : ''}
        </div>
        <div class="hint" style="margin-bottom:4px">Al generar, guardamos tu evaluación y armamos tu rutina con lo que tiene tu gimnasio.</div>`;
    }
    default:
      return '';
  }
}

// El botón "Siguiente" se habilita solo cuando el paso actual tiene lo mínimo.
function canAdvance(d) {
  switch (state.evalStep) {
    case 2: return !!d.primaryGoal;
    case 3: return !!d.trainingTimeBucket && !!d.machineComfort;
    case 4: return !!d.daysPerWeek && !!d.sessionMinutes;
    case 5: return !!d.preferredStyle;
    default: return true;
  }
}

export function viewClientEvaluation() {
  const d = state.evalDraft;
  const last = state.evalStep >= EVAL_TOTAL_STEPS;
  return `<div class="col">
    <div class="step-head" style="justify-content:space-between">
      <div class="back" ${act('closeEvaluation')}>&lsaquo;</div>
      <div class="step-label">Evaluación · paso ${state.evalStep} de ${EVAL_TOTAL_STEPS}</div>
      <div style="width:32px"></div>
    </div>
    ${stepBars(state.evalStep, EVAL_TOTAL_STEPS, '')}
    <div class="form-body">
      ${errorBanner()}
      ${renderStep(d)}
    </div>
    <div class="form-foot" style="display:flex;gap:10px">
      ${state.evalStep > 1 ? `<button class="btn btn--ghost" style="flex:1" ${act('evalBack')}>Atrás</button>` : ''}
      ${last
        ? `<button class="btn btn--action" style="flex:2" ${act('saveEvaluationAndGenerate')} ${state.busy ? 'disabled' : ''}>${state.busy ? 'Generando…' : 'Generar mi rutina'}</button>`
        : `<button class="btn btn--action" style="flex:2" ${act('evalNext')} ${canAdvance(d) ? '' : 'disabled'}>Siguiente</button>`}
    </div>
  </div>`;
}
