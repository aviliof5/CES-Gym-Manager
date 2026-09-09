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

const FILES = ['index.html', 'styles.css', 'config.js', 'supabase-client.js', 'ads.js', 'qrcode-generator.min.js', 'jsQR.min.js'];
// app.js fue reemplazado por módulos ES bajo src/ (ver docs/MIGRATION_PLAN.md,
// Fase 3) — se copia el directorio completo, no un archivo suelto. assets/
// faltaba acá (bug preexistente: dejaba sin logo.png/íconos/medallas de
// logros a la app nativa, que sí los pide en tiempo de ejecución — ver
// src/data.js brandMark() y assets/logros/ en helpers.js achievementBadge())
// — se agrega, salvo "Iconos Logros" (los JPEG crudos de Google Flow sin
// procesar, ~20MB, solo insumo de scripts/process-achievement-badges.js).
const DIRS = ['src', 'assets'];
const SKIP_DIR_NAMES = new Set(['Iconos Logros']);

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
  fs.cpSync(src, path.join(wwwDir, dir), {
    recursive: true,
    filter: srcPath => !SKIP_DIR_NAMES.has(path.basename(srcPath)),
  });
}

console.log(`www/ armado con ${FILES.length} archivos y ${DIRS.length} directorio(s) (${DIRS.join(', ')}).`);
