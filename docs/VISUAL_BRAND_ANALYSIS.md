# Análisis visual — referencia "Fight Club Gym"

Basado en la imagen adjunta (mockup de marketing de una app "Fight Club Gym": pantalla promocional a la izquierda con logo + fotografía de boxeador, 9 capturas de pantalla de una app de gimnasio en el centro, lista de features a la derecha).

## 1. Qué transmite la imagen

Un gimnasio de boxeo/combate urbano, agresivo pero cuidado — no un gimnasio genérico de pesas. La composición completa (logo con corona, tipografía condensada en mayúsculas, fotografía de alto contraste de un boxeador de espaldas) comunica **disciplina, intensidad y estatus** ("todo en una app", "tu gym, tu estilo"). Es una marca que se quiere sentir *premium dentro de lo urbano* — no lujo clásico, sino calle con producción cuidada.

## 2. Elementos visuales a conservar

- **Fondo negro puro** en toda la interfaz (no un gris-azulado como el `--bg` actual de CES).
- **Un único color de acento saturado** (rojo/carmesí) que hace todo el trabajo de jerarquía visual — botones primarios, tabs activos, cifras destacadas, bordes de tarjeta seleccionada.
- **Contraste extremo blanco/negro** para tipografía y fotografía — nada de grises intermedios en los textos principales.
- **Tipografía condensada, en mayúsculas, de trazo grueso** para títulos y wordmark.
- **Botones en pastilla** (`border-radius` muy alto, casi cápsula) — el primario relleno de rojo, el secundario en outline blanco/gris sobre negro.
- **Tarjetas oscuras con esquinas redondeadas moderadas** (no tan extremas como los botones), separadas por espacio en blanco negro, no por bordes gruesos.
- **Iconografía lineal simple**, minimalista, blanco sobre negro, con el acento rojo solo en el ítem activo.
- **Un elemento gráfico de marca discreto** (la corona) que puede reaparecer como watermark, igual que el gym-watermark que ya existe en el CSS actual.

## 3. Colores identificados

| Uso | Color aproximado | Hex de referencia |
|---|---|---|
| Fondo base | Negro puro / casi puro | `#0A0A0A` – `#000000` |
| Superficie (tarjetas) | Gris muy oscuro, casi negro | `#161616` – `#1C1C1C` |
| Acento primario (marca) | Rojo carmesí saturado, con un ligero corrimiento a magenta | `#E4003A` – `#FF1B45` |
| Texto principal | Blanco puro | `#FFFFFF` |
| Texto secundario/muted | Gris claro apagado | `#9A9A9A` – `#A8A8A8` |
| Éxito / positivo | No aparece explícito en la referencia — se mantiene un verde discreto para no perder legibilidad de estado ("al día") | a definir en Design System |
| Advertencia | Ídem — no hay ámbar en la referencia, se conserva como color funcional | a definir en Design System |

El rojo de la referencia **no es el `--red` actual de CES** (`#F87171`, un rojo suave/coral usado solo para errores/vencido). Acá el rojo es la marca entera, mucho más saturado e intenso — confusión real a resolver: si el rojo pasa a ser el acento primario, el rojo de "error/vencido" necesita un tono diferenciado (más apagado o corrido a otro matiz) para no competir visualmente con los CTAs. Se resuelve en `DESIGN_SYSTEM.md`.

## 4. Tipografía / estilo tipográfico

La imagen usa una tipográfica de palo seco, condensada y de peso muy alto (bold/black) para el wordmark y los títulos — estilo afín a familias como *Anton*, *Oswald* (peso 700-800) o *Bebas Neue* para titulares, combinada con una sans-serif geométrica estándar (similar a la actual `system-ui`) para el cuerpo de texto y las cifras de las tarjetas, que en la referencia se ven en peso regular/semibold, no condensadas. Aproximación web-safe recomendada: **Oswald** o **Bebas Neue** (Google Fonts, cargable desde `fonts.googleapis.com` sin costo) para headers/wordmark, manteniendo `system-ui` para cuerpo — así no se sacrifica legibilidad en tablas/formularios.

## 5. Elementos que NO debemos usar

