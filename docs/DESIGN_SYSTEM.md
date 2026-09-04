# Design System — Fight Club Gym Manager (propuesta, Fase 1)

Deriva de **[VISUAL_BRAND_ANALYSIS.md](VISUAL_BRAND_ANALYSIS.md)**. Formaliza los tokens que reemplazarían/extenderían los actuales de **[styles.css](../styles.css)**. No aplicado todavía — propuesta para aprobación.

## Colores

```css
:root{
  /* base */
  --color-bg:            #0A0A0A;   /* antes --bg:#0B0D10 */
  --color-surface:       #161616;   /* antes --surface:#15181C */
  --color-surface-2:     #1F1F1F;   /* antes --surface-2:#20242a */
  --color-surface-dim:   #0D0D0D;   /* antes --surface-dim:#0F1215 */
  --color-line:          rgba(255,255,255,0.08);   /* igual que hoy */

  /* texto */
  --color-text:          #FFFFFF;   /* antes #F5F6F7 */
  --color-text-soft:     #C9C9C9;
  --color-muted:         #9A9A9A;   /* antes #9AA3AC */
  --color-muted-dim:     #5C5C5C;

  /* marca / acento primario */
  --color-primary:       #E4003A;   /* rojo Fight Club — reemplaza --lime como color "hero" */
  --color-primary-dim:   rgba(228,0,58,0.15);

  /* estados funcionales (se mantienen semánticamente, se retocan para no chocar con --color-primary) */
  --color-success:       #34D399;   /* = --mint actual, sin cambios */
  --color-warning:       #FBBF24;   /* = --amber actual, sin cambios */
  --color-info:          #38BDF8;   /* = --sky actual, sin cambios */
  --color-danger:        #FF5C5C;   /* antes --red:#F87171 — corrido para diferenciarse del --color-primary */
}
```

Regla de convivencia rojo-marca / rojo-error: `--color-primary` (marca, CTAs, tabs activos) y `--color-danger` (vencido, rechazar, error) quedan deliberadamente en matices distintos (carmesí saturado vs. rojo-coral más claro) — nunca deben ser el mismo valor, o "cobrar/aprobar" y "vencido/rechazar" se vuelven visualmente indistinguibles.

## Tipografía

```css
/* Google Fonts, único origen permitido junto con fonts.gstatic.com para los woff2 */
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Inter:wght@400;600;800&display=swap');

--font-display: 'Oswald', 'Arial Narrow', sans-serif;  /* wordmark, titulares de rol, step-head */
--font-body:    'Inter', system-ui, sans-serif;         /* todo el resto — igual rol que hoy */
```

Uso: `--font-display` **solo** en el nombre de marca, el `.title` de cada pantalla y los headers de sección grandes — mantiene la legibilidad de tablas/formularios con `--font-body`, evitando el error de condensar todo el texto (ilegible en listas largas).

## Tamaños y espaciado

Se conserva la escala actual de `app.js`/`styles.css` (12px–26px en texto, radios 10–18px en tarjetas, 100px en chips/botones) — no hay evidencia en la referencia de que la densidad deba cambiar, solo la paleta y el peso tipográfico. Único ajuste: subir el `border-radius` de `.btn` de 14px a ~20-24px para acercarse a la pastilla de la referencia.

## Componentes (mapeo 1:1 con clases ya existentes en styles.css)

| Token/clase actual | Cambio propuesto |
|---|---|
| `.btn--lime` | Pasa a `.btn--primary` con `background:var(--color-primary)` |
| `.chip--lime.is-active` | `.chip--primary.is-active` con `var(--color-primary)` |
| `.avatar--lime` | `.avatar--primary` |
| `.tab.is-active` (hoy `rgba(215,255,62,0.12)` + `var(--lime)`) | `rgba(228,0,58,0.12)` + `var(--color-primary)` |
| `.badge--vencido` (`var(--red)`) | Usa `var(--color-danger)`, no `--color-primary` |
| `.gym-watermark` (hoy `color:var(--lime)`) | `color:var(--color-primary)`, ícono de marca a definir (mancuerna/puño en vez de genérico) |

`--mint`/`--amber`/`--sky` (ahora `--color-success`/`--color-warning`/`--color-info`) se conservan sin cambio de valor — ya cumplían un rol semántico claro (estado de membresía, entrenador, admin/join-flow) que no depende del rebrand.

## Bordes, sombras, estados

Sin cambios de mecánica respecto a lo actual: bordes de 1px en `--color-line`, sin sombras decorativas (la referencia tampoco usa elevación/drop-shadow, todo es plano sobre negro). Estados `:disabled`/`:focus` se mantienen con la misma lógica, recoloreados.

## Animaciones

No hay animación visible en la referencia — se mantiene el principio de "microanimaciones discretas, sin exagerar" ya implícito en el proyecto actual (no hay animaciones hoy salvo transiciones de foco). Se puede añadir una transición corta (150-200ms) en cambios de tab/estado activo al modularizar, sin comprometer rendimiento.

## Pendiente de decisión antes de tocar código

1. Confirmar el hex exacto de `--color-primary` contra la imagen fuente en alta resolución (esta propuesta usa una aproximación visual).
2. Confirmar si `owner` y `admin` comparten el mismo acento (`--color-primary`) o si el `owner` necesita un matiz propio para diferenciarse en UI compartida (recomendado: mismo rojo, diferenciados por texto/badge "Dueño" vs "Admin", no por color — para no fragmentar la paleta).
3. Confirmar fuente de titulares (`Oswald` vs `Bebas Neue` vs `Anton`) con una muestra renderizada antes de comprometerse.
