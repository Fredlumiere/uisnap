import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { processImage } from './process-image.js';
import { processVideo } from './process-video.js';
import { processGif } from './process-gif.js';
import { pasteFromClipboard } from './clipboard.js';
import { checkFfmpeg } from './utils.js';
import { getStatus, logGeneration, nextVersionPath } from './log.js';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg', '.bmp', '.tiff']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v']);
const GIF_EXTS = new Set(['.gif']);
const ALL_EXTS = new Set([...IMAGE_EXTS, ...VIDEO_EXTS, ...GIF_EXTS]);

const DROP_DIR = path.join(os.homedir(), 'Desktop', 'uisnap drop');

export function run(argv) {
  const program = new Command();

  program
    .name('uisnap')
    .description('Prepare screenshots and recordings as reference material for AI-assisted asset generation')
    .version('1.0.0')
    .argument('[input]', 'Path to screenshot or recording (auto-detects newest file in ~/Desktop/uisnap drop/ if omitted)')
    .option('-o, --output <dir>', 'Output directory', '.uisnap')
    .option('-f, --frames <n>', 'Number of frames to extract from video', '5')
    .option('--keyframes', 'Extract only visually distinct frames (scene detection)')
    .option('--format <fmt>', 'Output format hint: svg, lottie, animated-svg')
    .option('--style <desc>', 'Style notes for the AI (e.g., "dark theme, minimal")')
    .option('--name <name>', 'Name for this reference set (default: derived from filename)')
    .option('--all', 'Process all files in ~/Desktop/uisnap drop/')
    .option('--clipboard', 'Paste image from clipboard')
    .option('--clean', 'Remove existing output contents before processing')
    .option('--list', 'List all reference sets in .uisnap/')
    .option('--status', 'Show all generated interpretations and revision counts')
    .action(async (input, opts) => {
      try {
        await execute(input, opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });

  program.parse(argv);
}

function findAllInDropFolder() {
  if (!fs.existsSync(DROP_DIR)) return [];

  const files = [];
  const entries = fs.readdirSync(DROP_DIR);
  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase();
    if (!ALL_EXTS.has(ext)) continue;
    const fullPath = path.join(DROP_DIR, entry);
    const stat = fs.statSync(fullPath);
    files.push({ path: fullPath, name: entry, mtimeMs: stat.mtimeMs });
  }

  return files.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

function findNewestInDropFolder() {
  const files = findAllInDropFolder();
  return files.length > 0 ? files[files.length - 1].path : null;
}

async function execute(input, opts) {
  const outputDir = path.resolve(opts.output);

  // List mode
  if (opts.list) {
    return listSets(outputDir);
  }

  // Status mode
  if (opts.status) {
    return showStatus();
  }

  // Batch mode
  if (opts.all) {
    const files = findAllInDropFolder();
    if (files.length === 0) {
      console.error(chalk.red('No files found in ~/Desktop/uisnap drop/'));
      process.exit(1);
    }
    console.log(chalk.cyan(`\nBatch: ${files.length} file${files.length !== 1 ? 's' : ''} in drop folder\n`));
    let processed = 0;
    let failed = 0;
    for (const file of files) {
      try {
        console.log(chalk.cyan(`[${processed + failed + 1}/${files.length}] ${file.name}`));
        await processFile(file.path, outputDir, opts);
        processed++;
      } catch (err) {
        console.error(chalk.red(`  Failed: ${err.message}`));
        failed++;
      }
    }
    console.log('');
    console.log(chalk.green(`Done: ${processed} processed`) + (failed > 0 ? chalk.red(`, ${failed} failed`) : ''));
    return;
  }

  // Clipboard mode
  if (opts.clipboard) {
    const name = opts.name || `clipboard-${Date.now()}`;
    const setDir = path.join(outputDir, name);
    ensureDir(setDir);
    const imgPath = await pasteFromClipboard(setDir, name);
    return processImage(imgPath, setDir, name, opts);
  }

  // Auto-detect from drop folder if no input provided
  if (!input) {
    const dropFile = findNewestInDropFolder();
    if (dropFile) {
      console.log(chalk.cyan(`Drop folder: ${path.basename(dropFile)}`));
      input = dropFile;
    } else {
      console.error(chalk.red('No input file provided.'));
      console.log('');
      console.log('  Usage:');
      console.log('    uisnap <file>              Process a specific file');
      console.log('    uisnap --clipboard          Paste from clipboard');
      console.log(`    uisnap                      Auto-detect newest file in ~/Desktop/uisnap drop/`);
      process.exit(1);
    }
  }

  await processFile(path.resolve(input), outputDir, opts);
}

async function processFile(inputPath, outputDir, opts) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`);
  }

  const ext = path.extname(inputPath).toLowerCase();
  const name = opts.name || path.basename(inputPath, ext);
  const setDir = path.join(outputDir, name);

  if (opts.clean && fs.existsSync(setDir)) {
    fs.rmSync(setDir, { recursive: true });
    console.log(chalk.dim(`Cleaned: ${setDir}`));
  }

  ensureDir(setDir);

  if (IMAGE_EXTS.has(ext)) {
    await processImage(inputPath, setDir, name, opts);
  } else if (VIDEO_EXTS.has(ext)) {
    await checkFfmpeg();
    await processVideo(inputPath, setDir, name, opts);
  } else if (GIF_EXTS.has(ext)) {
    await checkFfmpeg();
    await processGif(inputPath, setDir, name, opts);
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }
}

function showStatus() {
  const entries = getStatus();
  const keys = Object.keys(entries);

  if (keys.length === 0) {
    console.log(chalk.dim('No interpretations generated yet.'));
    return;
  }

  console.log(chalk.bold('\nGenerated Interpretations:\n'));
  for (const key of keys) {
    const e = entries[key];
    const revLabel = e.revisionCount === 1
      ? chalk.dim('1 version')
      : chalk.cyan(`${e.revisionCount} versions`);
    console.log(`  ${chalk.green(key)}`);
    console.log(`    Source:  ${chalk.dim(e.source)}`);
    console.log(`    Latest:  ${e.latest}  (${revLabel})`);

    if (e.revisions.length > 1) {
      const last = e.revisions[e.revisions.length - 1];
      if (last.style) console.log(`    Style:   ${chalk.dim(last.style)}`);
      if (last.notes) console.log(`    Notes:   ${chalk.dim(last.notes)}`);
    }
    console.log('');
  }
}

function listSets(outputDir) {
  if (!fs.existsSync(outputDir)) {
    console.log(chalk.dim('No .uisnap/ directory found.'));
    return;
  }

  const entries = fs.readdirSync(outputDir, { withFileTypes: true })
    .filter(e => e.isDirectory());

  if (entries.length === 0) {
    console.log(chalk.dim('No reference sets found.'));
    return;
  }

  console.log(chalk.bold('\nReference sets:\n'));
  for (const entry of entries) {
    const manifestPath = path.join(outputDir, entry.name, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const frameCount = manifest.frames ? manifest.frames.length : 0;
      const type = manifest.sourceType || 'unknown';
      const style = manifest.styleNotes || '';
      console.log(`  ${chalk.green(entry.name)} (${type}, ${frameCount} frame${frameCount !== 1 ? 's' : ''})${style ? chalk.dim(` "${style}"`) : ''}`);
    } else {
      console.log(`  ${chalk.yellow(entry.name)} (no manifest)`);
    }
  }
  console.log('');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
