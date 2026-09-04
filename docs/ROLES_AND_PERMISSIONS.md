# Roles y permisos — actual vs. objetivo Fight Club

## Estado actual (3 roles reales en código, 1 en construcción)

| Rol | Alta | Panel | Puede |
|---|---|---|---|
| `admin` | `signUpAdmin` → `create_gym()` (RPC, exige no tener `gym_id` ya asignado) | `viewAdminDash` (**[app.js:865](../app.js#L865)**), tabs: Clientes/Coaches/Facturas/Tráfico/Reseñas | Gestiona equipo/planes, aprueba/rechaza entrenadores, genera y confirma cobros en efectivo. Todo mediado por RPC `security definer` — nunca un `UPDATE` directo a `payments`/`membership_status`. |
| `trainer` | `signUpTrainer` → `join_gym()`, queda `status='pending'` | `viewTrainerDash` (**[app.js:1468](../app.js#L1468)**), tabs: Mis clientes/Perfil | Ve solo los clientes con `trainer_user_id = auth.uid()`, arma su rutina "trainer", edita su propio `specialty`/`price` (columnas revocadas para el resto). No puede cambiar su propio `status`. |
| `client` | `signUpClient` → `join_gym()` + foto de rostro obligatoria | `viewClientHome` (**[app.js:1240](../app.js#L1240)**), tabs: Inicio/Entrenar/Progreso/Tráfico/Pago/Reseñas | Elige plan y entrenador, sube fotos de progreso, ve rutina IA o de su entrenador, ve su cobro pendiente — nunca puede confirmarlo él mismo (eso es exclusivo de staff, ver `confirm_cash_payment`). |
| `owner` *(en construcción, no expuesto en UI todavía)* | `create_gym()`, con la parte 2 de la migración pasa a exigir `app_role() = 'owner'` en vez de `'admin'` | — (no existe pantalla) | Diseño ya escrito en la migración pendiente: paridad total con `admin` vía `app_role_is_staff()`, más aprobación exclusiva de `gym_admins` (`approve_admin`/`reject_admin`). |

## Objetivo del pedido Fight Club (4 roles)

```
OWNER   → crea el gimnasio, ve/hace todo lo que ve/hace ADMIN, aprueba ADMIN
ADMIN   → se une a un gimnasio ya creado por el OWNER, opera el día a día
                (clientes, check-ins, pagos, membresías, incidencias)
                — NO tiene permisos exclusivos de OWNER (no aprueba admins,
                no crea el gimnasio)
TRAINER → clientes propios, rutinas, progreso — requiere 10 clientes
                interesados antes de poder solicitar aprobación
CLIENT  → experiencia "member": entrenamiento del día, progreso, QR de
                check-in, pagos, sin nada administrativo visible
```

Esto es **exactamente** el modelo que ya se diseñó (y se empezó a aplicar) para el rol `owner` en esta misma sesión, antes del pedido de rebrand — ver **[ARCHITECTURE_AUDIT.md §7](ARCHITECTURE_AUDIT.md#7-nota-trabajo-de-owner-ya-en-curso-previo-a-este-pedido)**. La diferencia nueva que introduce el pedido de Fight Club es la regla de "10 clientes interesados" para entrenadores (no existía en el diseño original de owner-role) — ver gap en **[DATABASE_MAP.md](DATABASE_MAP.md)**.

## Regla dura: la seguridad nunca vive en el frontend

Ya es así hoy, y se mantiene sin excepción:

- El `role` que manda el cliente en `signUp` (`options.data.role`) solo *sugiere*; quien decide qué fila crear es `handle_new_user()`, un trigger `security definer` del lado servidor — el cliente no puede insertar directo en `profiles`.
- `gym_id` nunca se acepta como parámetro libre en una escritura sensible — `create_gym()`/`join_gym()` lo derivan de `auth.uid()` y de la fila `gyms` real, no de lo que mande el navegador.
- Toda operación "solo staff" (aprobar, cobrar, confirmar) es un RPC `security definer` con el chequeo de rol *dentro* de la función SQL, repetido — no delegado a que el botón esté oculto en la UI. Ocultar un botón en `app.js` es una comodidad de UX, nunca el control de acceso real.
- RLS está activo en las 12+ tablas — una fila nunca es visible/editable solo porque la app no muestre el botón; si falta la política, la operación es rechazada por Postgres, no por el frontend.

Este documento profundiza el modelo de amenazas en **[SECURITY_AUDIT.md](SECURITY_AUDIT.md)**.
