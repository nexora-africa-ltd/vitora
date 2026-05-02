# Vitora HMIS Desktop App (Tauri v2)

Native desktop wrapper for Vitora HMIS. Bundles the Next.js web-app with a Node.js sidecar inside a Tauri v2 shell — delivering native capabilities (printing, system tray, auto-update) without refactoring the web frontend.

## Architecture

```
┌─ Tauri Shell (Rust, ~10MB) ────────────────────────────────────┐
│  WebView2/WebKit → http://127.0.0.1:<random-port>              │
│  ├─ System tray: Show/Quit, close-to-tray, double-click restore│
│  ├─ Auto-updater: Ed25519 signed, checks releases.vitora.digital│
│  ├─ Printer: ESC/POS via system spooler (lp / copy /B)         │
│  ├─ Notifications: native OS notifications                      │
│  ├─ Deep links: vitora:// URL scheme                            │
│  └─ Window state: persists size/position across sessions        │
└────────────┬───────────────────────────────────────────────────┘
             │ spawns
┌────────────▼───────────────────────────────────────────────────┐
│  Node.js v22 LTS sidecar (bundled binary, ~70MB)               │
│  └─ next start (standalone build of web-app)                    │
│     Env: PORT=<random>, NEXT_PUBLIC_API_URL=<from config>       │
└────────────┬───────────────────────────────────────────────────┘
             │ HTTPS (withCredentials cookies)
┌────────────▼───────────────────────────────────────────────────┐
│  Vitora Cloud API (Django @ Azure)                              │
│  └─ CORS: ^http://127\.0\.0\.1:\d+$ allowed                    │
└────────────────────────────────────────────────────────────────┘
```

**Dev mode**: Tauri opens the running web-app dev server (port 3009) directly — no sidecar needed.
**Production**: Tauri spawns a bundled Node.js process, waits for it to respond, then navigates the WebView.

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Rust | 1.70+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Node.js | 22 LTS | For building web-app + sidecar binary |
| npm | 10+ | Comes with Node 22 |

**Linux only:**
```bash
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev \
  patchelf libssl-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev
```

## Development

```bash
# Terminal 1: Start the web-app dev server (port 3009)
cd ../web-app && npm run dev

# Terminal 2: Start Tauri dev (opens native window)
cd desktop-app && npm install && npm run dev:tauri
```

Or combined:
```bash
cd desktop-app && npm install && npm run dev
```

In dev mode:
- No sidecar is spawned — Tauri loads `http://127.0.0.1:3009`
- Splash screen is closed immediately
- System tray still works (Show/Quit)

## Production Build

```bash
# Full build pipeline (web-app → bundle standalone → download Node → Tauri build)
npm run setup         # download-node + build:web + bundle-standalone
npm run build:tauri   # Tauri build with production config
```

Or step by step:
```bash
npm run build:web              # Next.js standalone build
npm run bundle-standalone      # Copy standalone output to src-tauri/standalone/
node scripts/download-node.js  # Fetch Node.js binary for target platform
npm run build:tauri            # Tauri build → src-tauri/target/release/bundle/
```

Output artifacts:
- **Windows**: `target/release/bundle/nsis/Vitora HMIS_0.1.0_x64-setup.exe` + `.msi`
- **Linux**: `target/release/bundle/deb/` + `appimage/`
- **macOS**: `target/release/bundle/dmg/`

## Project Structure

```
desktop-app/
├── package.json                    # Build scripts (dev, build, setup)
├── scripts/
│   ├── download-node.js            # Downloads Node.js binary for target platform
│   └── bundle-standalone.js        # Copies web-app standalone build
├── src-tauri/
│   ├── tauri.conf.json             # Main config (windows, plugins, bundle)
│   ├── tauri.conf.production.json  # CI override (resources + binaries)
│   ├── Cargo.toml                  # Rust dependencies
│   ├── capabilities/
│   │   └── desktop.json            # Plugin permissions whitelist
│   ├── frontend/
│   │   ├── index.html              # Splash screen (served by frontendDist)
│   │   └── splash.html             # Same as index.html
│   ├── splash.html                 # Source template (with base64 logo)
│   ├── icons/                      # App icons (ico, icns, png)
│   └── src/
│       ├── main.rs                 # Entry point
│       ├── lib.rs                  # App setup: sidecar, tray, plugins, events
│       ├── config.rs               # AppConfig: api_url, first-run detection
│       └── commands/
│           ├── mod.rs              # Command module exports
│           └── printer.rs          # ESC/POS printing + list_printers
└── standalone/                     # (gitignored) Bundled Next.js standalone build
```

## Native Capabilities

| Feature | Plugin/Crate | Frontend API |
|---------|-------------|--------------|
| System tray | Built-in `tray-icon` | — (Rust-only) |
| Close to tray | `WindowEvent::CloseRequested` | — |
| Auto-update | `tauri-plugin-updater` | `checkForUpdates()`, `installUpdate()` |
| Window state | `tauri-plugin-window-state` | Automatic |
| Notifications | `tauri-plugin-notification` | `showNotification()` |
| Deep links | `tauri-plugin-deep-link` | `onDeepLink()` |
| Printing | System `lp`/`copy /B` | `printReceipt()`, `listPrinters()` |
| File export | `tauri-plugin-fs` + `dialog` | `saveFile()` |
| Auto-start | `tauri-plugin-autostart` | — |
| First-run config | Custom `config.rs` | `isFirstRun()`, `getApiUrl()`, `setApiUrl()` |

All frontend wrappers are in `web-app/lib/desktop/index.ts` with graceful browser fallbacks.

