# Auditoría de seguridad — estado actual

Fase 1, solo lectura. Cubre RLS, roles, `gym_id`, `user_id`, RPC, Storage y Auth tal como están hoy en las migraciones aplicadas.

## Principio verificado: nada depende del frontend

Revisadas las 6 migraciones (`schema`, `functions`, `rls`, `storage`, + las 2 de owner-role) y `supabase-client.js`/`mock-client.js` completos. Conclusión: **el control de acceso real vive en Postgres, no en `app.js`.**

- `app.js` oculta botones según `state.myProfile.role`/`state.myTrainer.status` — es UX, no seguridad. Si alguien llamara a `BolaAPI.trainers.approve(id)` directo desde la consola del navegador sin ser admin, `approve_trainer()` revisa `app_role()` server-side y rechaza con excepción.
- Ningún `INSERT`/`UPDATE` sensible acepta `gym_id` o `role` como valor libre del cliente: `create_gym()`/`join_gym()` derivan todo de `auth.uid()` y de filas ya existentes en `gyms`; `handle_new_user()` decide qué tabla poblar según el `role` en `raw_user_meta_data`, pero ese trigger corre server-side tras el `INSERT` en `auth.users` — el cliente no controla el resultado final, solo la sugerencia inicial.
- Las 3 operaciones de dinero (`create_cash_charge`/`confirm_cash_payment`/`cancel_cash_payment`) son las **únicas** vías de escritura a `payments` y a las columnas de membresía de `client_profiles` — no hay política de INSERT/UPDATE en esas tablas para `authenticated`, y las columnas sensibles de `client_profiles` (`membership_status`, `membership_expires_at`, `last_payment_at`) están explícitamente fuera del `GRANT UPDATE (...)` otorgado al rol `authenticated` (**[20260720120200_rls.sql:133-135](../supabase/migrations/20260720120200_rls.sql#L133)**).
- Mismo patrón en `trainers.status`: `REVOKE UPDATE` general + `GRANT UPDATE (specialty, price)` — el propio entrenador puede editar su tarifa, nunca su estado de aprobación.

## RLS: cobertura

Las 12 tablas base tienen `ROW LEVEL SECURITY` habilitado (**[20260720120200_rls.sql:7-18](../supabase/migrations/20260720120200_rls.sql#L7)**) y `gym_admins` también (**[20260903000000_owner_role_1_types.sql:28](../supabase/migrations/20260903000000_owner_role_1_types.sql#L28)**). Ninguna tabla queda "abierta por default" — sin política, la operación se rechaza.

Único caso de lectura intencionalmente amplia: `gyms` es legible por cualquier autenticado (`using (true)`), necesario para que un usuario recién registrado sin `gym_id` pueda listar gimnasios y elegir uno — `name`/`address`/`hours` no son datos sensibles.

## Hallazgo abierto — política de Storage desalineada con owner-role

La política `"owner, their trainer, or gym admin can view photos"` (**[20260720120300_storage.sql:24-33](../supabase/migrations/20260720120300_storage.sql#L24)**) todavía compara `public.app_role() = 'admin'` literal. Cuando se aplique la parte 2 de la migración de owner-role (que introduce `app_role_is_staff()` para tratar `admin` y `owner` por igual en el resto de las políticas), esta política de Storage quedará **inconsistente**: un `owner` seguiría sin poder ver las fotos de progreso de los clientes de su propio gimnasio, aunque sí pueda ver todo lo demás. No es una migración destructiva de corregir — es un `DROP POLICY` + `CREATE POLICY` igual al resto, agregado a la parte 2 antes de aplicarla, o como una tercera migración pequeña.

**No es una vulnerabilidad** (el error es de menos permiso, no de más) pero rompe la promesa de "paridad total" que pide el dueño del proyecto para el rol `owner` — se lista acá para que quede planificado.

## Riesgos a vigilar en las fases siguientes (nada de esto existe todavía, es guía para cuando se construya)

1. **Invitación de gimnasio por link/QR** (pedido nuevo, ver `DATABASE_MAP.md`): si se implementa como un simple `gym_id` en la URL, hoy `join_gym()` ya no exige ningún secreto — cualquiera que adivine o vea un `gym_id` puede unirse. Si se quiere que el link/QR sea la única vía de alta (no una lista pública), hace falta un token de invitación validado server-side dentro de un `join_gym_by_invite(token)` nuevo, no simplemente exponer el `gym_id` desnudo.
2. **Check-in por QR real**: el check-in nunca debe poder ser escrito por el propio cliente escaneando su "propio" código — la escritura final (INSERT en la futura tabla de eventos) debe exigir `app_role_is_staff()` del lado servidor (quien escanea es staff), igual que `confirm_cash_payment`. El QR del cliente es solo un identificador, no una credencial de escritura.
3. **Regla de "10 clientes interesados"**: si se implementa, el conteo debe calcularse server-side (`count(*)` sobre una tabla de interés real) antes de permitir que `trainers.status` pase a `pending`/sea elegible para aprobación — nunca confiar en un número que mande el frontend.
4. **Trigger `profiles_role_immutable`**: correcto y deseable mantenerlo — cualquier futura necesidad de cambiar un rol (como la migración puntual de admin→owner) debe seguir el mismo patrón ya usado: `ALTER TABLE ... DISABLE TRIGGER` → `UPDATE` puntual y acotado → `ENABLE TRIGGER`, nunca dejarlo desactivado de forma permanente.

## Conclusión de Fase 1

No se encontraron vulnerabilidades explotables en el modelo actual — el diseño ya sigue el principio de "nunca confiar en el frontend" pedido en la sección 16 del pedido. El único punto a corregir antes de dar por completo el rol `owner` es la política de Storage (arriba). El resto de los riesgos listados son de **diseño futuro** (features que todavía no existen), no de código actual.
