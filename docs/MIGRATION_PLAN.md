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

**Fase 3 — Navegación.** ✅ Completa (2026-09-04). Router modular (`src/router.js`) + `src/state.js`/`src/actions.js`/`src/data.js`/`src/helpers.js` — la modularización completa que reemplazó `app.js` (ver Fase 4 y siguientes, todas construidas ya sobre `src/`).

**Fase 4 — Owner + Admin.** ✅ Completa (2026-09-04). `src/screens/owner.js` (nuevo — registro del gimnasio + dashboard con paridad total admin/owner + tab exclusiva "Admins" para aprobar solicitudes) y `src/screens/admin.js` (repurposado — dejó de crear el gimnasio, ahora se une a uno existente y espera aprobación, mismo patrón que `trainer.js`). `viewRole` tiene sus 4 tarjetas (Dueño/Administrador/Cliente/Entrenador). `supabase-client.js`/`mock-client.js` tienen el namespace `admins` (`listForGym`/`approve`/`reject`) y `auth.signUpOwner`. Verificado de punta a punta contra `test-harness.html`: alta de dueño → creación de gimnasio → alta de administrador → unión al gimnasio → pendiente → aprobación desde el panel del dueño → login del administrador aprobado → mismo dashboard, sin la tab de Admins. Pendiente real detectado y corregido en el camino: `viewOwnerDash` necesita `state.myProfile.role`, que no se seteaba durante el registro del dueño — corregido en `ownerSignUp` (ver commit correspondiente).

**Fase 5-7 — Rediseño visual Trainer / Client / y el propio Owner/Admin.**
- ✅ **Limpieza de colores hardcodeados** (2026-09-04): Fase 2 solo pudo retintar `styles.css` — quedaban ~10 instancias de `rgba(215,255,62,...)` (lima vieja) y `rgba(248,113,113,...)` (rojo viejo) escritas directo en los template strings de `src/helpers.js`, `src/screens/{auth,owner,client}.js` (barra de tráfico del cliente, tarjeta de plan con degradé azul-lima viejo, banner de error, alerta de vencimiento, borde de la rutina del entrenador). Todas corregidas a los valores nuevos (`rgba(228,0,58,...)` / `rgba(255,92,92,...)`) y verificadas visualmente — la tarjeta de plan del cliente y el gráfico de tráfico ya se ven en la paleta Fight Club, no en la de CES.
- ✅ **Grid de métricas del dueño** (2026-09-04): tarjetas 2x2 (Clientes/Entrenadores/Ingresos/Al día) al abrir el panel, con datos reales.
- ✅ **Sidebar de escritorio** (2026-09-04): `.dash-shell`/`.dash-main` nuevos (los 3 paneles con tabs — dueño/admin, cliente, entrenador — pasaron de un `style=` inline sin clase a estas clases) + un `@media (min-width:900px)` que reposiciona la tabbar a un costado vía `order`, sin tocar el DOM. Bug de cascada CSS encontrado y corregido en el camino (la regla de escritorio estaba antes que la base sin condición en la hoja de estilos, así que siempre perdía).
- ✅ **Tarjetas de ejercicio del workout** (2026-09-04): pantalla `workout` nueva — parsea el texto libre del ejercicio ("Nombre - NxM" o "Nombre - X min"), muestra series individuales marcables o un check simple para ejercicios por tiempo, temporizador de descanso de 60s entre series, navegación anterior/siguiente, pantalla "Entrenamiento completado" con el resumen de la sesión. Es una sesión en memoria (no hay tabla de sesiones/sets en el backend todavía — ver el gap en `docs/DATABASE_MAP.md`), así que no se persiste nada, ni se inventa que sí. Dos bugs reales encontrados verificando en el navegador: `data-v` llega siempre como string (comparación `Set.has()` nunca coincidía con los números 1-4), y el descanso solo arrancaba después de la primera serie marcada, no de cada una.
- ✅ **Tipografía condensada en títulos de sección** (2026-09-04): `.section-title` (usada en cada pantalla vía el helper `sectionTitle()` y directamente en ~8 lugares más — "Progreso día a día", "Mejor hora para ir", "Mapa de calor semanal", etc.) pasó a `--font-display` + mayúsculas, igual que `.title`/`.app-title`. Un solo cambio de CSS, cobertura en toda la app por ser una clase compartida.

Con esto, el rediseño Fight Club sustancial (Fases 2-8) queda completo: paleta, modularización a src/, rol de dueño con aprobación de administradores, grid de métricas, sidebar de escritorio, workout con temporizador, y tipografía condensada consistente. Las 3 features de datos/backend que quedaban en ese momento (invitación por QR/link, check-in real, regla de "10 clientes interesados") se construyeron después, en las Fases 9-11 — todas ✅ completas hoy.

**Fase 8 — Rutinas** (Workout/Routine/Exercise/Progress). ✅ Completa — ver el bullet "Tarjetas de ejercicio del workout" arriba.

