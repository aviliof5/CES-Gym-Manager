/* Bolá — ilustraciones esquemáticas de técnica para la biblioteca de
   ejercicios (src/screens/library.js). NO son fotos — no tenemos fotos
   reales de cada ejercicio, y nunca se inventa una foto que parezca real
   (mismo criterio que achievementBadge() en helpers.js). Son diagramas de
   figura de palitos, generados por código, agrupados por PATRÓN de
   movimiento (sentadilla, bisagra de cadera, empuje horizontal, etc.) — 21
   patrones cubren los 90 ejercicios del catálogo, cada uno con 2 etapas
   (inicio/fin del recorrido) que se calculan a partir de unos pocos
   ángulos articulares, no de coordenadas sueltas, para que las
   proporciones del cuerpo siempre queden consistentes.

   Cada ejercicio de la biblioteca guarda su `diagramPattern` (columna
   diagram_pattern, ver 20260915000000_exercise_technique_content.sql). Si
   algún ejercicio no tiene patrón asignado (ej. uno propio que cargó el
   gimnasio), se usa 'generic' — una figura neutra parada. */

// Ángulos en grados: torso (0=derecho, + inclina adelante), thigh/shin
// (0=recto hacia abajo, + rota adelante), arm (0=brazo pegado al cuerpo
// hacia abajo, 90=adelante horizontal, 180=arriba). elbowAngle, si está
// presente, dobla el antebrazo desde el codo con la misma convención.
const POSES = {
  squat: { a: { hipY: 58, torso: 5, thigh: 5, shin: 5, arm: 15 }, b: { hipY: 84, torso: 30, thigh: 62, shin: -15, arm: 70 } },
  hinge: { a: { hipY: 58, torso: 5, thigh: 5, shin: 5, arm: 10 }, b: { hipX: 36, hipY: 62, torso: 68, thigh: 12, shin: 2, arm: 80 } },
  lunge: { a: { hipY: 58, torso: 5, thigh: 18, shin: -5, arm: 10 }, b: { hipY: 76, torso: 10, thigh: 45, shin: -45, arm: 10 } },
  leg_machine: { a: { hipX: 46, hipY: 60, torso: 0, thigh: 80, shin: 0, arm: 10 }, b: { hipX: 46, hipY: 60, torso: 0, thigh: 80, shin: 80, arm: 10 } },
  horizontal_press: { a: { hipY: 58, torso: 5, thigh: 5, shin: 5, arm: 100, elbow: 205 }, b: { hipY: 58, torso: 5, thigh: 5, shin: 5, arm: 88, elbow: 92 } },
  incline_press: { a: { hipY: 58, torso: 5, thigh: 5, shin: 5, arm: 75, elbow: 195 }, b: { hipY: 58, torso: 5, thigh: 5, shin: 5, arm: 60, elbow: 65 } },
  chest_fly: { a: { hipY: 58, torso: 5, thigh: 5, shin: 5, arm: -55 }, b: { hipY: 58, torso: 5, thigh: 5, shin: 5, arm: 90 } },
  vertical_press: { a: { hipY: 58, torso: 5, thigh: 5, shin: 5, arm: 95, elbow: 210 }, b: { hipY: 58, torso: 5, thigh: 5, shin: 5, arm: 172, elbow: 172 } },
  pull_vertical: { a: { hipY: 55, torso: 0, thigh: 5, shin: 5, arm: 172 }, b: { hipY: 55, torso: 0, thigh: 5, shin: 5, arm: 80, elbow: 195 } },
  pull_horizontal: { a: { hipX: 40, hipY: 60, torso: 45, thigh: 10, shin: 0, arm: 80 }, b: { hipX: 40, hipY: 60, torso: 45, thigh: 10, shin: 0, arm: 55, elbow: 205 } },
  lateral_raise: { a: { hipY: 58, torso: 5, thigh: 5, shin: 5, arm: 10 }, b: { hipY: 58, torso: 5, thigh: 5, shin: 5, arm: 88 } },
  curl_arm: { a: { hipY: 58, torso: 5, thigh: 5, shin: 5, arm: 15, elbow: 15 }, b: { hipY: 58, torso: 5, thigh: 5, shin: 5, arm: 15, elbow: 175 } },
  triceps: { a: { hipY: 58, torso: 5, thigh: 5, shin: 5, arm: 172, elbow: 60 }, b: { hipY: 58, torso: 5, thigh: 5, shin: 5, arm: 172, elbow: 172 } },
  plank: { a: { hipX: 42, hipY: 88, torso: -72, thigh: 70, shin: 70, arm: 15 }, b: { hipX: 42, hipY: 86, torso: -75, thigh: 75, shin: 75, arm: 10 } },
  crunch: { a: { hipX: 55, hipY: 96, torso: -88, thigh: 105, shin: -68, arm: 100 }, b: { hipX: 55, hipY: 92, torso: -50, thigh: 105, shin: -68, arm: 80 } },
  cardio_dynamic: { a: { hipY: 58, torso: 5, thigh: 5, shin: 5, arm: 10 }, b: { hipY: 52, torso: 5, thigh: 32, shin: 5, arm: 172 } },
  cardio_machine: { a: { hipY: 58, torso: 8, thigh: 22, shin: -10, arm: -20 }, b: { hipY: 58, torso: 8, thigh: -18, shin: 10, arm: 30 } },
  carry: { a: { hipY: 58, torso: 3, thigh: 16, shin: -8, arm: 5 }, b: { hipY: 58, torso: 3, thigh: -16, shin: 8, arm: 5 } },
  explosive: { a: { hipY: 80, torso: 32, thigh: 60, shin: -12, arm: 55 }, b: { hipY: 48, torso: 0, thigh: 5, shin: 5, arm: 172 } },
  boxing: { a: { hipY: 58, torso: 5, thigh: 10, shin: -5, arm: 90, elbow: 200 }, b: { hipY: 58, torso: 16, thigh: 10, shin: -5, arm: 90, elbow: 95 } },
  mobility: { a: { hipY: 58, torso: 10, thigh: 10, shin: 5, arm: 20 }, b: { hipX: 42, hipY: 62, torso: 42, thigh: 40, shin: 5, arm: 85 } },
  generic: { a: { hipY: 58, torso: 4, thigh: 4, shin: 4, arm: 8 }, b: { hipY: 58, torso: 4, thigh: 4, shin: 4, arm: 40 } },
};

