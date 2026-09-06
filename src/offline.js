/* Bolá — resiliencia a mala señal (no "sin internet por días": la conexión
   intermitente/lenta típica de un gimnasio con mal wifi/datos, que es el
   caso real que pidió el dueño). Todo vive en localStorage — el volumen de
   datos de esta app (unas pocas decenas de filas en cola como mucho) no
   justifica IndexedDB.

   Dos mecanismos separados, pensados para necesidades distintas:

   1. queueAction/flushQueue — para ESCRITURAS que fallaron por la red
      (marcar una serie del entrenamiento, hacer check-in, confirmar un
      cobro ya generado): se guardan acá tal cual se intentaron y se
      reintentan solas cuando vuelve la señal, respetando el orden en que
      se hicieron (importa: por ejemplo, "crear la sesión de entrenamiento"
      tiene que aplicarse antes que "registrar la serie 3 de esa sesión").

   2. saveSnapshot/loadSnapshot — para LECTURAS: la última versión buena de
      una lista (socios, admins, etc.) que se muestra si la carga en vivo
      falla, en vez de dejar la pantalla en blanco o rota. Se marca
      explícitamente como "puede estar desactualizada" — nunca se hace
      pasar por datos frescos.

   Qué NO cubre a propósito — para no ampliar el riesgo de este cambio a
   costa de la plata del gimnasio:
   - Generar un cobro nuevo (create_cash_charge): el ID del pago lo asigna
     el servidor: permitir uno elegido por el cliente ahí es un cambio de
     esquema más grande y más delicado al tratarse de dinero. CONFIRMAR un
     cobro que YA existe (el caso común: el QR ya se generó con señal, y
     se corta justo al cobrar) sí queda cubierto — no necesita un ID nuevo.
   - Cualquier lectura/escritura de otro rol (dueño creando el gimnasio,
     aprobar administradores/entrenadores, etc.) — se puede sumar después
     con el mismo patrón; esta primera pasada prioriza lo que se pidió:
     que el cliente pueda entrenar y que el staff vea quién pagó. */
'use strict';

const QUEUE_KEY = 'bola_offline_queue';
const SNAPSHOT_PREFIX = 'bola_snapshot_';

// Fallback mínimo por si algún WebView viejo no trae crypto.randomUUID —
// no necesita ser criptográficamente perfecto, solo no chocar entre sí
// (son IDs de fila que el propio dispositivo va a insertar).
export function newUuid() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// true para errores de red (sin conexión, timeout, DNS) — los únicos que
// tiene sentido encolar y reintentar más tarde. Un error de negocio real
// (ej. "ese cobro ya fue procesado") no se arregla reintentando, así que
// esos NO se encolan — se muestran como cualquier otro error. Mismo
// criterio que friendlyError() en helpers.js, para que las dos coincidan
// en qué cuenta como "sin conexión".
export function isNetworkError(err) {
  const msg = (err && err.message) || '';
  return !navigator.onLine || /Failed to fetch|NetworkError|Load failed|network request failed|ERR_INTERNET_DISCONNECTED/i.test(msg);
}

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (_) { return []; }
}
function writeQueue(list) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(list)); } catch (_) { /* localStorage lleno/deshabilitado — la acción ya se aplicó en la pantalla, solo no sobrevive si se cierra la app antes de que vuelva la señal */ }
}

/** Guarda una acción que falló por la red para reintentarla más tarde.
 * `kind` identifica qué handler la procesa (ver QUEUE_HANDLERS en
 * actions.js) — `payload` es lo que ese handler necesita para repetir la
 * llamada a BolaAPI tal cual se hubiera hecho con señal. */
export function queueAction(kind, payload) {
  const list = readQueue();
  list.push({ id: newUuid(), kind, payload, createdAt: new Date().toISOString() });
  writeQueue(list);
  return list.length;
}

export function getQueueSize() { return readQueue().length; }

let flushing = false;
/** Reintenta la cola en orden, deteniéndose apenas algo vuelve a fallar
 * por red (así no se pierde el orden ni se manda una serie 3 antes de que
 * exista la sesión de entrenamiento que la contiene). Un fallo que NO es
 * de red se descarta de la cola (no tiene sentido reintentar algo que el
 * servidor va a rechazar siempre) y se loggea para no perderlo en
 * silencio. `handlers` es {kind: async (payload) => void}; `onProgress`
 * recibe el tamaño restante de la cola después de cada intento. */
export async function flushQueue(handlers, onProgress) {
  if (flushing) return;
  flushing = true;
  try {
    let list = readQueue();
    while (list.length) {
      const item = list[0];
      const handler = handlers[item.kind];
      if (!handler) { list = list.slice(1); writeQueue(list); continue; } // tipo desconocido (ej. versión vieja de la app) — no bloquear el resto de la cola
      try {
        await handler(item.payload);
        list = list.slice(1);
        writeQueue(list);
        if (onProgress) onProgress(list.length);
      } catch (err) {
        if (isNetworkError(err)) break; // sigue sin señal — se reintenta en el próximo flush, sin perder el orden
        console.error('No se pudo sincronizar una acción pendiente — se descarta:', item, err);
        list = list.slice(1);
        writeQueue(list);
      }
    }
  } finally {
    flushing = false;
  }
}

/** Última versión buena de una lectura (ver loadWithFallback en
 * actions.js) — nunca se usa como si fuera un dato fresco, siempre viene
 * acompañada de `savedAt` para que la pantalla pueda avisar que puede
 * estar desactualizada. */
export function saveSnapshot(key, data) {
  try { localStorage.setItem(SNAPSHOT_PREFIX + key, JSON.stringify({ data, savedAt: new Date().toISOString() })); } catch (_) {}
}
export function loadSnapshot(key) {
  try {
    const raw = localStorage.getItem(SNAPSHOT_PREFIX + key);
    return raw ? JSON.parse(raw) : null; // { data, savedAt }
  } catch (_) { return null; }
}
