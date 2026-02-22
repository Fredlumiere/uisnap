import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { writeManifest } from './manifest.js';
import { formatBytes } from './utils.js';

const MAX_DIMENSION = 4000;

export async function processImage(inputPath, setDir, name, opts) {
  const metadata = await sharp(inputPath).metadata();
  const ext = path.extname(inputPath).toLowerCase();
  const outName = `${name}${ext}`;
  const outPath = path.join(setDir, outName);

  // Copy original
  fs.copyFileSync(inputPath, outPath);
  const size = fs.statSync(outPath).size;

  const frames = [{ file: outName, width: metadata.width, height: metadata.height }];

  // Create a downscaled copy if very large
  const needsDownscale = (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) && ext !== '.svg';
  if (needsDownscale) {
    const thumbName = `${name}-preview.png`;
    const thumbPath = path.join(setDir, thumbName);
    await sharp(inputPath)
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toFile(thumbPath);
    frames.push({ file: thumbName, width: 2000, height: 2000, note: 'downscaled preview' });
    console.log(chalk.dim(`  Created preview: ${thumbName}`));
  }

  const manifestPath = writeManifest(setDir, {
    name,
    source: path.relative(setDir, inputPath),
    sourceType: 'image',
    frames,
    image: {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size
    },
    outputHint: opts.format || null,
    styleNotes: opts.style || null
  });

  console.log(chalk.green(`  Processed: ${outPath} (${metadata.width}x${metadata.height}, ${formatBytes(size)})`));
  console.log(chalk.dim(`  Manifest:  ${manifestPath}`));
}
