# Empaquetar CES Gym Manager como app iOS (iPhone, con AdMob)

Es la **misma** web app (HTML/CSS/JS) que la de Android, envuelta con
[Capacitor](https://capacitorjs.com/) — pero apuntando a iOS en vez de a
Android. El código del cliente es idéntico; solo cambia el proyecto nativo
que lo contiene y la configuración de AdMob (iOS usa otros IDs).

## ⚠️ Lo primero y más importante: iOS solo se compila en una Mac

Apple **no** permite compilar apps de iPhone en Windows ni en Linux. El
toolchain (Xcode, el compilador Swift/Clang, CocoaPods, el firmador) corre
**solo en macOS**. No hay forma de generar un `.ipa` desde esta PC — ni con
Capacitor, ni con nada.

Por eso este proyecto está preparado en dos mitades:

1. **Lo que ya está listo acá (en Windows):** toda la configuración de
   Capacitor, la web app compilada en `www/`, el wrapper de AdMob con los
   IDs de prueba de iOS, y esta guía. Es una carpeta autocontenida
   (`C:\Users\braya\ces-ios-build`) que se comprime y se lleva a una Mac.
2. **Lo que se hace en la Mac:** instalar dependencias, crear el proyecto
   iOS nativo (`npx cap add ios`), configurar AdMob en el `Info.plist`,
   abrir en Xcode, compilar y correr en un iPhone o simulador.

### ¿Y si no tenés una Mac?

Opciones reales, de menor a mayor costo:

- **Una Mac prestada** (de un amigo, un locutorio, etc.) — con una tarde
  alcanza para compilar y probar.
- **Mac en la nube:** [MacinCloud](https://www.macincloud.com/),
  [MacStadium](https://www.macstadium.com/) — alquilás una Mac por hora/mes
  y entrás por escritorio remoto.
- **CI en la nube:** [Codemagic](https://codemagic.io/) o GitHub Actions con
  runners `macos-latest` compilan iOS sin que toques una Mac (pero
  configurar la firma y los certificados desde CI tiene su curva).

En todos los casos, para **publicar** en la App Store hace falta una
**cuenta de Apple Developer** (USD 99/año). Para solo *probar* en tu propio
iPhone alcanza con una Apple ID gratis (la app dura 7 días firmada así).

## Estructura de la carpeta (`ces-ios-build`)

Mismo patrón que la de Android: el código fuente real vive en `bola gym` y
se versiona en GitHub; acá solo hay **copias** más el proyecto iOS nativo.

- `package.json` — Capacitor + `@capacitor/ios` + el plugin de AdMob
  (`@capacitor-community/admob@6.x`, la misma línea que Android).
- `capacitor.config.json` — `appId` `com.ces.gymmanager`, nombre, `webDir: www`.
- `scripts/build-www.js` — copia los archivos de producción del cliente a `www/`.
- `ads.js` — wrapper de AdMob (compartido con Android). Ya es
  **multiplataforma**: en iOS pide el banner de prueba de iOS
  (`ca-app-pub-3940256099942544/2934735716`), en Android el de Android.
  Fuera de la app nativa es un no-op.
- `www/` — ya generado (la web app lista para empaquetar).
- `ios/` — **todavía no existe**; se crea en la Mac con `npx cap add ios`.

## Pasos en la Mac (de cero a app corriendo)

Requisitos previos en la Mac: [Xcode](https://apps.apple.com/app/xcode/id497799835)
(desde la App Store), [Node.js](https://nodejs.org/), y CocoaPods
(`sudo gem install cocoapods`, o `brew install cocoapods`).

```bash
# 1. Copiar/descomprimir la carpeta ces-ios-build en la Mac y entrar
cd ces-ios-build

# 2. Instalar dependencias de Node (Capacitor + plugin de AdMob)
npm install

# 3. Regenerar www/ y crear el proyecto iOS nativo
npm run build:www
npx cap add ios          # crea ios/ y corre `pod install`
npx cap sync ios         # copia www/ y los plugins al proyecto iOS

# 4. Abrir en Xcode
npx cap open ios
```

Antes de compilar, configurar AdMob en el `Info.plist` (ver siguiente
sección). Después, en Xcode: seleccionar un simulador o un iPhone conectado,
elegir el *Team* de firma en **Signing & Capabilities**, y darle a ▶ (Run).

Cuando cambies algo del cliente web (en `bola gym`), volvés a copiar los
archivos a esta carpeta y corrés `npm run cap:sync` — igual que en Android.

## AdMob en iOS: configuración obligatoria del `Info.plist`

iOS necesita más config que Android. En Xcode, abrir
`ios/App/App/Info.plist` (o editarlo como texto) y agregar:

1. **App ID de AdMob** (de PRUEBA mientras desarrollás):
   ```xml
   <key>GADApplicationIdentifier</key>
   <string>ca-app-pub-3940256099942544~1458002511</string>
   ```
   ⚠️ Ojo: el App ID lleva `~` (no `/`), y el de iOS es **distinto** al de
   Android. Este es el de prueba oficial de Google para iOS.

2. **Permiso de App Tracking Transparency** (iOS 14+). Sin este texto, la
   app crashea al pedir el permiso de tracking:
   ```xml
   <key>NSUserTrackingUsageDescription</key>
   <string>Usamos esto para mostrarte anuncios más relevantes. Podés rechazarlo sin perder ninguna función.</string>
   ```

3. **SKAdNetworkItems** — los IDs de las redes de anuncios para la
   atribución de iOS. Google publica la lista actualizada acá:
   https://developers.google.com/admob/ios/quick-start#update_your_infoplist
   Como mínimo el de Google:
   ```xml
   <key>SKAdNetworkItems</key>
   <array>
     <dict>
       <key>SKAdNetworkIdentifier</key>
       <string>cstr6suwn9.skadnetwork</string>
     </dict>
   </array>
   ```

## AdMob: de prueba a real

Cuando tengas tu cuenta de AdMob ([apps.admob.google.com](https://apps.admob.google.com)):

1. Creá una app de tipo **iOS** (es una app aparte de la de Android — cada
   plataforma tiene su propio App ID y sus propios ad units).
2. Creá un ad unit de tipo **banner** para iOS.
3. En `config.js`, agregá tu ad unit real:
   ```js
   window.BOLA_CONFIG = {
     // ...lo que ya tenías...
     admobBannerId: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',
   };
   ```
   (`ads.js` usa este valor en ambas plataformas; si querés uno distinto por
   plataforma, se puede ramificar con `Capacitor.getPlatform()`.)
4. En `ios/App/App/Info.plist`, reemplazá el `GADApplicationIdentifier` de
   prueba por el **App ID real de iOS** de tu cuenta.
5. Revisá las [políticas de AdMob](https://support.google.com/admob/answer/6128543)
   y las de la App Store para apps con anuncios antes de publicar.

## Publicar en la App Store (resumen)

1. Cuenta de **Apple Developer Program** (USD 99/año).
2. En Xcode: **Product > Archive**, después **Distribute App**.
3. Subir el build a [App Store Connect](https://appstoreconnect.apple.com/).
4. Completar la ficha: nombre, capturas (por cada tamaño de iPhone),
   descripción, **política de privacidad** (obligatoria — hay anuncios y
   datos de usuario), y el cuestionario de *App Privacy* declarando que se
   usa AdMob (identificadores de dispositivo / datos de uso).
5. Enviar a revisión de Apple.

## Lo que falta (checklist para la Mac)

- [ ] `npm install` en la Mac.
- [ ] `npx cap add ios` (crea el proyecto iOS + `pod install`).
- [ ] Configurar los 3 items de AdMob en `Info.plist`.
- [ ] Elegir el Team de firma y compilar/correr en un iPhone o simulador.
- [ ] Crear la cuenta de AdMob y reemplazar los IDs de prueba por los reales.
- [ ] (Para publicar) cuenta de Apple Developer + ficha de App Store.
