# Backend de Bolá (Supabase)

Implementa el plano de arquitectura: Postgres con Row Level Security, auth con
roles, y las funciones que corrigen el bug de confirmación de pago (solo el
staff puede confirmar un cobro en efectivo, nunca el cliente).

## Estructura

```
supabase/
  config.toml              config del proyecto (escrito a mano, ver nota abajo)
  migrations/
    ..._schema.sql          tablas, tipos, índices
    ..._functions.sql       alta de cuenta, aprobación de entrenador, cobros en efectivo
    ..._rls.sql              Row Level Security — quién puede leer/escribir qué
    ..._storage.sql          bucket privado de fotos + políticas
  seed.sql                  datos de ejemplo (mismo gym/entrenadores/clientes que el prototipo)
```

## Levantarlo en local

Requiere Docker Desktop **corriendo** (no solo instalado — el daemon tiene que
estar activo) y la Supabase CLI instalada.

**Importante en Windows:** `npx supabase` no funciona — Supabase no publica un
binario para `win32-x64` en npm, va a fallar con "No matching Supabase CLI
binary package found". Instalar con [Scoop](https://scoop.sh) en su lugar:

```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

En Mac/Linux, `npx supabase` sí funciona directo. Con la CLI instalada:

```bash
supabase start      # levanta Postgres + Auth + Storage + Studio en local
supabase db reset   # aplica las migraciones y carga seed.sql
```

`supabase start` imprime la URL de la API, la `anon key` y la `service_role
key` — con eso el frontend (o Postman/curl) ya puede hablarle a la API REST
autogenerada.

Este `config.toml` está escrito a mano (no generado por `supabase init`) —
no pude ejecutar la CLI en este entorno de desarrollo para generarlo o para
probar las migraciones en vivo (ver nota abajo). Los valores son los
estándar de un proyecto nuevo; si `supabase start` se queja de algo puntual,
lo más probable es una diferencia menor de versión en este archivo, no en
las migraciones.

Studio local (para inspeccionar tablas y datos) queda en `http://localhost:54323`.

## Cuentas de prueba (ver seed.sql)

| Rol | Correo | Contraseña |
|---|---|---|
| Admin | admin@bola.app | admin123 |
| Entrenador (aprobado) | marco@bola.app | coach123 |
| Cliente | carla@bola.app | cliente123 |

## Cómo mapea al bug que se corrigió en el frontend

| Acción del prototipo | Antes (frontend puro) | Ahora (backend) |
|---|---|---|
| `generateQr(clientId)` | cualquiera podía llamarlo | `create_cash_charge()` — exige rol admin |
| `confirmQr()` | **botón en la pantalla del cliente** | `confirm_cash_payment()` — exige rol admin; `client_profiles.membership_status` no es editable por UPDATE directo (columna no otorgada) |
| `cancelQr()` | cualquiera podía llamarlo | `cancel_cash_payment()` — exige rol admin |

## Publicar a un proyecto real

1. Crear un proyecto en [supabase.com](https://supabase.com) (gratis para empezar).
2. `supabase link --project-ref <tu-project-ref>`
3. `supabase db push` (aplica las migraciones — **no** corre `seed.sql`, eso es solo para local).
4. Cargar variables de entorno en la app: `SUPABASE_URL` y `SUPABASE_ANON_KEY` (Project Settings → API).

Este paso sí funciona con Docker apagado — `db push` habla directo con el
proyecto en la nube, no necesita levantar nada local.

## Estado de verificación — léelo antes de confiar ciegamente en esto

No pude ejecutar `supabase start` ni `supabase db reset` en este entorno de
desarrollo: Docker Desktop está instalado pero el daemon no arranca acá, y
además la CLI de Supabase no tiene binario para `win32-x64` vía npm (se
necesita Scoop, ver arriba). No hubo forma de correr las migraciones contra
un Postgres real y ver si algo tronaba.

Lo que sí hice: una relectura completa, línea por línea, de las cuatro
migraciones y el seed, buscando específicamente errores de sintaxis, tipos
que no calzan, y — lo más importante — huecos de permisos. Encontré y
corregí un bug real así: había puesto un trigger para proteger
`trainers.status` que bloqueaba *cualquier* cambio, incluido el que hace la
propia función `approve_trainer()` — un admin nunca hubiera podido aprobar a
nadie. Lo cambié por permisos a nivel de columna (mismo mecanismo que ya
usaba en `client_profiles`), que no tiene ese problema.

Aun así, "lo revisé con cuidado" no es lo mismo que "lo corrí y funcionó".
La primera vez que hagas `supabase db reset` en tu máquina (con Docker de
verdad corriendo) es posible que aparezca algún error puntual de sintaxis o
de orden — son 4 archivos y ~500 líneas de SQL sin haber tocado una base de
datos real. Si pasa, decime el mensaje de error exacto y lo arreglamos.

## Lo que falta después de esto

- Conectar `app.js` al backend real (hoy sigue siendo un prototipo 100% en memoria — este backend todavía no está enchufado al frontend).
- Pantalla de selección/unión de gimnasio para entrenador y cliente (`join_gym()` ya existe en el backend; falta el UI, porque el prototipo asume un solo gimnasio).
- Integrar AdMob en el cliente Android (no es un servicio de este backend — corre directo en la app, ver el plano de arquitectura).
