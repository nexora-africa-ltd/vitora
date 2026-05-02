/**
 * bundle-standalone.js
 *
 * Copies the Next.js standalone build output into the Tauri resource directory
 * so it gets bundled into the installer.
 *
 * Usage: node scripts/bundle-standalone.js
 * Run after `npm run build:web` and before `npm run build:tauri`.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WEB_APP_DIR = path.resolve(__dirname, '../../web-app');
const STANDALONE_SRC = path.join(WEB_APP_DIR, '.next/standalone');
const STATIC_SRC = path.join(WEB_APP_DIR, '.next/static');
const PUBLIC_SRC = path.join(WEB_APP_DIR, 'public');
const DEST = path.resolve(__dirname, '../src-tauri/standalone');

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    console.error(`Source not found: ${src}`);
    process.exit(1);
  }

  // Use rsync for speed if available, fallback to cp -r
  try {
    execSync(`rsync -a --delete "${src}/" "${dest}/"`, { stdio: 'pipe' });
  } catch {
    // Fallback: rm + cp
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    execSync(`cp -r "${src}" "${dest}"`, { stdio: 'pipe' });
  }
}

console.log('Bundling Next.js standalone build for Tauri...');

// 1. Copy standalone server
console.log(`  Copying standalone build → ${DEST}`);
copyDirSync(STANDALONE_SRC, DEST);

// 2. Copy static assets into standalone/.next/static
const staticDest = path.join(DEST, '.next/static');
console.log(`  Copying static assets → ${staticDest}`);
copyDirSync(STATIC_SRC, staticDest);

// 3. Copy public assets into standalone/public
const publicDest = path.join(DEST, 'public');
console.log(`  Copying public assets → ${publicDest}`);
copyDirSync(PUBLIC_SRC, publicDest);

// 4. Report size
const sizeOutput = execSync(`du -sh "${DEST}"`).toString().trim();
console.log(`  Bundle size: ${sizeOutput.split('\t')[0]}`);
console.log('Done!');