**Fase 9 — Check-in QR real.** ✅ Completa (2026-09-04). Tabla `checkin_events` + RPC `check_in_client()` (exige `app_role_is_staff()`, un cliente no puede autoregistrarse). No hay lectura de cámara todavía — el staff registra la entrada con un click desde la tab Clientes ("Registrar entrada"), sin generar/escanear un QR real; "Mi QR" del lado del cliente es un placeholder decorativo (mismo patrón de honestidad que el resto de la app: no pretende ser escaneable si no lo es). Migración `20260904000100_checkin_events.sql` aplicada a producción. Verificado en vivo, incluso en el pase de Fase 14: check-in registrado por staff, reflejado al instante en "Check-ins hoy" y en la fila del cliente.

**Fase 10 — Invitación por link/QR.** ✅ Completa (2026-09-04). `gyms.invite_code` + `create_gym()` actualizado + `gyms.getByInviteCode()`. El código/link vive en el dashboard del dueño (`inviteCard()`); el link (`?invite=CODE`) se resuelve al abrir la app y salta el selector manual de gimnasio, pero pasa por el mismo `join_gym()` de siempre — no hay atajo que sortee las validaciones. Migración `20260904000000_gym_invite_code.sql` aplicada a producción.

**Fase 11 — Entrenadores: regla de 10 clientes interesados.** ✅ Completa (2026-09-04). Tabla `trainer_candidate_interest` + RPCs `mark_trainer_interest()`/`unmark_trainer_interest()` + `approve_trainer()` actualizado para contar interés real server-side. UI: sección "¿Querés que sea tu entrenador?" en la tab Entrenar del cliente (toggle Me interesa/Ya no), progreso "X/10" + botón Aprobar deshabilitado hasta llegar a 10 en la tab Coaches del dueño/admin. Verificado con clicks reales: rechazado en 9, aceptado en 10.

**Fase 12 — Seguridad.** ✅ Completa (2026-09-04). Repetido `SECURITY_AUDIT.md` sobre las 4 migraciones nuevas + un grep completo de `supabase/migrations/*.sql` buscando checks de rol sin migrar. Dos hallazgos reales (ambos de permisos insuficientes para `owner`, no de más acceso del debido): la política de Storage de fotos que ya estaba documentada como pendiente desde la Fase 1 pero nunca se había corregido, y un segundo hallazgo nuevo — la política de lectura de `progress_photos` (la tabla de metadatos, no el archivo) que se le había escapado por completo a la migración de owner-role. Corregidos los dos en `20260904000300_storage_staff_parity.sql` — **aplicada al proyecto Supabase real el 2026-09-04**, verificada con `pg_policies` mostrando las 4 políticas ya con sus nombres nuevos en producción. Los 4 riesgos "a vigilar" que la Fase 1 había dejado para cuando existieran esas features se verificaron: los 4 se implementaron exactamente como se había anticipado.

**Fase 13 — PWA + Capacitor.** ✅ Completa (2026-09-04). `appId` sin cambios (`com.ces.gymmanager`, decisión ya confirmada) — solo lo que el usuario ve:
- Íconos regenerados de verdad, no solo referenciados: `assets/icon-*.svg` (los archivos fuente, editables) tenían el lima/negro viejo hardcodeado — actualizados a la paleta nueva y recorridos por `scripts/build-icons.js` (usa `sharp`, ya en `devDependencies`) para regenerar los 7 PNG que de verdad usan la PWA y el ícono nativo. Antes de esto, el ícono seguía siendo lima aunque toda la UI ya fuera carmesí.
- `manifest.webmanifest`: `name`/`short_name`/`background_color`/`theme_color`.
- `index.html`: `<title>`, `theme-color`, `apple-mobile-web-app-title`.
- `capacitor.config.json`: solo `appName` (lo que ve el usuario en su teléfono) — `appId` intacto.
- `sw.js`: `CACHE_NAME` con un nombre nuevo (no solo bump de versión) para que un usuario con la PWA ya instalada reciba de verdad los íconos nuevos, no los viejos servidos desde cache.
- Dos strings de marca que quedaban sueltos en `src/screens/auth.js` (el título de la pantalla de rol, y el estado vacío del selector de gimnasio — este último también corregido de "tu administrador" a "tu dueño", terminología de la Fase 4).

Fuera de esta pasada, a propósito: `package.json` (metadata interna de npm, nunca la ve un usuario), y la prosa de `ANDROID.md`/`IOS.md`/`ads.js` que menciona "CES Gym Manager" solo en comentarios para desarrolladores — no es branding de cara al usuario. El build nativo empaquetado (carpeta separada fuera de este repo, ver `ANDROID.md`) va a necesitar un `npm run cap:sync` ahí para levantar `appName`/íconos nuevos la próxima vez que se compile.

**Fase 14 — Testing.** ✅ Completa (2026-09-04). Pase manual cruzado por los 4 roles contra `test-harness.html`, con clicks reales (no solo lectura de código) — alta, aprobación y dashboard de dueño/admin/entrenador/cliente, paridad dueño↔admin confirmada, los dos gates de aprobación (admin sin gate, entrenador con gate de 10) probados, subida de foto de progreso (ejercita el bucket que arregló la migración de Fase 12), check-in y cobro en efectivo por staff, responsive mobile↔desktop. Detalle completo y el único hallazgo (menor, de UX, no bloqueante) en [TESTING_FASE14.md](TESTING_FASE14.md). Sigue sin haber suite automatizada — se mantiene esa realidad salvo que se pida agregar una.

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
