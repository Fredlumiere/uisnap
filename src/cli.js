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
    .option('--clipboard', 'Paste image from clipboard')
    .option('--clean', 'Remove existing output contents before processing')
    .option('--list', 'List all reference sets in .uisnap/')
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

function findNewestInDropFolder() {
  if (!fs.existsSync(DROP_DIR)) return null;

  let newest = null;
  let newestTime = 0;

  const entries = fs.readdirSync(DROP_DIR);
  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase();
    if (!ALL_EXTS.has(ext)) continue;
    const fullPath = path.join(DROP_DIR, entry);
    const stat = fs.statSync(fullPath);
    if (stat.mtimeMs > newestTime) {
      newestTime = stat.mtimeMs;
      newest = fullPath;
    }
  }

  return newest;
}

async function execute(input, opts) {
  const outputDir = path.resolve(opts.output);

  // List mode
  if (opts.list) {
    return listSets(outputDir);
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

  const inputPath = path.resolve(input);
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
