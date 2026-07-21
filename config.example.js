/* Bolá — configuración del proyecto Supabase.
   Copia este archivo como config.js y reemplaza estos dos valores por los
   de tu proyecto real: Supabase Dashboard → Project Settings → API →
   Project URL / anon public key.
   La "anon key" es pública por diseño (protegida por RLS), no es un secreto
   — igual conviene no versionar config.js si el repo es público, porque
   apunta a tu proyecto específico. */
window.BOLA_CONFIG = {
  supabaseUrl: 'https://TU-PROYECTO.supabase.co',
  supabaseAnonKey: 'sb_publishable_TU_CLAVE_AQUI',

  // Opcional. Ad unit ID de banner de TU cuenta de AdMob (apps.admob.google.com
  // → tu app → Ad units). Mientras esto esté vacío/comentado, ads.js usa el
  // ad unit de PRUEBA de Google — no genera ingresos pero tampoco arriesga
  // la cuenta real durante desarrollo. Solo importa dentro de la app Android
  // empaquetada con Capacitor; no hace nada en el navegador.
  // admobBannerId: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',
};
