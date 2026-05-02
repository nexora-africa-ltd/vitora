/**
 * download-node.js
 *
 * Downloads the Node.js binary for the target platform and places it in
 * src-tauri/binaries/ using Tauri's sidecar naming convention:
 *   node-x86_64-pc-windows-msvc.exe  (Windows)
 *   node-x86_64-unknown-linux-gnu     (Linux)
 *   node-aarch64-apple-darwin          (macOS ARM)
 *
 * Usage:
 *   node scripts/download-node.js                  # Auto-detect platform
 *   node scripts/download-node.js --target x86_64-pc-windows-msvc  # Cross
 *
 * The Node version is pinned to ensure reproducible builds.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const NODE_VERSION = '22.15.0'; // LTS
const BINARIES_DIR = path.resolve(__dirname, '../src-tauri/binaries');

// Tauri target triple → Node.js download info
const TARGETS = {
  'x86_64-pc-windows-msvc': {
    url: `https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`,
    filename: 'node-x86_64-pc-windows-msvc.exe',
    compressed: false,
  },
  'x86_64-unknown-linux-gnu': {
    url: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz`,
    filename: 'node-x86_64-unknown-linux-gnu',
    compressed: 'tar.xz',
    binaryPath: `node-v${NODE_VERSION}-linux-x64/bin/node`,
  },
  'aarch64-apple-darwin': {
    url: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
    filename: 'node-aarch64-apple-darwin',
    compressed: 'tar.gz',
    binaryPath: `node-v${NODE_VERSION}-darwin-arm64/bin/node`,
  },
  'x86_64-apple-darwin': {
    url: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-x64.tar.gz`,
    filename: 'node-x86_64-apple-darwin',
    compressed: 'tar.gz',
    binaryPath: `node-v${NODE_VERSION}-darwin-x64/bin/node`,
  },
};

function detectTarget() {
  const args = process.argv.slice(2);
  const targetIdx = args.indexOf('--target');
  if (targetIdx !== -1 && args[targetIdx + 1]) {
    return args[targetIdx + 1];
  }

  // Auto-detect from host
  const arch = process.arch === 'x64' ? 'x86_64' : process.arch === 'arm64' ? 'aarch64' : process.arch;
  const platform = process.platform;

  if (platform === 'win32') return `${arch}-pc-windows-msvc`;
  if (platform === 'linux') return `${arch}-unknown-linux-gnu`;
  if (platform === 'darwin') return `${arch}-apple-darwin`;

  console.error(`Unsupported platform: ${platform}/${process.arch}`);
  process.exit(1);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`  Downloading: ${url}`);
    const file = fs.createWriteStream(dest);

    const request = (reqUrl) => {
      https.get(reqUrl, (response) => {
        // Follow redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          const newFile = fs.createWriteStream(dest);
          request(response.headers.location);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} for ${reqUrl}`));
          return;
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0) {
            const pct = Math.round((downloadedBytes / totalBytes) * 100);
            process.stdout.write(`\r  Progress: ${pct}% (${(downloadedBytes / 1024 / 1024).toFixed(1)}MB)`);
          }
        });

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('');
          resolve();
        });
      }).on('error', reject);
    };

    request(url);
  });
}

async function main() {
  const target = detectTarget();
  const config = TARGETS[target];

  if (!config) {
    console.error(`Unsupported target: ${target}`);
    console.error(`Available targets: ${Object.keys(TARGETS).join(', ')}`);
    process.exit(1);
  }

  console.log(`Downloading Node.js v${NODE_VERSION} for ${target}...`);
  fs.mkdirSync(BINARIES_DIR, { recursive: true });

  const destPath = path.join(BINARIES_DIR, config.filename);

  // Skip if already exists and is the right size
  if (fs.existsSync(destPath)) {
    const stats = fs.statSync(destPath);
    if (stats.size > 10 * 1024 * 1024) {
      console.log(`  Already exists (${(stats.size / 1024 / 1024).toFixed(1)}MB), skipping.`);
      console.log(`  Delete ${destPath} to force re-download.`);
      return;
    }
  }

  if (!config.compressed) {
    // Direct binary download (Windows .exe)
    await download(config.url, destPath);
  } else {
    // Download archive, extract binary
    const archivePath = path.join(BINARIES_DIR, `node-archive.${config.compressed}`);
    await download(config.url, archivePath);

    console.log('  Extracting node binary...');
    if (config.compressed === 'tar.xz') {
      execSync(`tar -xf "${archivePath}" -C "${BINARIES_DIR}" "${config.binaryPath}"`, { stdio: 'pipe' });
    } else {
      execSync(`tar -xzf "${archivePath}" -C "${BINARIES_DIR}" "${config.binaryPath}"`, { stdio: 'pipe' });
    }

    // Move binary to expected location
    const extractedBin = path.join(BINARIES_DIR, config.binaryPath);
    fs.renameSync(extractedBin, destPath);

    // Clean up archive and extracted directories
    fs.unlinkSync(archivePath);
    const extractedDir = path.join(BINARIES_DIR, config.binaryPath.split('/')[0]);
    fs.rmSync(extractedDir, { recursive: true, force: true });

    // Make executable
    fs.chmodSync(destPath, 0o755);
  }

  const finalSize = fs.statSync(destPath).size;
  console.log(`  Done! ${config.filename} (${(finalSize / 1024 / 1024).toFixed(1)}MB)`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
