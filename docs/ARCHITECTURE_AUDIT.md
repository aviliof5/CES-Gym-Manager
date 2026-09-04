# Auditoría de arquitectura — CES Gym Manager → Fight Club Gym Manager

Fase 1 (solo lectura). Ningún archivo de la app fue modificado para producir este documento.

## 1. Resumen del proyecto actual

Una SPA de una sola página, en JavaScript vanilla, sin build step ni framework. Todo el árbol de pantallas vive en **[app.js](../app.js)** (2239 líneas): un objeto `state` global, `render()` que reemplaza `innerHTML` completo según `state.screen`, y un objeto `ACTIONS` despachado por delegación de eventos (`data-a`/`data-v`/`data-f` en el HTML generado). No hay Virtual DOM, no hay componentes: cada pantalla es una función `viewX()` que devuelve un string de HTML.

El backend es Supabase (Postgres + Auth + Storage), accedido *exclusivamente* a través de `window.BolaAPI` (**[supabase-client.js](../supabase-client.js)**, 399 líneas) — `app.js` nunca llama a `supabase.from(...)` directo. **[mock-client.js](../mock-client.js)** (386 líneas) implementa la misma interfaz en memoria para **[test-harness.html](../test-harness.html)**, sin backend real.

Empaquetado: **web + PWA** (manifest, service worker network-first) y **Capacitor nativo** (Android/iOS, deep link `com.ces.gymmanager://auth-callback` para confirmación de correo, AdMob vía **[ads.js](../ads.js)**).

```
index.html ──> styles.css (289 líneas, design tokens)
           ──> supabase-client.js  ──┐
           ──> mock-client.js (solo test-harness) ──┤──> window.BolaAPI
           ──> ads.js                               │
           ──> app.js  (state, render, ACTIONS) ─────┘
```

## 2. Qué funciona

- **Auth + roles**: alta/login por rol (admin, cliente, entrenador) vía Supabase Auth, con `role` guardado en `raw_user_meta_data` y materializado en `profiles.role` por el trigger `handle_new_user()` (**[20260720120100_functions.sql](../supabase/migrations/20260720120100_functions.sql)**). Confirmado end-to-end en esta misma sesión de trabajo (SMTP/Resend, deep link nativo, Vercel).
- **Multi-tenant por gimnasio**: casi toda tabla lleva `gym_id`; RLS restringe cada política a `app_gym_id()`. Verificado por diseño en **[20260720120200_rls.sql](../supabase/migrations/20260720120200_rls.sql)**.
- **Flujo de aprobación de entrenadores**: `trainers.status` (pending/approved/rejected) + RPCs `approve_trainer`/`reject_trainer`, exclusivos de `admin` en servidor — nunca en el cliente.
- **Cobros en efectivo**: `create_cash_charge`/`confirm_cash_payment`/`cancel_cash_payment`, todas `security definer`, las únicas vías para tocar `payments`/`membership_status` (columnas de escritura directa revocadas — ver **[SECURITY_AUDIT.md](SECURITY_AUDIT.md)**).
- **Rutinas**: doble fuente (IA basada en equipo del gym, o manual del entrenador), fotos de progreso con Supabase Storage y URLs firmadas.
- **PWA instalable**: manifest + service worker verificados en producción (Vercel) esta misma sesión.
- **Rol "dueño" (owner)**: trabajo en curso, ver §7 — la parte de base de datos ya está parcialmente aplicada al proyecto Supabase real, el código de `app.js` todavía no.

## 3. Qué está mal / limitado

