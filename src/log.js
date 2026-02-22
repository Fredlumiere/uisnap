import fs from 'fs';
import path from 'path';
import os from 'os';

const DROP_DIR = path.join(os.homedir(), 'Desktop', 'uisnap drop');
const LOG_PATH = path.join(DROP_DIR, 'uisnap-log.json');

function readLog() {
  if (!fs.existsSync(LOG_PATH)) return { entries: {} };
  try {
    return JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8'));
  } catch {
    return { entries: {} };
  }
}

function writeLog(log) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

/**
 * Log a new generation or revision.
 * @param {string} sourceFile - Original screenshot/video filename
 * @param {string} outputFile - Generated SVG filename
 * @param {object} opts - { style, notes, revision }
 */
export function logGeneration(sourceFile, outputFile, opts = {}) {
  const log = readLog();
  const key = path.basename(sourceFile, path.extname(sourceFile));

  if (!log.entries[key]) {
    log.entries[key] = {
      source: path.basename(sourceFile),
      created: new Date().toISOString(),
      revisions: []
    };
  }

  const entry = log.entries[key];
  const revNum = entry.revisions.length + 1;

  entry.revisions.push({
    revision: revNum,
    output: path.basename(outputFile),
    timestamp: new Date().toISOString(),
    style: opts.style || null,
    notes: opts.notes || null
  });

  entry.latest = path.basename(outputFile);
  entry.revisionCount = revNum;

  writeLog(log);
  return revNum;
}

/**
 * Get status of all tracked generations.
 */
export function getStatus() {
  const log = readLog();
  return log.entries;
}

/**
 * Get the next version filename for an output.
 * e.g., if "foo.svg" exists, returns "foo-v2.svg"
 */
export function nextVersionPath(outputPath) {
  if (!fs.existsSync(outputPath)) return outputPath;

  const dir = path.dirname(outputPath);
  const ext = path.extname(outputPath);
  const base = path.basename(outputPath, ext);

  // Strip existing version suffix
  const stripped = base.replace(/-v\d+$/, '');

  let version = 2;
  let candidate;
  do {
    candidate = path.join(dir, `${stripped}-v${version}${ext}`);
    version++;
  } while (fs.existsSync(candidate));

  return candidate;
}
