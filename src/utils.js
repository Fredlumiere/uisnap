import { execSync } from 'child_process';
import chalk from 'chalk';

export async function checkFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
  } catch {
    console.error(chalk.red('Error: ffmpeg is required for video/GIF processing.'));
    console.error(chalk.dim('Install it with: brew install ffmpeg'));
    process.exit(1);
  }
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function padNumber(n, width) {
  return String(n).padStart(width, '0');
}
