import fs from 'fs';
import path from 'path';

export function writeManifest(setDir, data) {
  const manifestPath = path.join(setDir, 'manifest.json');
  const manifest = {
    version: '1.0',
    created: new Date().toISOString(),
    ...data,
    assets: []
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

export function readManifest(setDir) {
  const manifestPath = path.join(setDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
}
