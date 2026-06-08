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

  // Platform-aware directory copy
  if (process.platform === 'win32') {
    // Windows: use robocopy (built-in, handles long paths)
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    fs.mkdirSync(dest, { recursive: true });
    try {
      // robocopy returns 0-7 for success, 8+ for errors
      const result = execSync(
        `robocopy "${src}" "${dest}" /E /NFL /NDL /NJH /NJS /NC /NS`,
        { stdio: 'pipe' }
      );
    } catch (e) {
      // robocopy exit code 1 = files copied, which is success
      if (e.status >= 8) {
        throw new Error(`robocopy failed with exit code ${e.status}`);
      }
    }
  } else {
    // Unix: use rsync for speed if available, fallback to cp -r
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
try {
  const sizeOutput = execSync(
    process.platform === 'win32'
      ? `powershell -command "(Get-ChildItem -Recurse '${DEST}' | Measure-Object -Property Length -Sum).Sum / 1MB"`
      : `du -sh "${DEST}"`
  ).toString().trim();
  const size = process.platform === 'win32'
    ? `${Math.round(parseFloat(sizeOutput))}MB`
    : sizeOutput.split('\t')[0];
  console.log(`  Bundle size: ${size}`);
} catch {
  console.log('  Bundle size: (could not determine)');
}

// 5. Verify critical paths
const criticalPaths = [
  'server.js',
  'node_modules/next/package.json',
  'node_modules/next/dist/server/next.js',
  '.next',
];
let missing = false;
for (const p of criticalPaths) {
  const full = path.join(DEST, p);
  if (!fs.existsSync(full)) {
    console.error(`  ERROR: Missing critical path: ${p}`);
    missing = true;
  }
}
if (missing) {
  console.error('Bundle verification FAILED. The installer will not work correctly.');
  process.exit(1);
}

console.log('Done!');
