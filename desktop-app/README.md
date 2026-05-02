# Vitora HMIS Desktop App (Tauri v2)

## Prerequisites

- **Rust** 1.70+ (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- **Node.js** 20+ (for building the web-app)
- **System dependencies** (Linux only):
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev libgtk-3-dev
  ```

## Development

```bash
# Terminal 1: Start the web-app dev server
cd ../web-app && npm run dev

# Terminal 2: Start Tauri dev (opens native window pointing at web-app)
cd desktop-app
npm install
npm run dev:tauri
```

Or use the combined command (requires `concurrently`):
```bash
cd desktop-app
npm install
npm run dev
```

## Production Build

```bash
# 1. Build the web-app (standalone output)
npm run build:web

# 2. Bundle the standalone build into Tauri resources
node scripts/bundle-standalone.js

# 3. Build the Tauri installer (.msi / .exe)
npm run build:tauri
```

The output installer will be at `src-tauri/target/release/bundle/`.

## Architecture

```
Tauri Shell (Rust) → WebView → http://127.0.0.1:<port>
                                       ↑
                        Node.js sidecar (next start)
                                       ↓
                        Django API (HTTPS, remote)
```

In **dev mode**, Tauri points directly at the running Next.js dev server (port 3009).
In **production**, Tauri spawns a bundled Node.js process running the standalone server.

## Native Capabilities (Phase 3)

- System tray + auto-start
- Auto-update (Ed25519 signed)
- ESC/POS receipt printer
- Serial port (lab equipment)
- Native barcode scanner
- Filesystem export (save dialogs)
