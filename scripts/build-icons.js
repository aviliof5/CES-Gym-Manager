// Rasteriza los SVG de assets/icon-*.svg a los PNG que espera
// @capacitor/assets (icon.png = combinado, icon-foreground.png /
// icon-background.png = capas del adaptive icon).
'use strict';
const sharp = require('sharp');
const path = require('path');

const dir = path.join(__dirname, '..', 'assets');
const SIZE = 1024;

async function main() {
  const fgSvg = require('fs').readFileSync(path.join(dir, 'icon-foreground.svg'));
  const bgSvg = require('fs').readFileSync(path.join(dir, 'icon-background.svg'));

  await sharp(bgSvg).resize(SIZE, SIZE).png().toFile(path.join(dir, 'icon-background.png'));
  await sharp(fgSvg).resize(SIZE, SIZE).png().toFile(path.join(dir, 'icon-foreground.png'));

  // Combinado (para el icon.png "legacy" que también usa @capacitor/assets):
  // fondo lima + la marca encima, misma composición que el adaptive icon.
  const bgBuffer = await sharp(bgSvg).resize(SIZE, SIZE).png().toBuffer();
  await sharp(bgBuffer)
    .composite([{ input: await sharp(fgSvg).resize(SIZE, SIZE).png().toBuffer() }])
    .png()
    .toFile(path.join(dir, 'icon.png'));

  console.log('Íconos generados en assets/: icon.png, icon-foreground.png, icon-background.png');
}

main().catch(err => { console.error(err); process.exit(1); });
