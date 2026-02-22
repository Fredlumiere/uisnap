import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';

export async function pasteFromClipboard(setDir, name) {
  const platform = process.platform;
  const outPath = path.join(setDir, `${name}.png`);

  if (platform === 'darwin') {
    // macOS: use osascript to check clipboard, then pngpaste or screencapture
    try {
      // Try pngpaste first (if installed)
      execSync(`which pngpaste`, { stdio: 'pipe' });
      execSync(`pngpaste "${outPath}"`, { stdio: 'pipe' });
    } catch {
      // Fall back to osascript + write clipboard
      try {
        execSync(
          `osascript -e 'set png_data to the clipboard as «class PNGf»' -e 'set fp to open for access POSIX file "${outPath}" with write permission' -e 'write png_data to fp' -e 'close access fp'`,
          { stdio: 'pipe' }
        );
      } catch {
        throw new Error(
          'No image found in clipboard. Copy a screenshot first.\n' +
          'Tip: Use Cmd+Shift+4 to capture a region, or install pngpaste (brew install pngpaste)'
        );
      }
    }
  } else if (platform === 'linux') {
    try {
      execSync(`xclip -selection clipboard -t image/png -o > "${outPath}"`, { stdio: 'pipe', shell: true });
    } catch {
      throw new Error('No image in clipboard. Requires xclip (apt install xclip)');
    }
  } else if (platform === 'win32') {
    try {
      execSync(
        `powershell -command "Add-Type -AssemblyName System.Windows.Forms; $img = [System.Windows.Forms.Clipboard]::GetImage(); if ($img -ne $null) { $img.Save('${outPath.replace(/'/g, "''")}') } else { exit 1 }"`,
        { stdio: 'pipe' }
      );
    } catch {
      throw new Error('No image found in clipboard.');
    }
  } else {
    throw new Error(`Clipboard paste not supported on ${platform}`);
  }

  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
    throw new Error('No image found in clipboard.');
  }

  console.log(chalk.dim(`  Pasted from clipboard: ${outPath}`));
  return outPath;
}
