# Vitora HMIS Desktop Application

Offline-first desktop application for Vitora Hospital Management Information System.

## Features

- 🏥 **Patient Registration**: Register new patients with complete demographic information
- 📋 **Patient List**: View and search registered patients
- 💾 **Offline-First**: Works completely offline with local SQLite database
- 🔄 **Django Backend**: Integrates with Django REST API for data management
- 🖥️ **Cross-Platform**: Runs on Windows, macOS, and Linux

## Prerequisites

- Node.js 20.x or higher
- Python 3.12+ (for backend)
- Poetry (for backend dependencies)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Ensure backend is set up:
```bash
cd ../backend
poetry install
```

## Development

Run the application in development mode:

```bash
npm run dev
```

This will:
1. Start the Django backend server on port 8000
2. Launch the Electron desktop application
3. Open DevTools for debugging

## Testing

### Unit Tests (Jest)

Run unit tests for backend integration:

```bash
npm test
```

### E2E Tests (Playwright)

Run end-to-end tests for the complete user flow:

```bash
npm run test:e2e
```

**Note**: E2E tests will start the backend and the full Electron app, so they take longer to run.

## Building

Build the application for distribution:

### All Platforms
```bash
npm run build
```

### Windows Only
```bash
npm run build:win
```

### macOS Only
```bash
npm run build:mac
```

### Linux Only
```bash
npm run build:linux
```

Built applications will be in the `dist/` directory.

## Project Structure

```
desktop-app/
├── src/
│   ├── main/           # Electron main process
│   │   └── index.js    # Backend management, window creation
│   ├── preload/        # Preload scripts
│   │   └── preload.js  # IPC bridge for security
│   └── renderer/       # UI layer
│       ├── index.html  # Main HTML
│       ├── app.js      # UI logic
│       └── styles.css  # Styling
├── tests/
│   ├── backend.test.js # Unit tests for backend integration
│   └── e2e/            # End-to-end tests
│       └── patient-registration.e2e.js
├── package.json
└── README.md
```

## Architecture

### Main Process (`src/main/index.js`)
- Manages Django backend server lifecycle
- Creates and manages application windows
- Handles IPC communication
- Provides secure API bridge to renderer

### Preload Script (`src/preload/preload.js`)
- Exposes safe APIs to renderer process
- Implements security boundary using `contextBridge`
- No direct Node.js access in renderer

### Renderer Process (`src/renderer/`)
- Patient registration form
- Patient list and search
- Communicates with backend via IPC

## Backend Integration

The desktop app automatically:
1. Starts Django development server on `http://127.0.0.1:9088`
2. Waits for backend to be healthy
3. Creates main window once backend is ready
4. Stops backend server when app quits

All API calls are proxied through the main process for security.

## Security

- **Content Security Policy**: Strict CSP prevents XSS attacks
- **Context Isolation**: Renderer has no direct Node.js access
- **No Node Integration**: All privileged operations via IPC
- **Sandboxed Renderer**: Additional security layer

## Offline Functionality

The app uses the Django backend with SQLite, which stores all data locally:
- No internet connection required
- All data stored in `backend/vitora.db`
- Can sync with cloud when connectivity is available (future feature)

## Troubleshooting

### Backend won't start
- Ensure Python 3.12+ is installed
- Check that Poetry dependencies are installed: `cd ../backend && poetry install`
- Verify manage.py is executable

### Port 8000 already in use
- Stop any other Django servers running on port 8000
- Or modify `BACKEND_PORT` in `src/main/index.js`

### E2E tests fail
- Increase timeout values if backend takes longer to start
- Ensure no other instances of the app are running
- Check backend logs in console output

## License

Apache-2.0

## Contributing

This is part of Sprint 0.3 of the Vitora HMIS development roadmap. See `ROADMAP.md` in the repository root for more information.
