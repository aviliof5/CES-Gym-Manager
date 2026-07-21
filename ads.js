/* CES Gym Manager — banner de AdMob (monetización de la app gratuita).
   Solo hace algo cuando corre empaquetada como app Android nativa vía
   Capacitor (window.Capacitor.isNativePlatform()). En el navegador — dev
   server, test-harness, o cualquier preview — todas las funciones son
   no-ops silenciosos, así que no rompe nada del flujo de pruebas actual.

   Usa el App ID y el ad unit de banner DE PRUEBA de Google mientras
   window.BOLA_CONFIG no tenga los reales (ver config.example.js) — esos
   IDs de prueba no están ligados a ninguna cuenta de AdMob, así que no hay
   riesgo de que una cuenta real quede marcada por tráfico inválido durante
   el desarrollo. Antes de publicar en Play Store hay que reemplazarlos. */
'use strict';

window.CesAds = (function () {
  const TEST_BANNER_ID = 'ca-app-pub-3940256099942544/6300978111';
  let initPromise = null;

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  function plugin() {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob;
  }

  function init() {
    if (!initPromise) {
      const AdMob = plugin();
      initPromise = AdMob ? AdMob.initialize().catch(err => console.error('AdMob initialize error', err)) : Promise.resolve();
    }
    return initPromise;
  }

  async function showBanner() {
    if (!isNative()) return;
    await init();
    const AdMob = plugin();
    if (!AdMob) return;
    const cfg = window.BOLA_CONFIG || {};
    try {
      await AdMob.showBanner({
        adId: cfg.admobBannerId || TEST_BANNER_ID,
        adSize: 'ADAPTIVE_BANNER',
        position: 'BOTTOM_CENTER',
        isTesting: !cfg.admobBannerId,
      });
    } catch (err) {
      console.error('AdMob showBanner error', err);
    }
  }

  async function hideBanner() {
    if (!isNative()) return;
    const AdMob = plugin();
    if (!AdMob) return;
    try {
      await AdMob.hideBanner();
    } catch (err) {
      // Puede fallar si nunca se llegó a mostrar un banner — no es un
      // error real, no hace falta molestar al usuario con esto.
    }
  }

  return { showBanner, hideBanner };
})();