- No usar el rojo de forma decorativa en fondos grandes — en la referencia el rojo es puntual (botones, cifras, iconos activos), nunca un fondo de pantalla completo, para no cansar la vista en una app de uso diario.
- No copiar el crop/tratamiento fotográfico del boxeador como elemento recurrente de UI — es material de marketing, no un patrón de interfaz; en la app se traduce a formas (watermarks, iconografía), no a fotografía de stock repetida.
- No usar gradientes llamativos — la referencia es plana, de bloques sólidos.
- No mezclar el rojo de marca con el rojo de "vencido/error" sin diferenciarlos (ver §3).
- No usar la corona como logo literal si compite con el ícono de mancuerna/puño que ya identifica secciones — un solo símbolo de marca por contexto.

## 6. Traducción del lenguaje visual a una app móvil/web

| Elemento en la imagen | Traducción a interfaz |
|---|---|
| Fondo negro absoluto | `--color-bg` |
| Tarjetas casi negras con borde sutil | `--color-surface` + `--color-line` |
| Rojo saturado en CTA principal | `--color-primary`, aplicado a `.btn--primary`, tabs activos, chips activos |
| Corona / wordmark condensado | Logo mínimo (mancuerna o puño estilizado) + tipografía condensada solo en headers de marca (splash, título de rol, `app-title`) — nunca en cuerpo de texto por legibilidad |
| Botones pastilla | Mantener el `border-radius` alto ya usado en `.btn`, subir levemente el radio para acercarse a la cápsula de la referencia |
| Bottom nav con ícono activo resaltado | Mismo patrón `.tab.is-active` ya existente, cambiando el color de resaltado de lima a rojo |
| Grid 2x2 de stat cards del dashboard | Mismo patrón que ya usa `viewAdminFacturacion`/`viewClientProgreso`, con la paleta nueva |

## 7. Aplicación por pantalla

- **Login/registro**: fondo negro, wordmark condensado arriba, formulario con inputs oscuros de borde sutil, CTA primario rojo en pastilla, CTA secundario en outline.
- **Dashboard (owner/admin)**: header con saludo + nombre del gym, grid de métricas (clientes, entrenadores, check-ins, ingresos) en tarjetas oscuras con cifra en rojo o blanco grande, sección de actividad reciente, acciones rápidas como chips/botones.
- **Botones**: primario = rojo relleno; destructivo (rechazar, eliminar) reutiliza un rojo *diferenciado* (más apagado) para no competir con el CTA de marca — o se resuelve con un ícono + texto en vez de solo color.
- **Tarjetas**: fondo `--color-surface`, borde `--color-line`, esquinas moderadas (14-16px, no cápsula) — igual que hoy pero en la paleta nueva.
- **Navegación**: bottom nav en móvil (igual que hoy), sidebar oscuro en desktop (nuevo, ver `MIGRATION_PLAN.md` Fase 21) con el ítem activo en rojo.
- **Formularios**: inputs oscuros, placeholder gris apagado, focus con borde blanco/rojo sutil (igual mecánica que hoy, distinto color).
- **Perfiles**: avatar circular con iniciales, acento de color según rol (owner/admin/trainer podrían compartir el rojo de marca con variación de intensidad, o diferenciarse con un segundo acento neutro).
- **Rutinas / workout**: tarjetas de ejercicio con progreso, barra o punto de "completado" en rojo.
- **Progreso**: gráfico de barras (ya existe el patrón `.chart`) recoloreado a rojo/blanco.
- **Check-in**: pantalla de QR en blanco sobre negro (alto contraste, fácil de escanear) — el QR decorativo actual (`.qr`) se mantiene como placeholder hasta que exista un QR real (ver gap en `DATABASE_MAP.md`).
- **Pantallas administrativas**: tablas/listas con la misma tarjeta oscura, badges de estado conservando semántica de color (verde=al día, ámbar=pendiente) pero ajustados para no chocar con el rojo de marca.

La imagen es la referencia principal de identidad — el Design System resultante (`DESIGN_SYSTEM.md`) formaliza estos valores en tokens CSS concretos.
