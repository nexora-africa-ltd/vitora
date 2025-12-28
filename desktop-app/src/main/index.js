/**
 * Vitora HMIS Desktop - Main Process
 * 
 * This file manages:
 * - Django backend server lifecycle
 * - SQLite database initialization
 * - Main application window
 * - IPC communication between renderer and backend
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const Store = require('electron-store');

// Store for persistent settings
const store = new Store();

// Global references
let mainWindow = null;
let backendProcess = null;
const BACKEND_PORT = 8000;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

/**
 * Start Django backend server
 */
async function startBackend() {
  return new Promise((resolve, reject) => {
    const isDev = process.argv.includes('--dev');
    
    // Path to backend directory
    const backendPath = path.join(__dirname, '..', '..', '..', 'backend');
    
    console.log('[Backend] Starting Django server...');
    console.log('[Backend] Backend path:', backendPath);
    
    // Set environment for development
    const env = {
      ...process.env,
      DJANGO_ENV: 'development',
      DJANGO_SETTINGS_MODULE: 'hmis.settings',
      PYTHONUNBUFFERED: '1'
    };
    
    // Start Django using manage.py
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const managePath = path.join(backendPath, 'manage.py');
    
    backendProcess = spawn(pythonCmd, [managePath, 'runserver', `127.0.0.1:${BACKEND_PORT}`, '--noreload'], {
      cwd: backendPath,
      env: env,
      stdio: 'pipe'
    });
    
    backendProcess.stdout.on('data', (data) => {
      console.log(`[Backend] ${data.toString().trim()}`);
      
      // Check if server started successfully
      if (data.toString().includes('Starting development server')) {
        console.log('[Backend] Server started successfully');
        // Wait a bit for server to be fully ready
        setTimeout(() => resolve(), 2000);
      }
    });
    
    backendProcess.stderr.on('data', (data) => {
      const message = data.toString().trim();
      // Django sends some info to stderr, so only log warnings/errors
      if (!message.includes('Watching for file changes')) {
        console.error(`[Backend] ${message}`);
      }
    });
    
    backendProcess.on('error', (error) => {
      console.error('[Backend] Failed to start:', error);
      reject(error);
    });
    
    backendProcess.on('exit', (code) => {
      console.log(`[Backend] Process exited with code ${code}`);
      backendProcess = null;
    });
    
    // Timeout if server doesn't start within 30 seconds
    setTimeout(() => {
      if (backendProcess && backendProcess.exitCode === null) {
        console.log('[Backend] Server seems to be starting...');
        resolve(); // Resolve anyway, health check will verify
      }
    }, 10000);
  });
}

/**
 * Stop Django backend server
 */
function stopBackend() {
  return new Promise((resolve) => {
    if (backendProcess) {
      console.log('[Backend] Stopping Django server...');
      
      backendProcess.on('exit', () => {
        console.log('[Backend] Server stopped');
        backendProcess = null;
        resolve();
      });
      
      // Kill the process
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', backendProcess.pid, '/f', '/t']);
      } else {
        backendProcess.kill('SIGTERM');
      }
      
      // Force kill after 5 seconds if not stopped
      setTimeout(() => {
        if (backendProcess) {
          backendProcess.kill('SIGKILL');
          backendProcess = null;
        }
        resolve();
      }, 5000);
    } else {
      resolve();
    }
  });
}

/**
 * Check if backend is healthy
 */
async function checkBackendHealth() {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/patients/`, {
      timeout: 5000
    });
    return response.status === 200;
  } catch (error) {
    console.log('[Backend] Health check failed:', error.message);
    return false;
  }
}

/**
 * Create main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    title: 'Vitora HMIS',
    show: false // Don't show until ready
  });
  
  // Load the app UI
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  
  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
  
  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Initialize app
 */
async function initialize() {
  try {
    console.log('[App] Initializing Vitora HMIS...');
    
    // Start backend server
    await startBackend();
    
    // Wait for backend to be healthy
    let healthy = false;
    let attempts = 0;
    while (!healthy && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      healthy = await checkBackendHealth();
      attempts++;
    }
    
    if (!healthy) {
      console.error('[App] Backend failed to start properly');
      app.quit();
      return;
    }
    
    console.log('[App] Backend is healthy');
    
    // Create main window
    createWindow();
    
  } catch (error) {
    console.error('[App] Initialization failed:', error);
    app.quit();
  }
}

// App lifecycle
app.whenReady().then(initialize);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', async (event) => {
  event.preventDefault();
  await stopBackend();
  app.exit(0);
});

// IPC handlers
ipcMain.handle('api-request', async (event, { method, endpoint, data }) => {
  try {
    const url = `${BACKEND_URL}${endpoint}`;
    const response = await axios({
      method,
      url,
      data,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    return { success: true, data: response.data };
  } catch (error) {
    console.error('[IPC] API request failed:', error.message);
    return { 
      success: false, 
      error: error.response?.data || error.message 
    };
  }
});

ipcMain.handle('get-backend-url', () => {
  return BACKEND_URL;
});

// Export for testing
module.exports = {
  startBackend,
  stopBackend,
  checkBackendHealth,
  createWindow,
  BACKEND_URL
};
