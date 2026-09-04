# Plan de migración — CES Gym Manager → Fight Club Gym Manager

Fase 1 (auditoría) completa. Este documento es la propuesta de cómo ejecutar las fases siguientes — **nada de esto se ejecuta hasta aprobación explícita**.

## Fase 0 — decisión previa, antes de tocar nada de branding

Existe trabajo en curso, **anterior a este pedido**, para el rol `owner` (ver **[ARCHITECTURE_AUDIT.md §7](ARCHITECTURE_AUDIT.md#7-nota-trabajo-de-owner-ya-en-curso-previo-a-este-pedido)**): la parte 1 de esa migración ya está aplicada en el Supabase real; la parte 2 (funciones + RLS + migración del admin real a `owner`) está escrita en disco pero **no aplicada**, y el código de `app.js` para esa UI **no existe todavía**.

Esa arquitectura de `owner` coincide exactamente con lo que pide la sección 4 del pedido de Fight Club. Recomendación: **aplicar la parte 2 ya** (es la operación que estaba en curso al recibir este pedido — un solo `UPDATE`/conjunto de `CREATE POLICY`, ya revisado línea por línea) y construir la UI de `owner` directamente sobre el Design System nuevo, en vez de construirla dos veces. Corregir además el hallazgo de Storage listado en `SECURITY_AUDIT.md` como parte de la misma pasada.

**Decisión confirmada (2026-09-03): esperar.** No se aplica la parte 2 todavía — se prioriza primero el Design System y la arquitectura nueva. Queda pendiente como el primer paso de base de datos a retomar antes de construir la pantalla real de `owner`.

## Estructura frontend propuesta (adaptada del pedido, no copiada literal)

El pedido sugiere una carpeta `src/` completa. Dado que hoy `app.js` es un único archivo de 2239 líneas sin build step (se sirve tal cual, sin bundler — ver `index.html`), una modularización real necesita **decidir primero si se introduce un bundler** (Vite/esbuild) o si se mantiene "sin build" con `<script type="module">` nativo. Recomendación: **ES modules nativos**, sin bundler — mantiene la filosofía actual ("sin build step", deploy = copiar archivos) y Capacitor/Vercel no necesitan cambios de pipeline.

```
app.js (hoy, monolítico)          →      src/ (propuesta)
                                            state.js        — el objeto `state` + setState()
                                            router.js        — SCREENS, render(), wiring de eventos
                                            components/       — Button, Card, StatCard, Avatar, Badge,
                                                                 EmptyState, Toast (helpers de HTML, no JSX)
                                            screens/
                                              auth/           — viewRole, viewOwnerAuth, viewAdminAuth (join-flow)
                                              owner/           — dashboard, aprobación de admins, reportes
                                              admin/           — lo que hoy es "admin" (clientes, coaches, facturas)
                                              trainer/          — sin cambios de fondo, solo restyle
                                              client/            — sin cambios de fondo, solo restyle
                                            services/
                                              (adaptadores delgados sobre BolaAPI — mismo rol que hoy
                                               tiene supabase-client.js, sin romperlo)
                                          styles/
                                            tokens.css        — de DESIGN_SYSTEM.md
                                            components.css     — botones/tarjetas/badges compartidos
                                            (resto de styles.css se mantiene, reorganizado)
```

`window.BolaAPI` **no se toca en esta fase** — se sigue llamando igual desde `services/`, cumpliendo la regla 29 del pedido ("no romperla, migrar progresivamente, eliminarla solo cuando todo esté migrado y probado").

## Fases (según numeración del pedido, adaptada a lo que ya existe)

**Fase 1 — Auditoría.** ✅ Este documento y sus 6 acompañantes.

**Fase 2 — Branding + Design System.** Aplicar `DESIGN_SYSTEM.md` a `styles.css` (tokens nuevos), sin tocar `app.js` todavía — verificar visualmente que nada se rompe con solo el cambio de paleta (la mayoría del estilo hoy es inline, así que el impacto real de *solo* tocar `styles.css` es limitado — confirma el hallazgo de `ARCHITECTURE_AUDIT.md §3**).

**Fase 3 — Navegación.** Introducir el router modular (`src/router.js`) sin cambiar todavía el contenido de cada pantalla — mover, no reescribir.

**Fase 4 — Owner + Admin.** ✅ Completa (2026-09-04). `src/screens/owner.js` (nuevo — registro del gimnasio + dashboard con paridad total admin/owner + tab exclusiva "Admins" para aprobar solicitudes) y `src/screens/admin.js` (repurposado — dejó de crear el gimnasio, ahora se une a uno existente y espera aprobación, mismo patrón que `trainer.js`). `viewRole` tiene sus 4 tarjetas (Dueño/Administrador/Cliente/Entrenador). `supabase-client.js`/`mock-client.js` tienen el namespace `admins` (`listForGym`/`approve`/`reject`) y `auth.signUpOwner`. Verificado de punta a punta contra `test-harness.html`: alta de dueño → creación de gimnasio → alta de administrador → unión al gimnasio → pendiente → aprobación desde el panel del dueño → login del administrador aprobado → mismo dashboard, sin la tab de Admins. Pendiente real detectado y corregido en el camino: `viewOwnerDash` necesita `state.myProfile.role`, que no se seteaba durante el registro del dueño — corregido en `ownerSignUp` (ver commit correspondiente).

**Fase 5-7 — Rediseño visual Trainer / Client / y el propio Owner/Admin.**
- ✅ **Limpieza de colores hardcodeados** (2026-09-04): Fase 2 solo pudo retintar `styles.css` — quedaban ~10 instancias de `rgba(215,255,62,...)` (lima vieja) y `rgba(248,113,113,...)` (rojo viejo) escritas directo en los template strings de `src/helpers.js`, `src/screens/{auth,owner,client}.js` (barra de tráfico del cliente, tarjeta de plan con degradé azul-lima viejo, banner de error, alerta de vencimiento, borde de la rutina del entrenador). Todas corregidas a los valores nuevos (`rgba(228,0,58,...)` / `rgba(255,92,92,...)`) y verificadas visualmente — la tarjeta de plan del cliente y el gráfico de tráfico ya se ven en la paleta Fight Club, no en la de CES.
- ⬜ **Pendiente**: el resto del rediseño de composición (grid de métricas estilo el mockup en el dashboard, sidebar de escritorio, tipografía condensada en más títulos de sección, tarjetas de ejercicio en el workout) — no abordado todavía.

**Fase 8 — Rutinas** (Workout/Routine/Exercise/Progress): mejorar la experiencia de entrenamiento (temporizador de descanso, marcar series) — hoy `viewClientEntrenar` solo lista texto, sin estructura de series/reps/descanso.

**Fase 9 — Check-in QR real.** Requiere la tabla nueva de eventos de check-in (ver `DATABASE_MAP.md` gap 1) + pantalla "Mi QR" (cliente) y "Escanear QR" (staff) — hoy no existen.

**Fase 10 — Invitación por link/QR.** Requiere `invite_code`/token en `gyms` + RPC nuevo (ver `SECURITY_AUDIT.md` riesgo 1).

**Fase 11 — Entrenadores: regla de 10 clientes interesados.** Requiere decisión de producto (¿self-reported o verificable?) antes de diseñar la tabla — no se resuelve en código sin esa definición.

**Fase 12 — Seguridad.** Repetir `SECURITY_AUDIT.md` sobre todo lo nuevo (invitaciones, check-in, regla de entrenadores) antes de dar por cerrada la migración.

**Fase 13 — PWA + Capacitor.** Branding de manifest/service worker/iconos + **evaluación explícita** del cambio de `appId`/scheme (ver riesgo abajo) antes de tocarlo.

**Fase 14 — Testing.** Manual, por rol, contra `test-harness.html` con `mock-client.js` actualizado a los 4 roles — no hay suite automatizada hoy, se mantiene esa realidad salvo que se pida agregar una.

## Archivos nuevos vs. modificados (vista previa, se confirma por fase)

**Nuevos**: `docs/*.md` (esta entrega), `src/**`, `styles/tokens.css`, eventualmente `supabase/migrations/2026090X..._checkins_events.sql`, `..._gym_invites.sql`, `..._trainer_interest.sql`.

**Modificados** (en fases posteriores, ninguno todavía): `app.js` (probablemente eliminado al final, reemplazado por `src/`), `supabase-client.js`, `mock-client.js`, `styles.css`, `index.html`, `manifest.webmanifest`, `sw.js`, `capacitor.config.json`, `package.json`.

**Ninguno se elimina en esta fase.**

## Riesgos

1. **Deep link nativo (`com.ces.gymmanager://auth-callback`)**: si el rebrand implica cambiar el `appId` de Capacitor (regla 26 del pedido dice "si el identificador debe cambiar, analizar primero las consecuencias") — cambiarlo rompe el link de confirmación de correo hasta que se actualice en 3 lugares a la vez: `capacitor.config.json`, `AndroidManifest.xml` (intent-filter) y Supabase (Authentication → Redirect URLs). Recomendación: **mantener `com.ces.gymmanager` como identificador técnico** aunque el nombre visible cambie a "Fight Club Gym" — es exactamente el patrón que ya usa el proyecto (`package.json name: "ces-gym-manager"` puede quedar igual mientras `index.html <title>` y el branding visible cambian).
2. **Estilo inline masivo**: como ya se documentó, "cambiar el Design System" no es solo tocar `styles.css` — la mayoría de colores/spacing vive en template strings de `app.js`. La modularización (Fase 3+) es la que realmente habilita un rebrand consistente; hacer el rebrand *antes* de modularizar duplicaría el trabajo.
3. **Sin tests automatizados**: cada fase debe verificarse manualmente contra `test-harness.html` (con `mock-client.js` puesto al día) antes de tocar el backend real, siguiendo la regla del pedido de "NO hacer una migración masiva sin comprobar cada etapa".
4. **`mock-client.js` desactualizado**: no modela `owner`/`gym_admins` — hay que ponerlo al día en paralelo a cualquier cambio de `supabase-client.js`, o el test-harness deja de reflejar la realidad.
5. **Regla de 10 clientes interesados sin definición de producto**: bloquea la Fase 11 hasta decidir el mecanismo — se señala explícitamente para no improvisar una tabla que haya que rehacer.

## Decisiones confirmadas (2026-09-03)

1. **Fase 0 (owner-role parte 2)**: esperar — no se aplica todavía.
2. **`appId`/scheme de Capacitor**: se mantiene `com.ces.gymmanager` sin cambios — el deep link de confirmación de correo no se toca.
3. **Regla de "10 clientes interesados"**: **verificable**, no auto-declarada. Implica una relación real cliente→entrenador-candidato (tabla nueva, ver `DATABASE_MAP.md` gap 3 actualizado) más una pantalla donde el cliente pueda marcar interés en un entrenador candidato — se diseña en detalle cuando llegue la Fase 11, no se improvisa antes.
4. **Siguiente paso**: arrancar la **Fase 2** ahora mismo — Design System aplicado a `styles.css`, sin tocar `app.js` todavía.

### Cómo se aplica la Fase 2 sin tocar `app.js`

`app.js` referencia colores por **nombre de variable CSS** (`var(--lime)`, `var(--red)`, etc.), nunca por valor — así que retintar los *valores* de los tokens ya existentes en `styles.css` (`--lime`, `--bg`, `--surface`, etc.) cambia el look completo de la app sin tocar una sola línea de `app.js`. Las clases siguen llamándose `.btn--lime`/`.chip--lime`/`.avatar--lime` por ahora (nombre desalineado del nuevo valor) — el rename a `.btn--primary` etc. propuesto en `DESIGN_SYSTEM.md` se hace en la Fase 3, junto con la modularización, para no tocar `app.js` dos veces.
