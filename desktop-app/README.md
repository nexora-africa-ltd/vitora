# Vitora HMIS Desktop Application

Offline-first desktop application for Vitora Hospital Management Information System.

![Electron](https://img.shields.io/badge/Electron-Latest-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)
![Tests](https://img.shields.io/badge/tests-66%20passing-brightgreen.svg)
![Coverage](https://img.shields.io/badge/coverage-70%25+-brightgreen.svg)

---

## 📋 Table of Contents

- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Development](#-development)
- [Testing](#-testing)
- [Building](#-building)
- [Project Structure](#-project-structure)
- [Architecture](#-architecture)
- [Security](#-security)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Features

### Core Functionality
- 🏥 **Patient Registration**: Register new patients with complete demographic information
- 📋 **Patient List**: View and search registered patients
- 🩺 **Encounter Management**: Create and manage clinical encounters
- 📊 **Dashboard**: Overview of patients, encounters, and sync status

### Offline-First
- 💾 **Works Completely Offline**: Local SQLite database via Django backend
- 🔄 **Sync Queue**: Visual indicator of pending sync items
- 🌐 **Cloud Sync**: Synchronize with cloud when connectivity is available

### User Experience
- 🌙 **Dark Mode**: System preference with manual toggle
- 🖥️ **Cross-Platform**: Runs on Windows, macOS, and Linux
- 🔔 **System Tray**: Background sync status indicator
- ⬆️ **Auto-Update**: Electron auto-updater for releases

---

## 🔧 Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | ≥20.x | \`node --version\` |
| Python | ≥3.12 | \`python --version\` |
| Poetry | Latest | \`poetry --version\` |

---

## 🚀 Installation

### 1. Install Dependencies
\`\`\`bash
cd desktop-app
npm install
\`\`\`

### 2. Ensure Backend is Set Up
\`\`\`bash
cd ../backend
poetry install
\`\`\`

---

## 🛠 Development

### Run in Development Mode
\`\`\`bash
npm run dev
\`\`\`

This will:
1. Start the Django backend server on port 9088
2. Launch the Electron desktop application
3. Open DevTools for debugging

### Backend Port
The desktop app automatically spawns Django on \`http://127.0.0.1:9088\`.

---

## 🧪 Testing

### Unit Tests (Jest)
\`\`\`bash
npm test                    # Run unit tests
npm run test:coverage       # With coverage report (70% threshold)
\`\`\`

### E2E Tests (Playwright)
\`\`\`bash
npm run test:e2e            # Run end-to-end tests
\`\`\`

**Note**: E2E tests start the backend and full Electron app, so they take longer.

---

## 📦 Building

### All Platforms
\`\`\`bash
npm run build
\`\`\`

### Platform-Specific
\`\`\`bash
npm run build:linux         # Creates .AppImage, .deb
npm run build:win           # Creates .exe installer
npm run build:mac           # Creates .dmg
\`\`\`

Built applications will be in the \`dist/\` directory.

---

## 📁 Project Structure

\`\`\`
desktop-app/
├── src/
│   ├── main/               # Electron main process
│   │   └── index.js        # Backend management, window creation
│   ├── preload/            # Preload scripts
│   │   └── preload.js      # IPC bridge for security
│   └── renderer/           # UI layer
│       ├── index.html      # Main HTML
│       ├── app.js          # UI logic
│       └── styles.css      # Styling with dark mode
├── tests/
│   ├── *.test.js           # Jest unit tests (66+)
│   └── e2e/                # Playwright E2E tests
├── coverage/               # Coverage reports
├── playwright-report/      # E2E test reports
├── package.json
├── jest.config.js
├── playwright.config.js
└── README.md
\`\`\`

---

## 🏗 Architecture

### Main Process (\`src/main/index.js\`)
- Manages Django backend server lifecycle
- Creates and manages application windows
- Handles IPC communication
- Provides secure API bridge to renderer

### Preload Script (\`src/preload/preload.js\`)
- Exposes safe APIs to renderer process
- Implements security boundary using \`contextBridge\`
- No direct Node.js access in renderer

### Renderer Process (\`src/renderer/\`)
- Patient registration form
- Patient list and search
- Dashboard and sync status
- Communicates with backend via IPC

### IPC Handlers
\`\`\`javascript
// Authentication
ipcMain.handle('auth:login', async (event, credentials) => { ... });
ipcMain.handle('auth:logout', async () => { ... });
ipcMain.handle('auth:getToken', async () => { ... });

// Sync
ipcMain.handle('sync:getStatus', async () => { ... });
ipcMain.handle('sync:forceSync', async () => { ... });
\`\`\`

---

## 🔒 Security

### Implemented Measures
- **Content Security Policy**: Strict CSP prevents XSS attacks
- **Context Isolation**: Renderer has no direct Node.js access
- **No Node Integration**: All privileged operations via IPC
- **Sandboxed Renderer**: Additional security layer
- **Encrypted Token Storage**: JWT tokens in electron-store
- **Auto-refresh**: Tokens refreshed 5 min before expiry

---

## 🔧 Offline Functionality

The app uses the Django backend with SQLite for full offline capability:
- No internet connection required for core functionality
- All data stored in \`backend/vitora.db\`
- Sync queue tracks changes for later synchronization
- Cloud sync when connectivity is available

---

## 🐛 Troubleshooting

### Backend Won't Start
- Ensure Python 3.12+ is installed
- Check that Poetry dependencies are installed: \`cd ../backend && poetry install\`
- Verify manage.py is executable

### Port 9088 Already in Use
- Stop any other Django servers running on port 9088
- Or modify \`BACKEND_PORT\` in \`src/main/index.js\`

### E2E Tests Fail
- Increase timeout values if backend takes longer to start
- Ensure no other instances of the app are running
- Check backend logs in console output

### App Crashes on Start
- Check the logs in the terminal
- Delete \`node_modules\` and run \`npm install\` again
- Ensure the backend starts correctly: `cd ../backend && make api` (WebSocket support) or `python manage.py runserver`

---

## 📚 Related Documentation

- **Backend Setup**: [../backend/README.md](../backend/README.md)
- **Roadmap**: [../ROADMAP.md](../ROADMAP.md)
- **Main Documentation**: [../README.md](../README.md)

---

## License

Apache-2.0 - Nexora Africa Ltd © 2026