export const DIAGRAM_STAGE_LABELS = { a: 'Posición inicial', b: 'Posición final' };

const LEN = { torso: 30, thigh: 26, shin: 24, upperArm: 16, foreArm: 16, straightArm: 30, headR: 6.5 };

function pt(x, y, len, deg) {
  const r = (deg * Math.PI) / 180;
  return [x + len * Math.sin(r), y + len * Math.cos(r)];
}

// Convierte los ángulos de una pose en los puntos (x,y) de cada
// articulación — largos de segmento fijos, así el cuerpo siempre queda
// proporcionado sin importar qué patrón sea.
function joints(p) {
  const hip = [p.hipX != null ? p.hipX : 50, p.hipY];
  // El torso va "hacia arriba" (180 - ángulo) en vez de "hacia abajo" (el
  // ángulo solo) como los demás segmentos, pero con la misma convención de
  // que un ángulo positivo inclina hacia adelante (+x).
  const shoulder = pt(hip[0], hip[1], LEN.torso, 180 - p.torso);
  const head = pt(shoulder[0], shoulder[1], LEN.headR + 4, 180 - p.torso);
  const knee = pt(hip[0], hip[1], LEN.thigh, p.thigh);
  const foot = pt(knee[0], knee[1], LEN.shin, p.shin);
  let elbow = null, hand;
  if (p.elbow != null) {
    elbow = pt(shoulder[0], shoulder[1], LEN.upperArm, p.arm);
    hand = pt(elbow[0], elbow[1], LEN.foreArm, p.elbow);
  } else {
    hand = pt(shoulder[0], shoulder[1], LEN.straightArm, p.arm);
  }
  return { hip, shoulder, head, knee, foot, elbow, hand };
}

// `size` en px (cuadrado). `stage` 'a' o 'b'. `accent` es un color CSS
// (var(--brand) por defecto) — el trazo de la figura.
export function exercisePoseSvg(patternKey, stage, size, accent) {
  const pattern = POSES[patternKey] || POSES.generic;
  const p = pattern[stage] || pattern.a;
  const j = joints(p);
  const color = accent || 'var(--brand)';
  const limb = (a, b) => `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
  const armPath = j.elbow
    ? limb(j.shoulder, j.elbow) + limb(j.elbow, j.hand)
    : limb(j.shoulder, j.hand);
  return `<svg viewBox="0 -18 100 140" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <line x1="8" y1="118" x2="92" y2="118" stroke="${color}" stroke-width="2" stroke-opacity="0.25" stroke-linecap="round"/>
    ${limb(j.hip, j.shoulder)}
    ${limb(j.hip, j.knee)}${limb(j.knee, j.foot)}
    ${armPath}
    <circle cx="${j.head[0].toFixed(1)}" cy="${j.head[1].toFixed(1)}" r="${LEN.headR}" fill="none" stroke="${color}" stroke-width="4"/>
  </svg>`;
}
