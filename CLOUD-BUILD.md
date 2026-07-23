# Compilar la app de iPhone en la nube (sin tener una Mac)

iOS solo se compila en macOS (ver [IOS.md](IOS.md)). Si no tenés una Mac,
GitHub te presta una: los *runners* de GitHub Actions son máquinas macOS
reales con Xcode ya instalado. El workflow
[`.github/workflows/ios-build.yml`](.github/workflows/ios-build.yml) las usa
para compilar la app por vos, en la nube, gratis.

## Cómo lanzarlo

1. Asegurate de que el repo esté pusheado a GitHub
   (https://github.com/aviliof5/CES-Gym-Manager) — el workflow vive dentro
   del repo, así que se sube con un `git push` normal.
2. En GitHub, entrá a la pestaña **Actions**.
3. Elegí el workflow **"iOS build (nube)"** en la lista de la izquierda.
4. Botón **"Run workflow"** → **Run workflow**. (También corre solo cada vez
   que pusheás cambios de la app.)
5. Esperá ~5–15 min. Cuando el tilde quede verde, abrí esa corrida y bajá el
   artifact **`CES-Gym-Manager-ios-simulator`** (abajo de todo).

Eso confirma que la app **compila** en iOS y te da el `.app` compilado.

## ⚠️ Lo que este build puede y lo que no

| | Build sin firmar (este) | Build firmado (.ipa) |
|---|---|---|
| Necesita cuenta Apple Developer | **No** | Sí (USD 99/año) |
| Verifica que la app compila | ✅ | ✅ |
| Corre en el simulador de iOS (en una Mac) | ✅ | ✅ |
| Se instala en tu iPhone real | ❌ | ✅ |
| Se sube a la App Store | ❌ | ✅ |

El `.app` que baja este workflow es para el **simulador** — Apple no deja
instalar nada en un iPhone físico sin firma de código. Para meterlo en tu
teléfono de verdad, necesitás el paso firmado de abajo.

## Subir a un .ipa instalable (cuando tengas cuenta Apple Developer)

Para producir un `.ipa` que se instale en un iPhone hacen falta tres cosas
de tu cuenta de Apple, cargadas como **Secrets** del repo (Settings →
Secrets and variables → Actions):

1. Un **certificado de distribución** (`.p12`) exportado desde Keychain o
   generado en el portal de Apple Developer.
2. Un **provisioning profile** (`.mobileprovision`) que ligue el App ID
   `com.ces.gymmanager` a tu cuenta.
3. La **contraseña** del `.p12`.

⚠️ **Importante — yo no puedo hacer este paso por vos:** manejar tus
certificados de firma y contraseñas es algo que tenés que cargar vos mismo
en la interfaz de Secrets de GitHub. Yo puedo dejarte el workflow listo para
consumirlos, pero los valores los ponés vos.

### Opción recomendada para builds firmados: Codemagic

Para la parte firmada, [Codemagic](https://codemagic.io/) es bastante más
simple que GitHub Actions: detecta que es un proyecto Capacitor, y tiene un
asistente de firma que se conecta a tu cuenta de Apple y maneja los
certificados y perfiles automáticamente (integración con App Store Connect
via una API key, sin exportar `.p12` a mano). Tiene un tier gratis con
minutos de macOS al mes. Flujo:

1. Entrás con tu cuenta de GitHub y conectás el repo `CES-Gym-Manager`.
2. Elegís workflow **Capacitor / iOS**.
3. En **Distribution → iOS code signing**, conectás tu cuenta de Apple
   Developer (App Store Connect API key) y Codemagic genera/gestiona la firma.
4. Corrés el build → te da un `.ipa` firmado, listo para instalar o para
   subir a la App Store.

GitHub Actions también puede hacer el build firmado (con los secrets de
arriba y una acción como `apple-actions/import-codesign-certs`), pero
configurar la firma a mano es más engorroso que dejar que Codemagic la maneje.

## Hacer la app funcional (conectada a Supabase) en el build de la nube

Por defecto el workflow usa `config.example.js` (placeholder), así que la
app compila pero no se conecta a tu Supabase. Para que el build de la nube
apunte a tu proyecto real, guardá tu `config.js` como secret:

1. GitHub → repo → **Settings → Secrets and variables → Actions → New
   repository secret**.
2. Nombre: `BOLA_CONFIG_JS`.
3. Valor: pegá el **contenido completo** de tu `config.js` local (el
   `window.BOLA_CONFIG = { ... }`).

El workflow detecta ese secret y lo usa en vez del placeholder. (La anon key
de Supabase es pública por diseño — protegida por RLS — pero igual conviene
tenerla como secret y no commiteada, sobre todo con el repo público.)
