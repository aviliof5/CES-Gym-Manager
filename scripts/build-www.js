// Copia solo los archivos de producción del cliente web a www/, que es el
// webDir que Capacitor empaqueta dentro del APK. Deja afuera a propósito
// mock-client.js y test-harness.html (son solo para pruebas en el
// navegador) y todo lo de supabase/ (migraciones, seed, docs — nada de eso
// se sirve al cliente).
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const wwwDir = path.join(root, 'www');

const FILES = ['index.html', 'styles.css', 'config.js', 'supabase-client.js', 'ads.js'];
// app.js fue reemplazado por módulos ES bajo src/ (ver docs/MIGRATION_PLAN.md,
// Fase 3) — se copia el directorio completo, no un archivo suelto.
const DIRS = ['src'];

fs.rmSync(wwwDir, { recursive: true, force: true });
fs.mkdirSync(wwwDir, { recursive: true });

for (const file of FILES) {
  const src = path.join(root, file);
  if (!fs.existsSync(src)) {
    if (file === 'config.js') {
      console.warn(`Aviso: falta ${file} — copiá config.example.js como config.js con tus datos de Supabase antes de compilar.`);
      continue;
    }
    throw new Error(`Falta ${file}, necesario para armar www/.`);
  }
  fs.copyFileSync(src, path.join(wwwDir, file));
}

for (const dir of DIRS) {
  const src = path.join(root, dir);
  if (!fs.existsSync(src)) throw new Error(`Falta el directorio ${dir}/, necesario para armar www/.`);
  fs.cpSync(src, path.join(wwwDir, dir), { recursive: true });
}

console.log(`www/ armado con ${FILES.length} archivos y ${DIRS.length} directorio(s) (${DIRS.join(', ')}).`);
