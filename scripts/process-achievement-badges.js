// Script de uso único: convierte los JPEGs crudos que Google Flow generó en
// assets/Iconos Logros/ (fondo blanco sólido, sin transparencia — ver
// docs/achievement_badge_prompt.md) en PNGs recortados en círculo con fondo
// transparente, nombrados <categoria>_<tier>.png en assets/logros/. No se
// re-ejecuta en cada build: una vez generados, los PNG quedan versionados.
'use strict';
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'assets', 'Iconos Logros');
const OUT_DIR = path.join(__dirname, '..', 'assets', 'logros');
const SIZE = 160; // ~3x el tamaño máximo real (56px, ver achievementBadge()) para verse nítido en pantallas retina

// Mapeo armado a mano mirando cada imagen (ver conversación) — el nombre de
// archivo que pone Flow no indica categoría/tier de forma confiable.
const MAP = {
  'Diseño_de_insignia_circular_2K_202609091443.jpeg': 'constancia_diamante',
  'Diseño_de_insignia_circular_cardio_2K_202609091446.jpeg': 'cardio_oro',
  'Diseño_de_insignia_circular_card…_2K_202609091446.jpeg': 'cardio_diamante',
  'Diseño_de_insignia_circular_gimn…_2K_202609091442 (2).jpeg': 'constancia_oro',
  'Diseño_de_insignia_circular_gimn…_2K_202609091442.jpeg': 'constancia_bronce',
  'Diseño_de_insignia_circular_gimn…_2K_202609091444.jpeg': 'fuerza_plata',
  // 'Diseño_de_insignia_circular_gimn…_2K_202609091449 (1).jpeg' — excluida:
  // salió un clipboard/libreta en vez de un calendario, no sirve para "clases".
  'Diseño_de_insignia_circular_gimn…_2K_202609091449.jpeg': 'clases_plata',
  'Diseño_de_insignia_circular_para…_2K_202609091447.jpeg': 'medidas_diamante',
  'Diseño_de_ícono_circular_2K_202609091447.jpeg': 'medidas_plata',
  'Diseño_de_ícono_de_gimnasio_2K_202609091444.jpeg': 'fuerza_diamante',
  'Diseño_de_ícono_de_insignia_2K_202609091443.jpeg': 'constancia_plata',
  'Diseño_de_ícono_de_insignia_2K_202609091444 (1).jpeg': 'fuerza_bronce',
  'Diseño_de_ícono_de_insignia_2K_202609091444.jpeg': 'fuerza_oro',
  'Diseño_de_ícono_de_insignia_2K_202609091445.jpeg': 'cardio_bronce',
  'Diseño_de_ícono_de_insignia_2K_202609091446.jpeg': 'cardio_plata',
  'Diseño_de_ícono_de_insignia_2K_202609091447.jpeg': 'medidas_bronce',
  'Diseño_insignia_de_gimnasio_2K_202609091448.jpeg': 'clases_bronce',
  'Diseño_ícono_insignia_gimnasio_2K_202609091447.jpeg': 'medidas_oro',
};

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Máscara circular: un poco más chica que el lienzo completo para
  // recortar justo por dentro del anillo metálico de la medalla y no dejar
  // ni un borde de fondo blanco.
  const maskR = Math.round(SIZE * 0.46);
  const c = SIZE / 2;
  const maskSvg = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}"><circle cx="${c}" cy="${c}" r="${maskR}" fill="#fff"/></svg>`
  );
  const mask = await sharp(maskSvg).png().toBuffer();

  let done = 0;
  for (const [file, outName] of Object.entries(MAP)) {
    const srcPath = path.join(SRC_DIR, file);
    if (!fs.existsSync(srcPath)) {
      console.warn(`Falta el archivo: ${file}`);
      continue;
    }
    const outPath = path.join(OUT_DIR, `${outName}.png`);
    await sharp(srcPath)
      .resize(SIZE, SIZE, { fit: 'cover' })
      .ensureAlpha()
      .composite([{ input: mask, blend: 'dest-in' }])
      .png({ compressionLevel: 9 })
      .toFile(outPath);
    done++;
    console.log(`${outName}.png ok`);
  }
  console.log(`Listo: ${done} medallas procesadas en ${path.relative(process.cwd(), OUT_DIR)}/`);
}

main().catch(err => { console.error(err); process.exit(1); });
