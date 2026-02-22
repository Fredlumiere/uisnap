import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { writeManifest } from './manifest.js';
import { padNumber } from './utils.js';

export async function processGif(inputPath, setDir, name, opts) {
  const numFrames = parseInt(opts.frames, 10);

  const info = await getGifInfo(inputPath);
  console.log(chalk.dim(`  GIF: ${info.duration.toFixed(1)}s, ${info.width}x${info.height}, ${info.frameCount} total frames`));

  const frames = await extractGifFrames(inputPath, setDir, numFrames, info.frameCount);

  const manifestPath = writeManifest(setDir, {
    name,
    source: path.relative(setDir, inputPath),
    sourceType: 'gif',
    frames,
    gif: {
      duration: info.duration,
      resolution: `${info.width}x${info.height}`,
      totalFrames: info.frameCount
    },
    outputHint: opts.format || null,
    styleNotes: opts.style || null
  });

  console.log(chalk.green(`  Extracted ${frames.length} frames to ${setDir}/`));
  console.log(chalk.dim(`  Manifest: ${manifestPath}`));
}

function getGifInfo(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      const video = metadata.streams.find(s => s.codec_type === 'video');
      if (!video) return reject(new Error('No video stream in GIF'));
      resolve({
        duration: parseFloat(metadata.format.duration) || 0,
        width: video.width,
        height: video.height,
        frameCount: parseInt(video.nb_frames, 10) || parseInt(video.nb_read_frames, 10) || 10
      });
    });
  });
}

function extractGifFrames(inputPath, setDir, numFrames, totalFrames) {
  const step = Math.max(1, Math.floor(totalFrames / numFrames));

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters(`select='not(mod(n\\,${step}))'`)
      .frames(numFrames)
      .output(path.join(setDir, 'frame-%03d.png'))
      .outputOptions('-vsync', 'vfr')
      .on('end', () => {
        const frames = [];
        for (let i = 1; i <= numFrames; i++) {
          const fileName = `frame-${padNumber(i, 3)}.png`;
          const filePath = path.join(setDir, fileName);
          if (fs.existsSync(filePath)) {
            frames.push({ file: fileName, frameIndex: (i - 1) * step });
          }
        }
        resolve(frames);
      })
      .on('error', reject)
      .run();
  });
}