## Configuration

On first run, the app prompts for the API server URL via `/desktop-setup`.
Config is stored at:
- **Windows**: `%APPDATA%\digital.vitora.hmis\config.json`
- **Linux**: `~/.config/digital.vitora.hmis/config.json`
- **macOS**: `~/Library/Application Support/digital.vitora.hmis/config.json`

```json
{
  "api_url": "https://api.vitora.digital"
}
```

The sidecar is spawned with `NEXT_PUBLIC_API_URL` set from this config.

## CI/CD

The workflow `.github/workflows/build-desktop.yml` builds for all platforms:

- **Trigger**: Push tag `desktop-v*` or manual dispatch
- **Matrix**: Windows x86_64, Linux x86_64, macOS aarch64
- **Signing**: Ed25519 for updater artifacts, PFX for Windows code signing
- **Output**: GitHub Release (draft) with installers + `latest.json` updater manifest
- **Updater endpoint**: Azure Front Door CDN → Blob Storage at `https://vitora-releases-dzf4f6hmfdadf3gk.z01.azurefd.net/updates`
- **Custom domain** (pending DNS): `https://releases.vitora.digital/updates`

### Required Secrets

| Secret | Status | Purpose |
|--------|--------|---------|
| `TAURI_SIGNING_PRIVATE_KEY` | ✅ Set | Ed25519 key for updater artifact signing |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | ✅ Set | Key password (empty) |
| `WINDOWS_CERTIFICATE_BASE64` | ⚠️ Placeholder | PFX cert for Windows code signing |
| `WINDOWS_CERTIFICATE_PASSWORD` | ⚠️ Placeholder | PFX password |
| `AZURE_STORAGE_CONNECTION_STRING` | ✅ Set | For updater blob upload (vitorareleases) |

## Auth & CORS

The desktop app uses the same httpOnly cookie auth as the web frontend:

1. WebView loads `http://127.0.0.1:<port>` (sidecar)
2. API calls go to `https://api.vitora.digital` with `withCredentials: true`
3. Django sets cookies with `SameSite=None; Secure` (production)
4. CORS allows `^http://127\.0\.0\.1:\d+$` origin
5. `X-Vitora-Client: desktop/0.1.0` header sent for analytics

Cookie persistence: WebView2 stores cookies in its user profile directory, surviving app restarts.

## Next Steps Before Going Live

### Must-Have (Blocking Release)

1. **Procure Windows code signing certificate**
   - Azure Trusted Signing account created (`vitora-signing` in `vitora-rg`)
   - **Next**: Complete identity validation in [Azure Portal](https://portal.azure.com/#view/Microsoft_Azure_CodeSigning) → upload business documents
   - Create certificate profile `vitora-hmis` after identity verification
   - Export PFX → base64-encode → set `WINDOWS_CERTIFICATE_BASE64` and `WINDOWS_CERTIFICATE_PASSWORD`
   - Lead time: 1-2 weeks (identity verification)

2. **Set up custom domain `releases.vitora.digital`** (optional, CDN works without it)
   - Azure Front Door endpoint already provisioned: `vitora-releases-dzf4f6hmfdadf3gk.z01.azurefd.net`
   - Storage account: `vitorareleases` (eastus), container: `releases`, public blob access
   - To enable custom domain, add these records in **Vercel DNS**:
     ```
     CNAME  releases  →  vitora-releases-dzf4f6hmfdadf3gk.z01.azurefd.net
     CAA    0 issue "digicert.com"   (required for Azure managed TLS cert)
     ```
   - Then run: `az afd custom-domain create --profile-name vitora-cdn --resource-group vitora-rg --custom-domain-name releases-domain --host-name releases.vitora.digital --certificate-type ManagedCertificate --minimum-tls-version TLS12`
   - Associate domain with route: `az afd route update ... --custom-domains releases-domain`
   - Update `tauri.conf.json` endpoint back to `https://releases.vitora.digital/updates`

3. **End-to-end build test**
   - Tag `desktop-v0.1.0-beta.1` to trigger CI workflow
   - Verify installers are created for all 3 platforms
   - Test install on fresh Windows 10/11 machine
   - Test auto-update flow (install v0.1.0-beta.1, release beta.2, verify update)

4. **First-run flow test**
   - Fresh install → splash screen → app loads
   - First-run config page appears → test connection → save → login works
   - Close app → reopen → still logged in (cookie persistence)

5. **Offline behavior verification**
   - Login → pull network cable → app still opens
   - Local data accessible via PowerSync (if configured)
   - Reconnect → sync resumes

### Should-Have (Before GA)

6. **Serial port integration** (lab equipment)
   - Add `tauri-plugin-serialport` or raw Rust serial crate
   - Wire to lab module screens in web-app

7. **Native barcode scanner** (camera-based)
   - `nokhwa` crate for camera capture + `rxing` for decoding
   - Fallback: existing html5-qrcode in browser mode

8. **macOS notarization**
   - Required for macOS distribution outside App Store
   - Apple Developer account + `xcrun notarytool`
   - Add to CI workflow for macOS builds

9. **Crash reporting**
   - Integrate Sentry or similar for production error tracking
   - Both Rust panics and JS errors

10. **Performance baselines**
    - Cold start time < 5s (splash → app ready)
    - Idle RAM < 200MB
    - Installer size < 100MB

### Nice-to-Have (Post-GA)

11. Custom updater UI (progress bar, release notes display)
12. Multi-window support (detach patient chart)
13. Kiosk mode for queue display terminals
14. Hardware security module integration (smart cards for auth)
15. DICOM viewer integration (medical imaging)
