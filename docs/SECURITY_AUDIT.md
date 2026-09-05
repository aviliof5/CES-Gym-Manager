# Auditoría de seguridad — estado actual

Fase 1 (2026-09-03), solo lectura, más una repasada completa en Fase 12 (2026-09-04, ver más abajo) sobre todo lo que se agregó después de la Fase 1: rol de dueño, invitación por código, check-in real, regla de 10 clientes interesados. Cubre RLS, roles, `gym_id`, `user_id`, RPC, Storage y Auth tal como están hoy en las migraciones aplicadas.

## Principio verificado: nada depende del frontend

Revisadas las 6 migraciones (`schema`, `functions`, `rls`, `storage`, + las 2 de owner-role) y `supabase-client.js`/`mock-client.js` completos. Conclusión: **el control de acceso real vive en Postgres, no en `app.js`.**

- `app.js` oculta botones según `state.myProfile.role`/`state.myTrainer.status` — es UX, no seguridad. Si alguien llamara a `BolaAPI.trainers.approve(id)` directo desde la consola del navegador sin ser admin, `approve_trainer()` revisa `app_role()` server-side y rechaza con excepción.
- Ningún `INSERT`/`UPDATE` sensible acepta `gym_id` o `role` como valor libre del cliente: `create_gym()`/`join_gym()` derivan todo de `auth.uid()` y de filas ya existentes en `gyms`; `handle_new_user()` decide qué tabla poblar según el `role` en `raw_user_meta_data`, pero ese trigger corre server-side tras el `INSERT` en `auth.users` — el cliente no controla el resultado final, solo la sugerencia inicial.
- Las 3 operaciones de dinero (`create_cash_charge`/`confirm_cash_payment`/`cancel_cash_payment`) son las **únicas** vías de escritura a `payments` y a las columnas de membresía de `client_profiles` — no hay política de INSERT/UPDATE en esas tablas para `authenticated`, y las columnas sensibles de `client_profiles` (`membership_status`, `membership_expires_at`, `last_payment_at`) están explícitamente fuera del `GRANT UPDATE (...)` otorgado al rol `authenticated` (**[20260720120200_rls.sql:133-135](../supabase/migrations/20260720120200_rls.sql#L133)**).
- Mismo patrón en `trainers.status`: `REVOKE UPDATE` general + `GRANT UPDATE (specialty, price)` — el propio entrenador puede editar su tarifa, nunca su estado de aprobación.

## RLS: cobertura

Las 12 tablas base tienen `ROW LEVEL SECURITY` habilitado (**[20260720120200_rls.sql:7-18](../supabase/migrations/20260720120200_rls.sql#L7)**) y `gym_admins` también (**[20260903000000_owner_role_1_types.sql:28](../supabase/migrations/20260903000000_owner_role_1_types.sql#L28)**). Ninguna tabla queda "abierta por default" — sin política, la operación se rechaza.

Único caso de lectura intencionalmente amplia: `gyms` es legible por cualquier autenticado (`using (true)`), necesario para que un usuario recién registrado sin `gym_id` pueda listar gimnasios y elegir uno — `name`/`address`/`hours` no son datos sensibles.

## Fase 12 (2026-09-04) — repasada completa sobre lo nuevo

Repetida la auditoría sobre las 4 migraciones agregadas después de la Fase 1 (owner-role, invitación, check-in, interés de entrenadores) más un grep de todo `supabase/migrations/*.sql` buscando cualquier `app_role() = 'admin'`/`is distinct from 'admin'` que hubiera quedado sin migrar a `app_role_is_staff()`.

**Dos hallazgos reales, ambos corregidos en [20260904000300_storage_staff_parity.sql](../supabase/migrations/20260904000300_storage_staff_parity.sql):**

1. **La política de Storage seguía sin corregir.** Ya estaba documentada como "hallazgo abierto" desde la Fase 1 (ver historial de este archivo) pero nunca se había llegado a aplicar el fix — confirmado con un grep que `20260720120300_storage.sql` seguía comparando `app_role() = 'admin'` literal. Un `owner` no podía ver las fotos de progreso de los clientes de su propio gimnasio.
2. **Hallazgo nuevo, no documentado antes**: la política `"admin reads progress in their gym"` sobre la TABLA `progress_photos` (los metadatos — `storage_key`, `taken_at` — no el archivo en sí) tenía exactamente el mismo problema, y a diferencia de la de Storage, ni siquiera había quedado anotada como pendiente — se le escapó por completo a `20260903000001_owner_role_2_logic.sql`, que sí migró equipment/plans/trainers/client_profiles/payments/checkins a `app_role_is_staff()` pero se saltó esta tabla. Sin este segundo fix, arreglar solo el bucket de Storage hubiera dejado al dueño viendo la miniatura pero no la fecha en que se tomó — un apaño a medias.

Ambos corregidos con el mismo patrón `DROP POLICY` + `CREATE POLICY` ya usado en todo el proyecto. Ninguno es una vulnerabilidad (el error era de *menos* permiso del debido para `owner`, no de más) pero rompían la promesa de "paridad total".

**Los 4 riesgos "a vigilar" que había dejado la Fase 1 para cuando se construyeran esas features — los cuatro ya se construyeron, y los cuatro se implementaron tal como se habían anticipado:**

1. ✅ **Invitación de gimnasio por link/QR**: implementado exactamente como advertido — el código NO reemplaza la validación de `join_gym()`, es un atajo de UX (`gyms.getByInviteCode()` resuelve el código a un `gym_id` real, y ese `gym_id` pasa por el mismo `join_gym()` de siempre, con los mismos chequeos). No se creó ningún `join_gym_by_invite(token)` alternativo que sorteara esas validaciones.
2. ✅ **Check-in por QR real**: `check_in_client()` exige `app_role_is_staff()` — verificado en vivo (no solo leído) que un cliente intentando registrar su propio check-in es rechazado por el servidor.
3. ✅ **Regla de "10 clientes interesados"**: `approve_trainer()` cuenta filas reales de `trainer_candidate_interest` server-side — verificado en vivo que rechaza a los 9 y acepta al llegar a 10.
4. ✅ **Trigger `profiles_role_immutable`**: seguido correctamente en la migración de owner-role (disable → update puntual → enable) y nunca se volvió a tocar fuera de ese patrón.

## Conclusión de Fase 12

No se encontraron vulnerabilidades explotables (ni en la Fase 1 ni en esta repasada) — el principio de "nunca confiar en el frontend" se mantuvo en las 4 features nuevas, verificado con pruebas reales contra el servidor (o el mock que replica sus mismas reglas), no solo leyendo el código. Los dos hallazgos de esta fase eran de permisos *insuficientes* para `owner` (no de más acceso del debido) y ya están corregidos.

Migración: `20260904000300_storage_staff_parity.sql` — escrita, verificada estructuralmente, y **aplicada al proyecto Supabase real el 2026-09-04**. Confirmado con "Success. No rows returned" en el SQL Editor y con una consulta de verificación posterior contra `pg_policies` que muestra las 4 políticas ya con sus nombres nuevos en producción: `objects."client uploads own photos"`, `objects."client replaces own photos"`, `objects."client, their trainer, or gym staff can view photos"` y `progress_photos."staff reads progress in their gym"`.

## Fase 15 (2026-09-04) — QR real + cámara: no cambia el modelo de amenazas

`src/qr.js`/`handleCheckinScan()` reemplazaron el QR decorativo y el check-in 100% manual por generación/lectura real (ver `MIGRATION_PLAN.md` Fase 15). Repasado a propósito porque "ahora una cámara puede disparar una escritura al servidor" suena a superficie nueva — no lo es:

- El payload del QR (`{t:'checkin', gym, u}`) es texto plano, visible y fabricable por cualquiera (nada firmado, nada secreto). Las validaciones de `handleCheckinScan()` (JSON bien formado, `gym` coincide con `state.gym.id`, el cliente existe en `clientsForGym`) son **solo para dar un mensaje de error claro en pantalla** — exactamente el mismo rol que ya cumplían las validaciones del lado cliente en `join_gym()`/`create_gym()` desde la Fase 1.
- La única escritura real que dispara es `BolaAPI.checkins.checkIn(clientId)` → `check_in_client()`, el mismo RPC `security definer` que ya usaba el botón manual "Registrar entrada" desde la Fase 9, con el mismo chequeo `app_role_is_staff()` server-side. Alguien podría fabricar a mano un QR con el `user_id` de un cliente de OTRO gimnasio (nada se lo impide) — el RPC lo rechaza igual, porque deriva `gym_id` de `auth.uid()` del staff que llama, nunca del texto que vino en el QR.
- No hay RPC nuevo, no hay tabla nueva, no hay política nueva. Cero superficie de ataque agregada — es habilitación de UX (cámara en vez de buscar en una lista) sobre un camino de escritura que ya estaba auditado.

## Fase 16 (2026-09-04) — alta de dueño gateada server-side + invitación separada por rol

Hasta esta fase, **cualquiera podía volverse dueño**: `signUpOwner()` mandaba `role:'owner'` como metadata 100% controlada por el navegador que llama, `handle_new_user()` la aceptaba sin más chequeo, y `create_gym()` solo verificaba `app_role()='owner'` + `app_gym_id() is null` — ambas condiciones trivialmente satisfechas apenas alguien se registraba mintiendo el rol. Es el único hallazgo de esta fase que sí es un cambio real de seguridad — todo lo demás es la misma conveniencia de UX que ya era el código de invitación desde la Fase 1.

- **El gate real**: `create_gym()` ahora exige un `owner_invites.token` válido y sin usar, consumido atómicamente (`for update`, nunca dos usos del mismo token) — sin esto, el RPC rechaza. El token lo genera `create_owner_invite()`, que a su vez exige `app_is_platform_admin()` (una sola cuenta marcada hoy: la cuenta real de dueño de Fight Club/CES). `owner_invites` no tiene ninguna política de RLS — ni siquiera "authenticated" puede leer/escribir la tabla directo, solo las 2 funciones `security definer`. `check_owner_invite()` sí está grant-eada a `anon` (necesita resolverse antes de loguearse) pero solo devuelve un booleano, nunca expone la tabla ni permite enumerar tokens válidos.
- **Ocultar el botón "Registrarme" en `viewOwnerAuth` es solo UX, no el gate** — se documenta a propósito para no repetir el error que esta fase vino a corregir: si alguien forzara el registro sin un `?owner_invite=` resuelto (ej. desde la consola del navegador), `create_gym()` lo rechaza igual del lado servidor. "Iniciar sesión" nunca se oculta — las cuentas de dueño ya existentes no dependen de ningún token.
- **Administrador y entrenador ahora "solo por link" — esto NO es un gate de seguridad nuevo**, es exactamente el mismo criterio que ya regía el código de invitación de cliente desde la Fase 1: `gym_invites` tiene una política de `select` pública (`to anon, authenticated using (true)`) porque un código nunca fue el control de acceso real. Alguien podría en teoría llamar a `signUpAdmin()`/`signUpTrainer()` sin pasar por la UI y quedar con una cuenta sin gimnasio (`gym_id null`) — no puede hacer nada con eso (no hay panel sin `gym_id`), y si alguna vez completara el flujo de reanudación seguiría cayendo en el selector de gimnasios de siempre. El control de acceso real al panel sigue siendo, sin cambios, `approve_admin()` (exclusivo del dueño) y `approve_trainer()` (gate de 10 clientes interesados, server-side) — un link de invitación nunca salta esa aprobación.
- **Ningún RPC ni tabla existente perdió una restricción** — `join_gym()` sigue exigiendo rol correcto y `gym_id` todavía sin asignar, sin cambios; `regenerate_gym_invite()` es nuevo pero exige `app_role_is_staff()` + coincidencia de `app_gym_id()`, mismo patrón que el resto de operaciones de staff.
