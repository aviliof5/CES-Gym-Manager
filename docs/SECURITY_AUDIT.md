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

No se encontraron vulnerabilidades explotables (ni en la Fase 1 ni en esta repasada) — el principio de "nunca confiar en el frontend" se mantuvo en las 4 features nuevas, verificado con pruebas reales contra el servidor (o el mock que replica sus mismas reglas), no solo leyendo el código. Los dos hallazgos de esta fase eran de permisos *insuficientes* para `owner` (no de más acceso del debido) y ya están corregidos — la migración está escrita y verificada estructuralmente, pendiente de aplicarse al proyecto Supabase real.
