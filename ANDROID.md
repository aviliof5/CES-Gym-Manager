# Empaquetar CES Gym Manager como app Android (con AdMob)

La app es HTML/CSS/JS sin dependencias — corre tal cual en un navegador
(`npm run dev`, o abriendo `index.html`). Para publicarla en Play Store y
que los anuncios de AdMob funcionen de verdad, hace falta empaquetarla como
app Android nativa. Eso se hace con [Capacitor](https://capacitorjs.com/):
envuelve esta misma web app en un proyecto Android real y expone plugins
nativos (como AdMob) a `app.js` a través de `window.Capacitor.Plugins`.

## Por qué hay dos carpetas

El proyecto Android real **no vive acá adentro** (`bola gym`), vive en
`C:\Users\braya\ces-android-build`, en su propio repo git separado. Motivo:
`node_modules` de Capacitor tiene decenas de miles de archivos chiquitos, y
OneDrive los bloquea/borra mientras npm los escribe — la instalación se
corrompía siempre (`@capacitor/cli` quedaba sin sus archivos) dentro de esta
carpeta sincronizada. Instalando en una carpeta fuera de OneDrive, la misma
instalación tardó 20 segundos sin un solo error.

- **`bola gym`** (este repo) — el código fuente real del cliente web. Acá es
  donde editás `app.js`, `styles.css`, etc. Se versiona en GitHub.
- **`ces-android-build`** — espacio de compilación. Tiene su propio repo git
  (local, sin remoto todavía) para no perder las customizaciones nativas
  (como el AdMob App ID en el manifest) si hay que reinstalar
  `node_modules`. El código fuente del cliente ahí adentro son *copias* —
  no se editan ahí, se sincronizan desde acá.

## Qué es cada cosa nueva (en `bola gym`)

- **`package.json`** — dependencias de Capacitor + el plugin de AdMob
  (`@capacitor-community/admob`), y los scripts para armar/sincronizar.
  (`npm install` acá va a fallar por lo mismo de OneDrive — usalo como
  referencia de versiones, no lo corras en esta carpeta.)
- **`capacitor.config.json`** — appId (`com.ces.gymmanager`), nombre de la
  app, y `webDir: "www"`.
- **`scripts/build-www.js`** — copia solo los archivos de producción del
  cliente (`index.html`, `app.js`, `styles.css`, `config.js`,
  `supabase-client.js`, `ads.js`) a `www/`, que es lo que Capacitor empaqueta
  dentro del APK. Deja afuera `mock-client.js` y `test-harness.html` (son
  solo para pruebas en el navegador) y todo `supabase/` (SQL, no se sirve al
  cliente).
- **`ads.js`** — wrapper del plugin de AdMob. Solo hace algo corriendo
  empaquetada como app nativa (`Capacitor.isNativePlatform()`); en el
  navegador es un no-op silencioso, así que no rompe nada del flujo de
  pruebas actual (`npm run dev` / `test-harness.html`). Muestra un banner
  mientras el cliente está en su dashboard (`clientHome`) — se oculta para
  admin/entrenador, y cuando cierra sesión.

## Ya está hecho

- `npm install` + `npx cap add android` corridos en `ces-android-build`, y el
  **APK debug compilado con éxito** (`app-debug.apk`, ~7.6 MB, en
  `ces-android-build/android/app/build/outputs/apk/debug/`).
- Plugin `@capacitor-community/admob@6.2.0` instalado y detectado por
  Capacitor. **Nota:** hay que quedarse en la línea 6.x mientras el proyecto
  sea Capacitor 6 — la 8.x exige el toolchain de Capacitor 7 (AGP 8.13,
  Java 21, SDK 36) y no compila acá.
- `android/app/src/main/AndroidManifest.xml` tiene el meta-data
  `com.google.android.gms.ads.APPLICATION_ID` con el **App ID de PRUEBA**
  oficial de Google (`ca-app-pub-3940256099942544~3347511713`) y el permiso
  `com.google.android.gms.permission.AD_ID`.
- `ads.js` pide el banner de prueba (`ca-app-pub-3940256099942544/6300978111`)
  mientras `config.js` no tenga `admobBannerId` propio.
- Toolchain de build instalado en la máquina (fuera de este repo): JDK 17 en
  `C:\Program Files\Eclipse Adoptium`, y el SDK de Android en `C:\Android\sdk`
  (`local.properties` apunta ahí con `sdk.dir=C:/Android/sdk` — barras
  normales, no invertidas, para que Java no las lea como escapes).

## Cuando cambies algo en el cliente web (acá, en `bola gym`)

Sincronizá los archivos a la carpeta de compilación y corré el sync de Capacitor ahí:

```bash
cp index.html app.js styles.css config.js supabase-client.js ads.js "C:\Users\braya\ces-android-build\"
cd "C:\Users\braya\ces-android-build"
npm run cap:sync
```

## Compilar el APK

Con el JDK y el SDK ya instalados en la máquina, el APK debug se compila
por línea de comandos, sin Android Studio:

```bash
cd "C:\Users\braya\ces-android-build\android"
JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot" ./gradlew.bat assembleDebug
```

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`. Es
instalable directo en un celular (activando "orígenes desconocidos") para
probar; los anuncios salen con los IDs de prueba de Google.

Para el AAB firmado que se sube a Play Store conviene [Android Studio](https://developer.android.com/studio)
(`npm run cap:open` lo abre) y `Build > Generate Signed Bundle/APK`, o
`./gradlew.bat bundleRelease` con un keystore configurado.

## AdMob: de prueba a real

Cuando crees tu cuenta de AdMob ([apps.admob.google.com](https://apps.admob.google.com)):

1. Creá la app en AdMob (Android) y un ad unit de tipo banner.
2. En `config.js` (en ambas carpetas, o solo sincronizá de nuevo), agregá:
   ```js
   window.BOLA_CONFIG = {
     // ...lo que ya tenías...
     admobBannerId: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',
   };
   ```
3. En `ces-android-build\android\app\src\main\AndroidManifest.xml`,
   reemplazá el App ID de prueba por el App ID real de tu cuenta, en el
   meta-data `com.google.android.gms.ads.APPLICATION_ID`.
4. Antes de publicar: revisá la [política de contenido de AdMob](https://support.google.com/admob/answer/6128543)
   y las políticas de Play Store para apps con anuncios — hay reglas
   específicas sobre dónde y cómo se pueden mostrar.

## Lo que falta después de esto

- Instalar Android Studio y compilar el APK/AAB por primera vez.
- Firmar la app para poder subirla a Play Store (keystore + configuración
  de firma en Android Studio).
- Crear la cuenta de AdMob y reemplazar los IDs de prueba por los reales.
- Ficha de Play Store: capturas, descripción, política de privacidad
  (obligatoria si hay anuncios y datos de usuario).
