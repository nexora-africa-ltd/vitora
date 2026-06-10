/**
 * bundle-standalone.js
 *
 * Copies the Next.js standalone build output into a staging directory,
 * then creates a standalone.tar.gz archive for Tauri to bundle as a single resource.
 * The Rust app extracts this archive to AppData on first launch.
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
const STAGING_DIR = path.resolve(__dirname, '../src-tauri/standalone');
const ARCHIVE_DEST = path.resolve(__dirname, '../src-tauri/standalone.tar.gz');
const LEGACY_API_HOST = 'api.vitora.digital';
const TEXT_FILE_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.mjs',
  '.txt',
]);

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    console.error(`Source not found: ${src}`);
    process.exit(1);
  }

  // Platform-aware directory copy
  if (process.platform === 'win32') {
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    fs.mkdirSync(dest, { recursive: true });
    try {
      execSync(
        `robocopy "${src}" "${dest}" /E /NFL /NDL /NJH /NJS /NC /NS`,
        { stdio: 'pipe' }
      );
    } catch (e) {
      if (e.status >= 8) {
        throw new Error(`robocopy failed with exit code ${e.status}`);
      }
    }
  } else {
    try {
      execSync(`rsync -a --delete "${src}/" "${dest}/"`, { stdio: 'pipe' });
    } catch {
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
      execSync(`cp -r "${src}" "${dest}"`, { stdio: 'pipe' });
    }
  }
}

function assertNoLegacyApiHost(dir) {
  const offenders = [];

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!TEXT_FILE_EXTENSIONS.has(path.extname(entry.name))) {
        continue;
      }

      const contents = fs.readFileSync(fullPath, 'utf8');
      if (contents.includes(LEGACY_API_HOST)) {
        offenders.push(path.relative(dir, fullPath));
      }
    }
  }

  walk(dir);

  if (offenders.length > 0) {
    console.error(`  ERROR: Legacy API host '${LEGACY_API_HOST}' found in standalone bundle:`);
    for (const offender of offenders.slice(0, 20)) {
      console.error(`    - ${offender}`);
    }
    if (offenders.length > 20) {
      console.error(`    ...and ${offenders.length - 20} more`);
    }
    process.exit(1);
  }
}

console.log('Bundling Next.js standalone build for Tauri...');

// Remove stale output before copying. If a later step fails, Tauri must not reuse an old archive.
fs.rmSync(STAGING_DIR, { recursive: true, force: true });
if (fs.existsSync(ARCHIVE_DEST)) {
  fs.unlinkSync(ARCHIVE_DEST);
}

// 1. Copy standalone server to staging
console.log(`  Copying standalone build → ${STAGING_DIR}`);
copyDirSync(STANDALONE_SRC, STAGING_DIR);

// 2. Copy static assets into staging/.next/static
const staticDest = path.join(STAGING_DIR, '.next/static');
console.log(`  Copying static assets → ${staticDest}`);
copyDirSync(STATIC_SRC, staticDest);

// 3. Copy public assets into staging/public
const publicDest = path.join(STAGING_DIR, 'public');
console.log(`  Copying public assets → ${publicDest}`);
copyDirSync(PUBLIC_SRC, publicDest);

// 4. Verify critical paths before archiving
const criticalPaths = [
  'server.js',
  'node_modules/next/package.json',
  'node_modules/next/dist/server/next.js',
  '.next',
];
let missing = false;
for (const p of criticalPaths) {
  const full = path.join(STAGING_DIR, p);
  if (!fs.existsSync(full)) {
    console.error(`  ERROR: Missing critical path: ${p}`);
    missing = true;
  }
}
if (missing) {
  console.error('Bundle verification FAILED. Cannot create archive.');
  process.exit(1);
}

assertNoLegacyApiHost(STAGING_DIR);

// 5. Create tar.gz archive
console.log(`  Creating archive → ${ARCHIVE_DEST}`);

if (process.platform === 'win32') {
  // Windows: use tar (available since Windows 10 1803)
  execSync(
    `tar -czf "${ARCHIVE_DEST}" -C "${STAGING_DIR}" .`,
    { stdio: 'inherit' }
  );
} else {
  execSync(
    `tar -czf "${ARCHIVE_DEST}" -C "${STAGING_DIR}" .`,
    { stdio: 'inherit' }
  );
}

// 6. Report archive size
const archiveStats = fs.statSync(ARCHIVE_DEST);
const archiveSizeMB = (archiveStats.size / (1024 * 1024)).toFixed(1);
console.log(`  Archive size: ${archiveSizeMB}MB`);

// 7. Clean up staging directory (not needed in the bundle anymore)
console.log('  Cleaning staging directory...');
fs.rmSync(STAGING_DIR, { recursive: true, force: true });

console.log('Done! standalone.tar.gz is ready for Tauri bundling.');
