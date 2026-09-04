/* Bolá — generación y lectura real de QR (Fase 15, ver docs/MIGRATION_PLAN.md).
   Hasta acá los "QR" de la app (código de invitación del dueño, "Mi QR" del
   cliente) eran un cuadriculado de CSS puramente decorativo — nada
   escaneable de verdad, y el check-in real se hacía con un click manual del
   staff por cliente (ver el comentario que había en actions.js). Este
   módulo reemplaza eso por códigos QR reales (generados con la librería
   vendorizada `qrcode-generator.min.js`, sin CDN — funciona offline en la
   PWA y dentro de la app empaquetada con Capacitor) y una lectura real por
   cámara (`jsQR.min.js`).

   IMPORTANTE — la seguridad sigue sin vivir acá: lo que hace este módulo es
   puro cliente (dibujar/leer píxeles). El check-in real sigue pasando por
   `check_in_client()` en el servidor (security definer, exige
   `app_role_is_staff()`) — leer un QR es solo un atajo de UX para no tener
   que buscar al cliente en una lista y clickear "Registrar entrada" a mano;
   ver `handleCheckinScan` en actions.js, que llama exactamente al mismo
   RPC que ya usaba ese botón. Nada de esto reemplaza esa validación server-side.

   Ambas piezas se cargan como <script> globales (no ES modules) desde
   index.html/test-harness.html, igual que mock-client.js/ads.js —
   `window.qrcode` (generación) y `window.jsQR` (lectura). */
'use strict';

/* ------------------------------- generación ------------------------------- */

// Dibuja `text` como QR dentro de `canvas`, ocupando exactamente `boxPx` de
// lado (en CSS px) sin importar el devicePixelRatio — nítido en pantallas
// retina, sin blur. Corrección de errores 'M' (15%, el default razonable
// para un código que se muestra en una pantalla, no impreso).
export function drawQrCode(canvas, text, boxPx = 64) {
  if (!window.qrcode) throw new Error('Librería de QR no disponible (qrcode-generator.min.js no cargó).');
  const qr = window.qrcode(0, 'M'); // typeNumber 0 = auto (elige el tamaño mínimo que entra el texto)
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const margin = 2; // "quiet zone" en módulos — sin esto, algunos lectores no lo reconocen
  const totalModules = count + margin * 2;
  const dpr = window.devicePixelRatio || 1;
  const pxSize = Math.round(boxPx * dpr);
  canvas.width = pxSize;
  canvas.height = pxSize;
  canvas.style.width = boxPx + 'px';
  canvas.style.height = boxPx + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(pxSize / totalModules, pxSize / totalModules); // 1 unidad = 1 módulo
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, totalModules, totalModules);
  ctx.fillStyle = '#0A0A0A'; // negro de marca — sigue siendo alto contraste, escaneable
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(c + margin, r + margin, 1, 1);
    }
  }
}

// Se llama después de cada render() (ver router.js) — busca todo
// `<canvas data-qr="...">` recién insertado por el innerHTML nuevo y lo
// dibuja. `data-qr-painted` evita redibujar si el texto no cambió (evita
// trabajo de más en cada re-render mientras la pantalla no cambia de QR).
export function paintQrCodes(root) {
  root.querySelectorAll('canvas[data-qr]').forEach(canvas => {
    const text = canvas.dataset.qr;
    const boxPx = Number(canvas.dataset.qrSize) || 64;
    const key = text + ':' + boxPx;
    if (canvas.dataset.qrPainted === key) return;
    try {
      drawQrCode(canvas, text, boxPx);
      canvas.dataset.qrPainted = key;
    } catch (err) {
      console.error('No se pudo generar el QR:', err);
    }
  });
}

/* -------------------------------- lectura --------------------------------- */
// Escaneo por cámara para la pantalla "Escanear QR" del staff (ver
// viewScanCheckin en owner.js). Cada render() reemplaza todo el HTML del
// panel (ver router.js), así que el <video> se destruye y se vuelve a crear
// en cada re-render mientras esta pantalla está activa (p. ej. al mostrar
// el toast de "cliente registrado"). Por eso `ensureQrScanner` NO vuelve a
// pedir la cámara si ya hay un stream abierto — solo reconecta ese mismo
// stream al <video> nuevo — y el loop de lectura busca el <video> vigente
// por id en cada frame en vez de guardar una referencia vieja.

let stream = null;
let rafId = null;
let lastDecoded = null;
let lastDecodedAt = 0;
let currentOnDecode = null;
let scanCanvas = null;

export function isQrScannerActive() {
  return !!stream;
}

function loop(videoElId) {
  if (!scanCanvas) scanCanvas = document.createElement('canvas');
  const ctx = scanCanvas.getContext('2d', { willReadFrequently: true });
  const tick = () => {
    if (!stream) { rafId = null; return; } // se llamó stopQrScanner() mientras tanto
    const videoEl = document.getElementById(videoElId);
    if (videoEl && videoEl.readyState >= videoEl.HAVE_CURRENT_DATA && videoEl.videoWidth) {
      scanCanvas.width = videoEl.videoWidth;
      scanCanvas.height = videoEl.videoHeight;
      ctx.drawImage(videoEl, 0, 0, scanCanvas.width, scanCanvas.height);
      const imgData = ctx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
      const result = window.jsQR && window.jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
      if (result && result.data && currentOnDecode) {
        const now = Date.now();
        // Throttle: el mismo código leído en frames seguidos (el staff sigue
        // apuntando la cámara al mismo cliente) no dispara la acción de
        // nuevo hasta pasados 2.5s — un código DISTINTO sí dispara al toque.
        if (result.data !== lastDecoded || now - lastDecodedAt > 2500) {
          lastDecoded = result.data;
          lastDecodedAt = now;
          currentOnDecode(result.data);
        }
      }
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

// Pide la cámara (una sola vez) y la conecta al <video id="videoElId">
// vigente en el DOM. Lanza si el usuario niega el permiso o no hay cámara
// — el llamador (router.js) lo atrapa y lo muestra como error de pantalla,
// no como excepción no manejada.
export async function ensureQrScanner(videoElId, onDecode) {
  currentOnDecode = onDecode;
  if (!window.jsQR) throw new Error('Librería de lectura de QR no disponible (jsQR.min.js no cargó).');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Este navegador no puede acceder a la cámara.');
  }
  if (!stream) {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  }
  const videoEl = document.getElementById(videoElId);
  if (videoEl && videoEl.srcObject !== stream) {
    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {}); // autoplay puede rechazar sin gesto en algunos navegadores; no es fatal
  }
  if (!rafId) loop(videoElId);
}

// Corta la cámara de verdad (libera el hardware) — se llama apenas la
// pantalla deja de ser "scanCheckin" (ver router.js), para no dejar el LED
// de la cámara prendido de fondo si el staff navega a otra tab.
export function stopQrScanner() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  lastDecoded = null;
  lastDecodedAt = 0;
  currentOnDecode = null;
}
