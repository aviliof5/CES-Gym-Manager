# Prompt para generar medallas de logros (Google Flow)

Plantilla para generar las imágenes de los 1003 logros de Fight Club Gym Manager
en Google Flow (Imagen). Reemplazá los campos entre `[ ]` por cada logro y
generá una imagen por combinación de **categoría + tier** que necesites
(no hace falta una por cada uno de los 1003 logros — con 1 por categoría×tier
alcanza, ver nota al final).

## Prompt base

```
Diseña un ícono de insignia/medalla circular para una app de gimnasio, estilo
ilustración vectorial plana (flat design), NO fotorrealista, NO una foto.

Formato: imagen cuadrada, fondo completamente transparente (PNG con canal alpha).
Tamaño de lienzo: 512x512 px. Resolución: 512x512 (1x) — el ícono debe verse
nítido también reducido a 56x56 px, así que usá formas simples y gruesas,
sin detalles finos ni texto.

Composición: un disco circular centrado que ocupa ~90% del lienzo, con un
borde metálico fino y un símbolo simple centrado dentro que representa la
categoría: [CATEGORÍA DEL LOGRO — ej: constancia/racha de entrenamientos,
fuerza/levantamiento de pesas, cardio/correr, medidas corporales/cinta
métrica, clases grupales/calendario].

Paleta y acabado según el nivel del logro: [TIER — bronce: tonos cobre/marrón
#8a5a3c a #d9a066; plata: gris claro #9098a3 a #e2e6ec; oro: dorado #c9932c
a #ffd968; platino: turquesa #4fa8ae a #bdf4f0; diamante: violeta #6a5ce8 a
#c9baff], con un degradé suave de ese color en el disco y un leve brillo
especular arriba a la izquierda, como una medalla deportiva.

Estilo general: minimalista, geométrico, colores planos con degradé sutil,
sin sombras realistas, sin texturas fotográficas, sin personas ni rostros,
sin marcas de agua ni texto. El resultado debe leerse como un ícono de logro
de videojuego/app fitness, no como una fotografía ni un render 3D realista.
```

## Campos a completar por generación

| Placeholder | Valores posibles (categorías reales de la app) |
|---|---|
| `[CATEGORÍA DEL LOGRO]` | Constancia (llama/racha) · Fuerza (mancuerna) · Cardio (persona corriendo) · Medidas (cinta métrica/regla) · Clases (calendario) |
| `[TIER]` | Bronce · Plata · Oro · Platino · Diamante |

## Nota

La app ya arma un ícono en 1003 variantes combinando **categoría** (5) ×
**tier** (5 bandas) mediante SVG generado en código
([src/helpers.js](../src/helpers.js) → `achievementBadge()`), así que en
Flow alcanza con generar como máximo **5 categorías × 5 tiers = 25 imágenes**
para cubrir todos los logros — no 1003. Si el resultado se ve mejor que el
SVG actual, se reemplaza el ícono generado en código por estas 25 imágenes
(subidas como assets), no una por logro.
