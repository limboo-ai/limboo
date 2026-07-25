#!/usr/bin/env node
/**
 * Rasterize the Microsoft Store (MSIX/AppX) tile art from the single source of
 * truth: assets/icon.svg.
 *
 * electron-builder ships placeholder AppX images and will happily build with
 * them — producing a Store listing branded with someone else's logo. It looks
 * for these files under `directories.buildResources`/appx, which for this repo
 * is assets/installer/appx.
 *
 *   npm run gen:appx
 *
 * Store tiles are composited on the app's own black canvas rather than left
 * transparent: Windows draws them against the user's accent colour, and the pink
 * mark on an unknown background is the one place the brand can look broken.
 * Black matches `appx.backgroundColor` in electron-builder.yml.
 *
 * Sizes are the set electron-builder requires (scale-100 baselines plus the
 * targetsize variants Windows uses for the taskbar and Start list).
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets', 'icon.svg');
const OUT_DIR = path.join(ROOT, 'assets', 'installer', 'appx');

/** `[filename, width, height]` — non-square tiles letterbox the mark. */
const TILES = [
  ['Square44x44Logo.png', 44, 44],
  ['Square44x44Logo.targetsize-24_altform-unplated.png', 24, 24],
  ['Square150x150Logo.png', 150, 150],
  ['Square310x310Logo.png', 310, 310],
  ['Wide310x150Logo.png', 310, 150],
  ['StoreLogo.png', 50, 50],
  ['SplashScreen.png', 620, 300],
  ['BadgeLogo.png', 24, 24],
];

const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };

await mkdir(OUT_DIR, { recursive: true });
const svg = await readFile(SRC);

for (const [file, width, height] of TILES) {
  // The mark occupies ~70% of the shorter edge so it never touches the tile
  // border — Store review rejects art that bleeds to the edge.
  const mark = Math.round(Math.min(width, height) * 0.7);
  const rendered = await sharp(svg, { density: 384 })
    .resize(mark, mark, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({ create: { width, height, channels: 4, background: BLACK } })
    .composite([{ input: rendered, gravity: 'centre' }])
    .png()
    .toFile(path.join(OUT_DIR, file));

  console.log(`[appx] wrote ${file} (${width}x${height})`);
}

console.log('[appx] done');
