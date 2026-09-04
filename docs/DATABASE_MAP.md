# Mapa de base de datos — estado real en Supabase

Fuente: **[supabase/migrations/](../supabase/migrations)** (6 archivos, aplicados en orden por nombre) + verificación en vivo del proyecto `sblujafvppibjbxrmsgc` hecha en esta sesión.

## Tablas

| Tabla | Filas clave | gym_id | Notas |
|---|---|---|---|
| `gyms` | `id`, `name`, `address`, `hours`, `owner_user_id → auth.users` | — (es la raíz) | `owner_user_id` hoy apunta a quien ejecutó `create_gym()` — con la parte 2 de la migración de owner, ese pasa a ser semánticamente el `owner`. |
| `profiles` | `id → auth.users`, `role`, `gym_id`, `name`, `email`, `phone` | nullable | 1:1 con `auth.users`. `role` es **inmutable** tras el alta (trigger `profiles_role_immutable`) salvo el `UPDATE` puntual con el trigger desactivado que migra al dueño real (ver owner-role parte 2). |
| `equipment` | `id`, `gym_id`, `name` | not null | |
| `plans` | `id`, `gym_id`, `name`, `price`, `duration` (enum `plan_duration`) | not null | |
| `trainers` | `user_id → profiles` (PK), `gym_id`, `specialty`, `price`, `status` (enum `trainer_status`) | nullable hasta `join_gym()` | 1:1 con `profiles` de rol `trainer`. |
| `client_profiles` | `user_id → profiles` (PK), `gym_id`, `plan_id`, `trainer_user_id`, `face_photo_key`, datos físicos, `membership_status`, `membership_expires_at`, `last_payment_at` | nullable hasta `join_gym()` | `membership_status`/`membership_expires_at`/`last_payment_at` solo se escriben desde `confirm_cash_payment()` (columnas revocadas para `authenticated`, ver `SECURITY_AUDIT.md`). |
| `progress_photos` | `id`, `client_user_id`, `storage_key`, `taken_at` | — (hereda de client) | `unique(client_user_id, taken_at)` — una foto por cliente y día. |
| `routines` | `id`, `client_user_id`, `source` (`ia`\|`trainer`), `goal`, `author_user_id` | — | Únicos parciales: una rutina `trainer` por cliente, una `ia` por cliente+`goal`. |
| `routine_exercises` | `id`, `routine_id`, `position`, `text` | — | |
| `payments` | `id`, `client_user_id`, `gym_id`, `amount`, `method='efectivo'`, `status` (enum `payment_status`), `confirmed_by`, `confirmed_at` | not null | Sin política de INSERT/UPDATE directa — solo vía RPC. |
| `reviews` | `id`, `gym_id`, `client_user_id`, `rating`, `text`, `created_at` | not null | |
| `checkins` | `id`, `gym_id`, `day_of_week`, `hour`, `count` | not null | **Agregado por hora**, no por evento — no sirve tal cual para un check-in por QR individual (ver §Gaps). |
| `gym_admins` *(nuevo, owner-role parte 1, ya aplicado)* | `user_id → profiles` (PK), `gym_id`, `status` (enum `approval_status`: pending/approved/rejected) | nullable hasta `join_gym()` | Espeja `trainers` pero para admins bajo un dueño. |

## Tipos (enums)

`user_role` (`admin`, `trainer`, `client`, + `owner` ya agregado), `trainer_status`, `plan_duration`, `membership_status`, `experience_level`, `training_goal`, `routine_source`, `payment_status`, `approval_status` *(nuevo)*.

## Storage

Bucket privado `photos` (**[20260720120300_storage.sql](../supabase/migrations/20260720120300_storage.sql)**). Convención de ruta: `{gym_id}/{client_user_id}/face.jpg` y `{gym_id}/{client_user_id}/progress/{fecha}.jpg`. Políticas leen esos dos primeros segmentos vía `storage.foldername()`. **Nota**: la política de lectura (`"owner, their trainer, or gym admin can view photos"`) todavía compara contra `app_role() = 'admin'` literal — necesita el mismo tratamiento `app_role_is_staff()` que el resto de las políticas de la parte 2 del owner-role (no estaba incluida en esa migración, hay que agregarla).

## Funciones (`security definer`, únicas vías de escritura privilegiada)

`app_role()`, `app_gym_id()`, `is_client_trainer()` — helpers de RLS. `handle_new_user()` — trigger de alta. `create_gym()`, `join_gym()` — alta de gimnasio y unión. `approve_trainer()`/`reject_trainer()` — aprobación staff. `create_cash_charge()`/`confirm_cash_payment()`/`cancel_cash_payment()` — cobros. Con la parte 2 del owner-role (no aplicada aún): `app_role_is_staff()`, `approve_admin()`/`reject_admin()`.

## Gaps respecto al pedido de Fight Club Gym

1. ✅ **Resuelto (2026-09-04)**: check-in por evento. Tabla `checkin_events` nueva (`checkins` sigue intacta, sin tocar) + RPC `check_in_client()` (`security definer`, exige `app_role_is_staff()`, mismo patrón que `confirm_cash_payment()`). Escaneo por cámara real no está implementado (no hay librería de lectura de QR en el proyecto) — el sustituto honesto es que el staff registra la entrada desde la lista de clientes ("Registrar entrada"), con el QR del cliente como referencia visual decorativa, igual que el QR de cobro. Migración: `20260904000100_checkin_events.sql` — escrita, verificada contra `test-harness.html` (incluyendo que un cliente intentando su propio check-in es rechazado), **todavía no aplicada al proyecto Supabase real**.
2. ✅ **Resuelto (2026-09-04)**: invitación de gimnasio por link/QR. `gyms.invite_code` (columna nueva, generada automáticamente por `create_gym()`) + `gyms.getByInviteCode(code)` en `supabase-client.js`/`mock-client.js`. El código **no** es un secreto de control de acceso — `gyms` ya era públicamente listable para cualquier autenticado, así que esto es una comodidad de UX (link/QR lindo para compartir), no una barrera nueva; `join_gym()` sigue siendo quien valida de verdad. Migración: `20260904000000_gym_invite_code.sql` — escrita, verificada contra `test-harness.html`, y **aplicada al proyecto Supabase real el 2026-09-04** (confirmado en vivo: "Fight Club Gym" → `a8591709`, "Gimnasio de Prueba CES" → `805bd2fe`).
3. **Mínimo de "10 clientes interesados" para entrenador**: **decisión confirmada (2026-09-03): verificable**, no auto-declarado. Requiere una tabla nueva de interés real, ej. `trainer_candidate_interest (candidate_user_id, client_user_id, gym_id, created_at, unique(candidate_user_id, client_user_id))`, más una pantalla donde un cliente ya logueado pueda marcar interés en un candidato a entrenador. `approve_admin`-style RPC de aprobación deberá contar filas reales (`count(*) >= 10`) server-side antes de permitir `status → approved`, nunca confiar en un número que mande el frontend (ver `SECURITY_AUDIT.md` riesgo 3). Diseño detallado pendiente para la Fase 11 de `MIGRATION_PLAN.md`.
4. **`gym_admins`**: existe la tabla y el enum (parte 1 aplicada); falta aplicar la parte 2 (funciones + RLS) y migrar el código de `app.js`/`supabase-client.js`.

Ninguno de estos gaps requiere romper una tabla existente — todos son adiciones (nuevas tablas/columnas), consistente con la regla "NO hacer cambios destructivos" del pedido.
