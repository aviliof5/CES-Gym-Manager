// Bolá — genera todos los íconos/splash de la app a partir del logo real
// (assets/logo-source.png, el badge circular con foto que reemplazó al
// isotipo abstracto de mancuerna). Reemplaza la versión anterior de este
// script, que rasterizaba icon-foreground.svg/icon-background.svg (vectores
// simples) — ahora la fuente es un PNG fotográfico, así que todo pasa por
// sharp en vez de por SVGs intermedios.
'use strict';
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'assets');
const SRC = path.join(dir, 'logo-source.png');
// Fondo oscuro de la marca (mismo que background_color/theme_color en
// manifest.webmanifest) — se usa donde el ícono necesita relleno sólido en
// vez de transparencia (maskable, apple-touch, splash).
const BG = '#08080A';

async function main() {
  const src = () => sharp(SRC);

  // Máster liviano para <img> dentro de la app (brandMark(), encabezados de
  // los 4 paneles) — 512px alcanza de sobra al tamaño máximo que se usa hoy
  // (140px, ver BRAND_MARK_SIZES en src/data.js) incluso en pantallas 2x/3x.
  await src().resize(512, 512).png({ quality: 90, compressionLevel: 9 }).toFile(path.join(dir, 'logo.png'));

  // Favicon / ícono "legacy" (el mismo que antes combinaba fondo+isotipo —
  // acá ya viene combinado en el propio logo).
  await src().resize(1024, 1024).png({ compressionLevel: 9 }).toFile(path.join(dir, 'icon.png'));
  await src().resize(192, 192).png({ compressionLevel: 9 }).toFile(path.join(dir, 'icon-192.png'));
  await src().resize(512, 512).png({ compressionLevel: 9 }).toFile(path.join(dir, 'icon-512.png'));

  // Maskable (manifest "purpose":"maskable"): Android puede recortar el
  // ícono a un círculo/squircle, así que el contenido tiene que vivir en la
  // "safe zone" central (~80% del lienzo) sobre un fondo sólido — si no, el
  // aro rosa o el texto "GYM"/tagline quedan cortados por la máscara del SO.
  const maskableLogo = await sharp(SRC).resize(410, 410).png().toBuffer(); // ~80% de 512
  await sharp({ create: { width: 512, height: 512, channels: 4, background: BG } })
    .composite([{ input: maskableLogo, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(dir, 'icon-512-maskable.png'));

  // apple-touch-icon: iOS redondea las esquinas solo (no aplica máscara
  // propia como Android), pero renderiza la transparencia como negro sólido
  // si no se rellena antes — por eso va con fondo sólido a sangre completa.
  const appleLogo = await sharp(SRC).resize(180, 180).png().toBuffer();
  await sharp({ create: { width: 180, height: 180, channels: 4, background: BG } })
    .composite([{ input: appleLogo, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(dir, 'apple-touch-icon.png'));

  // Capas para @capacitor/assets (ícono adaptativo de Android) — mismo
  // criterio de safe zone que el maskable de arriba.
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(dir, 'icon-background.png'));
  const fgLogo = await sharp(SRC).resize(680, 680).png().toBuffer(); // ~66% de 1024
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fgLogo, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(dir, 'icon-foreground.png'));

  // Splash nativo (Capacitor): el mismo logo, centrado, sobre el fondo de
  // marca — como antes era un SVG con el isotipo dibujado a mano, ahora
  // incrusta el PNG real como data URI para no depender de un archivo aparte.
  const splashLogoPx = 760; // ~28% de 2732, misma proporción que el splash anterior
  const splashLogo = await sharp(SRC).resize(splashLogoPx, splashLogoPx).png().toBuffer();
  const splashB64 = splashLogo.toString('base64');
  const splashOffset = (2732 - splashLogoPx) / 2;
  const splashSvg = `<svg viewBox="0 0 2732 2732" xmlns="http://www.w3.org/2000/svg">
  <rect width="2732" height="2732" fill="${BG}"/>
  <image x="${splashOffset}" y="${splashOffset}" width="${splashLogoPx}" height="${splashLogoPx}" href="data:image/png;base64,${splashB64}"/>
</svg>
`;
  fs.writeFileSync(path.join(dir, 'splash.svg'), splashSvg);

  console.log('Íconos generados en assets/ a partir de logo-source.png: logo.png, icon.png, icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon.png, icon-foreground.png, icon-background.png, splash.svg');
}

main().catch(err => { console.error(err); process.exit(1); });