- **`app.js` es un monolito de 2239 líneas** sin separación de pantallas/componentes/servicios — toda la lógica de negocio, todo el markup y todo el enrutamiento viven en el mismo archivo global. Cualquier cambio de una pantalla obliga a leer el archivo completo para no romper una convención implícita (p. ej. `state.busy`, `errorBanner()`, `act()`).
- **CSS con estilos inline masivos**: la enorme mayoría del markup en `app.js` usa `style="..."` directo en vez de clases de `styles.css` — el Design System actual (tokens en `:root`) solo cubre botones/chips/avatares/badges; el resto (spacing, layout, colores puntuales) está hardcodeado dentro de los template strings. Esto hace *muy* costoso un rebrand visual: no basta con cambiar `styles.css`, hay que tocar casi cada `viewX()`.
- **Sin componentización real**: patrones repetidos (card de cliente, card de entrenador, formulario de plan) están duplicados como HTML literal en vez de funciones reutilizables tipadas.
- **`checkins`/tráfico son datos de ejemplo**: la tabla `checkins` existe pero el frontend sigue usando `HOUR_VALUES`/`HEATMAP` hardcodeados (**[app.js:12-18](../app.js#L12)**) — nunca conectado a check-ins reales. No hay pantalla de "escanear QR" ni de "mi QR" implementada — el `<div class="qr">` es un patrón CSS decorativo, no un QR real ni un check-in verificable.
- **No hay invitación por link/QR de gimnasio**: hoy el cliente/entrenador elige su gimnasio de una lista completa (`viewGymPicker`, **[app.js:1330](../app.js#L1330)**) — cualquier usuario autenticado puede unirse a cualquier gimnasio existente. No hay un código o token de invitación por gimnasio.
- **Sin regla de "10 clientes interesados" para entrenadores**: el flujo actual de alta de entrenador no exige ningún mínimo de interés previo — se registra directo y queda pendiente de aprobación.
- **`mock-client.js` desactualizado respecto al esquema real**: sigue modelando 3 roles (`admin`/`trainer`/`client`), sin `owner` ni `gym_admins` — quedó desincronizado por el trabajo de owner-role en curso (§7).
- **PWA/manifest siguen con branding "CES Gym"** (`index.html`, `manifest.webmanifest`, `sw.js`) — theme-color `#0B0D10`, iconos actuales, nombre `com.ces.gymmanager`.

## 4. Qué conservaremos

Todo lo que vive **debajo** de la capa de presentación se conserva sin cambios destructivos:

- Supabase (Postgres, Auth, Storage, RLS, RPC) tal cual — mismas tablas, mismas políticas, mismos flujos de auth/deep link.
- `window.BolaAPI` como única capa de datos — se **extiende**, no se reemplaza, mientras dure la migración (regla del punto 29 del pedido).
- `mock-client.js` + `test-harness.html` como entorno de pruebas sin backend.
- PWA (manifest + service worker) y Capacitor (Android/iOS) como plataformas de distribución.
- AdMob (`ads.js`), con la regla nueva de no mostrar anuncios al `owner`.
- Las reglas de negocio ya probadas: aprobación staff→trainer, cobros en efectivo, multi-tenant por `gym_id`.

## 5. Qué cambiaremos

- **Modularización de `app.js`** en `src/` (ver propuesta de estructura en **[MIGRATION_PLAN.md](MIGRATION_PLAN.md)**), separando `state`, `screens/{owner,admin,trainer,client}`, `components/`, `services/` (adaptadores sobre `BolaAPI`).
- **Identidad visual completa**: paleta, tipografía, componentes — ver **[VISUAL_BRAND_ANALYSIS.md](VISUAL_BRAND_ANALYSIS.md)** y **[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)**.
- **Cuarto rol real, `owner`**, con paridad de lectura/escritura con `admin` más aprobación de administradores — continuar y completar el trabajo ya iniciado (§7).
- **Invitación de clientes por link + QR** con identificador de gimnasio embebido.
- **Regla de "10 clientes interesados"** en la solicitud de entrenador.
- **Check-in real por QR** (cliente genera QR, staff escanea, se escribe en `checkins`/una tabla de check-ins por evento — hoy `checkins` es solo un agregado por hora, se necesita un registro por evento individual).
- **Rebranding de PWA/Capacitor**: nombre, ids, colores, iconos — con análisis de impacto antes de tocar `com.ces.gymmanager` (rompe el deep link de auth si cambia sin coordinarlo).

## 6. Archivos que serán modificados (fases posteriores, no en esta)

`app.js`, `supabase-client.js`, `mock-client.js`, `styles.css`, `index.html`, `manifest.webmanifest`, `sw.js`, `capacitor.config.json`, `package.json` (name), assets de icono.

## 7. Nota: trabajo de "owner" ya en curso, previo a este pedido

Antes de este pedido de rebrand, esta misma sesión venía implementando el rol `owner` (dueño) descrito en la sección 4 del pedido — arquitectura idéntica: el dueño crea el gimnasio, el administrador se une y queda pendiente de aprobación (mismo patrón que `trainers.status`).

Estado real verificado en el proyecto Supabase (`sblujafvppibjbxrmsgc`):
- **Aplicado y confirmado**: `20260903000000_owner_role_1_types.sql` — agrega `'owner'` a `user_role`, crea `approval_status` y la tabla `gym_admins`.
- **Escrito en disco, NO aplicado todavía**: `20260903000001_owner_role_2_logic.sql` — funciones (`app_role_is_staff`, `create_gym`/`join_gym` actualizados, `approve_admin`/`reject_admin`), políticas RLS nuevas, y la migración de datos que convierte la cuenta admin real (`fernandezavilio5@gmail.com`) en `owner`.
- **`app.js`/`supabase-client.js`/`mock-client.js` sin tocar todavía** para reflejar el rol `owner` — la UI actual solo conoce `admin`/`client`/`trainer`.

Esto encaja exactamente con la sección 4 del pedido de Fight Club — se recomienda **terminar de aplicar esa migración primero** (es un cambio de 5 minutos, ya escrito y revisado) y después construir la UI de `owner` ya directamente con el nuevo Design System, en vez de construirla dos veces (una con estética CES, otra con Fight Club). Ver decisión pendiente en **[MIGRATION_PLAN.md](MIGRATION_PLAN.md) §0**.

## 8. Riesgos

Ver el detalle completo en **[MIGRATION_PLAN.md](MIGRATION_PLAN.md) §Riesgos**. Los más importantes: cambiar el `appId`/scheme de Capacitor rompe el deep link de confirmación de correo si no se coordina con Supabase y AndroidManifest; una reescritura visual sin tests manuales por rol puede introducir regresiones silenciosas (no hay tests automatizados, solo `test-harness.html` manual); el estilo inline masivo en `app.js` hace que "solo cambiar colores" sea, en la práctica, tocar cientos de líneas.
