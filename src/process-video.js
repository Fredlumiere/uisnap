import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import chalk from 'chalk';
import { writeManifest } from './manifest.js';
import { padNumber } from './utils.js';

export async function processVideo(inputPath, setDir, name, opts) {
  const numFrames = parseInt(opts.frames, 10);

  // Get video info
  const info = await getVideoInfo(inputPath);
  const duration = info.duration;
  const width = info.width;
  const height = info.height;
  const fps = info.fps;

  console.log(chalk.dim(`  Video: ${duration.toFixed(1)}s, ${width}x${height}, ${fps}fps`));

  let frames;
  if (opts.keyframes) {
    console.log(chalk.dim(`  Extracting up to ${numFrames} keyframes (scene detection)...`));
    frames = await extractKeyframes(inputPath, setDir, name, numFrames, duration);
  } else {
    console.log(chalk.dim(`  Extracting ${numFrames} frames at uniform intervals...`));
    frames = await extractUniformFrames(inputPath, setDir, name, numFrames, duration);
  }

  const manifestPath = writeManifest(setDir, {
    name,
    source: path.relative(setDir, inputPath),
    sourceType: 'video',
    frames,
    video: {
      duration,
      resolution: `${width}x${height}`,
      fps
    },
    outputHint: opts.format || null,
    styleNotes: opts.style || null
  });

  console.log(chalk.green(`  Extracted ${frames.length} frames to ${setDir}/`));
  console.log(chalk.dim(`  Manifest: ${manifestPath}`));
}

function getVideoInfo(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      const video = metadata.streams.find(s => s.codec_type === 'video');
      if (!video) return reject(new Error('No video stream found'));
      resolve({
        duration: parseFloat(metadata.format.duration) || 0,
        width: video.width,
        height: video.height,
        fps: eval(video.r_frame_rate) || 30
      });
    });
  });
}

function extractUniformFrames(inputPath, setDir, name, numFrames, duration) {
  return new Promise((resolve, reject) => {
    const pad = String(numFrames).length;
    const interval = duration / (numFrames + 1);
    const timestamps = [];
    for (let i = 1; i <= numFrames; i++) {
      timestamps.push(+(interval * i).toFixed(2));
    }

    const frames = [];
    let count = 0;

    // Extract one frame at a time to control naming
    const extractNext = () => {
      if (count >= timestamps.length) return resolve(frames);
      const ts = timestamps[count];
      const idx = count + 1;
      const fileName = `frame-${padNumber(idx, 3)}.png`;

      ffmpeg(inputPath)
        .seekInput(ts)
        .frames(1)
        .output(path.join(setDir, fileName))
        .on('end', () => {
          frames.push({ file: fileName, timestamp: ts });
          count++;
          extractNext();
        })
        .on('error', reject)
        .run();
    };

    extractNext();
  });
}

function extractKeyframes(inputPath, setDir, name, maxFrames, duration) {
  return new Promise((resolve, reject) => {
    // First, use scene detection to find timestamps of scene changes
    const sceneTimestamps = [];

    ffmpeg(inputPath)
      .videoFilters(`select='gt(scene,0.3)',showinfo`)
      .format('null')
      .output('/dev/null')
      .on('stderr', (line) => {
        // Parse showinfo output for timestamps
        const match = line.match(/pts_time:([\d.]+)/);
        if (match) {
          sceneTimestamps.push(parseFloat(match[1]));
        }
      })
      .on('end', () => {
        // Always include first frame
        let selected = [0];

        if (sceneTimestamps.length > 0) {
          // Pick up to maxFrames-1 scene changes (evenly spaced if too many)
          if (sceneTimestamps.length <= maxFrames - 1) {
            selected = selected.concat(sceneTimestamps);
          } else {
            const step = sceneTimestamps.length / (maxFrames - 1);
            for (let i = 0; i < maxFrames - 1; i++) {
              selected.push(sceneTimestamps[Math.floor(i * step)]);
            }
          }
        } else {
          // No scene changes detected, fall back to uniform
          console.log(chalk.dim('  No scene changes detected, using uniform intervals'));
          const interval = duration / (maxFrames + 1);
          for (let i = 1; i <= maxFrames; i++) {
            selected.push(+(interval * i).toFixed(2));
          }
        }

        // Deduplicate and sort
        selected = [...new Set(selected.map(t => +t.toFixed(2)))].sort((a, b) => a - b);

        // Extract the selected frames
        const pad = String(selected.length).length;
        const frames = [];
        let count = 0;

        const extractNext = () => {
          if (count >= selected.length) return resolve(frames);
          const ts = selected[count];
          const idx = count + 1;
          const fileName = `frame-${padNumber(idx, 3)}.png`;

          ffmpeg(inputPath)
            .seekInput(ts)
            .frames(1)
            .output(path.join(setDir, fileName))
            .on('end', () => {
              frames.push({ file: fileName, timestamp: ts });
              count++;
              extractNext();
            })
            .on('error', reject)
            .run();
        };

        extractNext();
      })
      .on('error', (err) => {
        // Scene detection failed, fall back to uniform
        console.log(chalk.dim('  Scene detection failed, using uniform intervals'));
        extractUniformFrames(inputPath, setDir, name, maxFrames, duration)
          .then(resolve)
          .catch(reject);
      })
      .run();
  });
}
