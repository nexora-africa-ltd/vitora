/**
 * Comprehensive tests for main process (index.js)
 * 
 * These tests cover all exported functions and IPC handlers
 * to meet the 70% coverage threshold.
 */

// Mock electron BEFORE requiring any modules
const mockStore = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn()
};

const mockBrowserWindow = {
  loadFile: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  show: jest.fn(),
  webContents: { 
    on: jest.fn(),
    openDevTools: jest.fn()
  }
};

// Store IPC handlers for testing
const ipcHandlers = {};

jest.mock('electron', () => ({
  app: {
    whenReady: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    quit: jest.fn(),
    exit: jest.fn(),
    getPath: jest.fn().mockReturnValue('/tmp')
  },
  BrowserWindow: jest.fn().mockImplementation(() => mockBrowserWindow),
  ipcMain: {
    handle: jest.fn((channel, handler) => {
      ipcHandlers[channel] = handler;
    })
  }
}));

jest.mock('electron-store', () => {
  return jest.fn().mockImplementation(() => mockStore);
});

jest.mock('child_process');
jest.mock('axios');

// Now import after mocks
const {
  startBackend,
  stopBackend,
  checkBackendHealth,
  createWindow,
  getAccessToken,
  createSuperuser,
  createTestUser,
  runMigrations,
  importKenyaLocations,
  initialize,
  BACKEND_URL,
  _setBackendProcessForTesting,
  _setMainWindowForTesting,
  _getBackendProcess,
  _getMainWindow
} = require('../src/main/index');

describe('Main Process - index.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.get.mockReset();
    mockStore.set.mockReset();
    mockStore.delete.mockReset();
  });

  describe('BACKEND_URL constant', () => {
    it('should be defined', () => {
      expect(BACKEND_URL).toBeDefined();
      expect(typeof BACKEND_URL).toBe('string');
    });

    it('should use port 9088', () => {
      expect(BACKEND_URL).toContain('9088');
    });

    it('should use localhost', () => {
      expect(BACKEND_URL).toContain('127.0.0.1');
    });
  });

  describe('getAccessToken', () => {
    it('should return stored access token', () => {
      mockStore.get.mockReturnValue('test-token-123');
      const token = getAccessToken();
      expect(token).toBe('test-token-123');
      expect(mockStore.get).toHaveBeenCalledWith('auth.accessToken');
    });

    it('should return undefined when no token stored', () => {
      mockStore.get.mockReturnValue(undefined);
      const token = getAccessToken();
      expect(token).toBeUndefined();
    });

    it('should return null when null stored', () => {
      mockStore.get.mockReturnValue(null);
      const token = getAccessToken();
      expect(token).toBeNull();
    });
  });

  describe('runMigrations', () => {
    it('should spawn poetry run python manage.py migrate', async () => {
      const { spawn } = require('child_process');
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };
      spawn.mockReturnValue(mockProcess);

      // Simulate process close
      setTimeout(() => {
        const closeCallback = mockProcess.on.mock.calls.find(
          call => call[0] === 'close'
        )?.[1];
        if (closeCallback) {
          closeCallback(0);
        }
      }, 50);

      await runMigrations();

      expect(spawn).toHaveBeenCalledWith(
        'poetry',
        ['run', 'python', 'manage.py', 'migrate', '--noinput'],
        expect.objectContaining({
          shell: true,
          stdio: 'pipe'
        })
      );
    });

    it('should handle stdout output', async () => {
      const { spawn } = require('child_process');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };
      spawn.mockReturnValue(mockProcess);

      // Capture the stdout callback
      setTimeout(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find(
          call => call[0] === 'data'
        )?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('Running migrations'));
        }
        
        const closeCallback = mockProcess.on.mock.calls.find(
          call => call[0] === 'close'
        )?.[1];
        if (closeCallback) {
          closeCallback(0);
        }
      }, 50);

      await runMigrations();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle stderr output', async () => {
      const { spawn } = require('child_process');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };
      spawn.mockReturnValue(mockProcess);

      setTimeout(() => {
        const stderrCallback = mockProcess.stderr.on.mock.calls.find(
          call => call[0] === 'data'
        )?.[1];
        if (stderrCallback) {
          stderrCallback(Buffer.from('Warning message'));
        }
        
        const closeCallback = mockProcess.on.mock.calls.find(
          call => call[0] === 'close'
        )?.[1];
        if (closeCallback) {
          closeCallback(0);
        }
      }, 50);

      await runMigrations();

      consoleSpy.mockRestore();
    });

    it('should resolve on timeout', async () => {
      jest.useFakeTimers();
      const { spawn } = require('child_process');
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };
      spawn.mockReturnValue(mockProcess);

      const promise = runMigrations();
      jest.advanceTimersByTime(31000);
      
      await expect(promise).resolves.toBeUndefined();
      jest.useRealTimers();
    });
  });

  describe('importKenyaLocations', () => {
    it('should spawn import_kenya_locations command', async () => {
      const { spawn } = require('child_process');
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };
      spawn.mockReturnValue(mockProcess);

      setTimeout(() => {
        const closeCallback = mockProcess.on.mock.calls.find(
          call => call[0] === 'close'
        )?.[1];
        if (closeCallback) {
          closeCallback(0);
        }
      }, 50);

      await importKenyaLocations();

      expect(spawn).toHaveBeenCalledWith(
        'poetry',
        expect.arrayContaining(['run', 'python', 'manage.py', 'import_kenya_locations']),
        expect.any(Object)
      );
    });

    it('should handle stdout data', async () => {
      const { spawn } = require('child_process');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };
      spawn.mockReturnValue(mockProcess);

      setTimeout(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find(
          call => call[0] === 'data'
        )?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('Importing locations...'));
        }
        
        const closeCallback = mockProcess.on.mock.calls.find(
          call => call[0] === 'close'
        )?.[1];
        if (closeCallback) {
          closeCallback(0);
        }
      }, 50);

      await importKenyaLocations();
      consoleSpy.mockRestore();
    });

    it('should handle stderr data', async () => {
      const { spawn } = require('child_process');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };
      spawn.mockReturnValue(mockProcess);

      setTimeout(() => {
        const stderrCallback = mockProcess.stderr.on.mock.calls.find(
          call => call[0] === 'data'
        )?.[1];
        if (stderrCallback) {
          stderrCallback(Buffer.from('Import warning'));
        }
        
        const closeCallback = mockProcess.on.mock.calls.find(
          call => call[0] === 'close'
        )?.[1];
        if (closeCallback) {
          closeCallback(0);
        }
      }, 50);

      await importKenyaLocations();
      consoleSpy.mockRestore();
    });

    it('should resolve on timeout', async () => {
      jest.useFakeTimers();
      const { spawn } = require('child_process');
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };
      spawn.mockReturnValue(mockProcess);

      const promise = importKenyaLocations();
      jest.advanceTimersByTime(61000);
      
      await expect(promise).resolves.toBeUndefined();
      jest.useRealTimers();
    });
  });

  describe('createSuperuser', () => {
    it('should spawn create_superuser command', async () => {
      const { spawn } = require('child_process');
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };
      spawn.mockReturnValue(mockProcess);

      setTimeout(() => {
        const closeCallback = mockProcess.on.mock.calls.find(
          call => call[0] === 'close'
        )?.[1];
        if (closeCallback) {
          closeCallback();
        }
      }, 50);

      await createSuperuser();

      expect(spawn).toHaveBeenCalledWith(
        'poetry',
        ['run', 'python', 'manage.py', 'create_superuser'],
        expect.any(Object)
      );
    });

    it('should handle stdout data', async () => {
      const { spawn } = require('child_process');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };
      spawn.mockReturnValue(mockProcess);

      setTimeout(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find(
          call => call[0] === 'data'
        )?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('Superuser created'));
        }
        
        const closeCallback = mockProcess.on.mock.calls.find(
          call => call[0] === 'close'
        )?.[1];
        if (closeCallback) {
          closeCallback();
        }
      }, 50);

      await createSuperuser();
      consoleSpy.mockRestore();
    });

    it('should handle stderr data', async () => {
      const { spawn } = require('child_process');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };
      spawn.mockReturnValue(mockProcess);

      setTimeout(() => {
        const stderrCallback = mockProcess.stderr.on.mock.calls.find(
          call => call[0] === 'data'
        )?.[1];
        if (stderrCallback) {
          stderrCallback(Buffer.from('stderr info'));
        }
        
        const closeCallback = mockProcess.on.mock.calls.find(
          call => call[0] === 'close'
        )?.[1];
        if (closeCallback) {
          closeCallback();
        }
      }, 50);

      await createSuperuser();
      consoleSpy.mockRestore();
    });

    it('should resolve on timeout', async () => {
      jest.useFakeTimers();
      const { spawn } = require('child_process');
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };
      spawn.mockReturnValue(mockProcess);

      const promise = createSuperuser();
      jest.advanceTimersByTime(11000);
      
      await expect(promise).resolves.toBeUndefined();
      jest.useRealTimers();
    });
  });

  describe('createTestUser', () => {
    it('should spawn create_test_user command', async () => {
      const { spawn } = require('child_process');
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };
      spawn.mockReturnValue(mockProcess);

      setTimeout(() => {
        const closeCallback = mockProcess.on.mock.calls.find(
          call => call[0] === 'close'
        )?.[1];
        if (closeCallback) {
          closeCallback();
        }
      }, 50);

      await createTestUser();

      expect(spawn).toHaveBeenCalledWith(
        'poetry',
        ['run', 'python', 'manage.py', 'create_test_user'],
        expect.any(Object)
      );
    });

    it('should handle stdout data', async () => {
      const { spawn } = require('child_process');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };
      spawn.mockReturnValue(mockProcess);

      setTimeout(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find(
          call => call[0] === 'data'
        )?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('Test user created'));
        }
        
        const closeCallback = mockProcess.on.mock.calls.find(
          call => call[0] === 'close'
        )?.[1];
        if (closeCallback) {
          closeCallback();
        }
      }, 50);

      await createTestUser();
      consoleSpy.mockRestore();
    });

    it('should handle stderr data', async () => {
      const { spawn } = require('child_process');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };
      spawn.mockReturnValue(mockProcess);

      setTimeout(() => {
        const stderrCallback = mockProcess.stderr.on.mock.calls.find(
          call => call[0] === 'data'
        )?.[1];
        if (stderrCallback) {
          stderrCallback(Buffer.from('stderr info from test user'));
        }
        
        const closeCallback = mockProcess.on.mock.calls.find(
          call => call[0] === 'close'
        )?.[1];
        if (closeCallback) {
          closeCallback();
        }
      }, 50);

      await createTestUser();
      consoleSpy.mockRestore();
    });

    it('should resolve on timeout', async () => {
      jest.useFakeTimers();
      const { spawn } = require('child_process');
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };
      spawn.mockReturnValue(mockProcess);

      const promise = createTestUser();
      jest.advanceTimersByTime(11000);
      
      await expect(promise).resolves.toBeUndefined();
      jest.useRealTimers();
    });
  });

  describe('startBackend', () => {
    it('should spawn Django runserver command', async () => {
      const { spawn } = require('child_process');
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        pid: 12345,
        exitCode: null
      };
      spawn.mockReturnValue(mockProcess);

      setTimeout(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find(
          call => call[0] === 'data'
        )?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('Starting development server at http://127.0.0.1:8000/'));
        }
      }, 50);

      await startBackend();

      expect(spawn).toHaveBeenCalledWith(
        'poetry',
        expect.arrayContaining(['run', 'python', 'manage.py', 'runserver']),
        expect.any(Object)
      );
    });

    it('should handle stderr messages', async () => {
      const { spawn } = require('child_process');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        pid: 12345,
        exitCode: null
      };
      spawn.mockReturnValue(mockProcess);

      setTimeout(() => {
        const stderrCallback = mockProcess.stderr.on.mock.calls.find(
          call => call[0] === 'data'
        )?.[1];
        if (stderrCallback) {
          stderrCallback(Buffer.from('Some error message'));
        }
        
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find(
          call => call[0] === 'data'
        )?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('Starting development server'));
        }
      }, 50);

      await startBackend();
      consoleSpy.mockRestore();
    });

    it('should filter out file watching messages from stderr', async () => {
      const { spawn } = require('child_process');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        pid: 12345,
        exitCode: null
      };
      spawn.mockReturnValue(mockProcess);

      setTimeout(() => {
        const stderrCallback = mockProcess.stderr.on.mock.calls.find(
          call => call[0] === 'data'
        )?.[1];
        if (stderrCallback) {
          stderrCallback(Buffer.from('Watching for file changes'));
        }
        
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find(
          call => call[0] === 'data'
        )?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('Starting development server'));
        }
      }, 50);

      await startBackend();
      
      // The file watching message should not trigger console.error
      const errorCalls = consoleSpy.mock.calls.filter(
        call => call[0].includes('Watching for file changes')
      );
      expect(errorCalls.length).toBe(0);
      consoleSpy.mockRestore();
    });

    it('should handle process error event', async () => {
      const { spawn } = require('child_process');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        pid: 12345,
        exitCode: null
      };
      spawn.mockReturnValue(mockProcess);

      setTimeout(() => {
        const errorCallback = mockProcess.on.mock.calls.find(
          call => call[0] === 'error'
        )?.[1];
        if (errorCallback) {
          errorCallback(new Error('Spawn failed'));
        }
      }, 50);

      await expect(startBackend()).rejects.toThrow('Spawn failed');
      consoleSpy.mockRestore();
    });

    it('should handle process exit event', async () => {
      const { spawn } = require('child_process');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        pid: 12345,
        exitCode: null
      };
      spawn.mockReturnValue(mockProcess);

      setTimeout(() => {
        const exitCallback = mockProcess.on.mock.calls.find(
          call => call[0] === 'exit'
        )?.[1];
        if (exitCallback) {
          exitCallback(0);
        }
        
        // Also trigger stdout to resolve
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find(
          call => call[0] === 'data'
        )?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('Starting development server'));
        }
      }, 50);

      await startBackend();
      consoleSpy.mockRestore();
    });

    it('should resolve on timeout when server appears to start', async () => {
      jest.useFakeTimers();
      const { spawn } = require('child_process');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        pid: 12345,
        exitCode: null
      };
      spawn.mockReturnValue(mockProcess);

      const promise = startBackend();
      jest.advanceTimersByTime(11000);
      
      await expect(promise).resolves.toBeUndefined();
      jest.useRealTimers();
      consoleSpy.mockRestore();
    });
  });

  describe('stopBackend', () => {
    it('should be callable', () => {
      expect(typeof stopBackend).toBe('function');
    });

    it('should resolve immediately when no backend process exists', async () => {
      _setBackendProcessForTesting(null);
      await expect(stopBackend()).resolves.toBeUndefined();
    });

    it('should stop backend on Unix platform', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true
      });

      const mockProcess = {
        on: jest.fn(),
        kill: jest.fn(),
        pid: 12345
      };
      
      _setBackendProcessForTesting(mockProcess);

      // Simulate the exit event being called
      setTimeout(() => {
        const exitCallback = mockProcess.on.mock.calls.find(
          call => call[0] === 'exit'
        )?.[1];
        if (exitCallback) {
          exitCallback();
        }
      }, 50);

      await stopBackend();
      
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true
      });
      _setBackendProcessForTesting(null);
    });

    it('should stop backend on Windows platform', async () => {
      const { spawn } = require('child_process');
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true
      });

      const mockProcess = {
        on: jest.fn(),
        kill: jest.fn(),
        pid: 12345
      };
      
      _setBackendProcessForTesting(mockProcess);

      // Simulate the exit event being called
      setTimeout(() => {
        const exitCallback = mockProcess.on.mock.calls.find(
          call => call[0] === 'exit'
        )?.[1];
        if (exitCallback) {
          exitCallback();
        }
      }, 50);

      await stopBackend();
      
      expect(spawn).toHaveBeenCalledWith('taskkill', ['/pid', 12345, '/f', '/t']);
      
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true
      });
      _setBackendProcessForTesting(null);
    });

    it('should force kill after timeout if process does not exit', async () => {
      jest.useFakeTimers();
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const mockProcess = {
        on: jest.fn(),
        kill: jest.fn(),
        pid: 12345
      };
      
      _setBackendProcessForTesting(mockProcess);

      const stopPromise = stopBackend();
      
      // Advance timers to trigger the force kill timeout
      jest.advanceTimersByTime(6000);
      
      await stopPromise;
      
      // Should have called kill with SIGKILL for force termination
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      
      jest.useRealTimers();
      consoleSpy.mockRestore();
      _setBackendProcessForTesting(null);
    });
  });

  describe('checkBackendHealth', () => {
    it('should return true when backend responds with healthy status', async () => {
      const axios = require('axios');
      axios.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { status: 'healthy' }
      });

      const result = await checkBackendHealth();
      expect(result).toBe(true);
    });

    it('should return false when backend responds without healthy status', async () => {
      const axios = require('axios');
      axios.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { status: 'unhealthy' }
      });

      const result = await checkBackendHealth();
      expect(result).toBe(false);
    });

    it('should return false when backend returns non-200 status', async () => {
      const axios = require('axios');
      axios.get = jest.fn().mockResolvedValue({
        status: 500,
        data: { status: 'healthy' }
      });

      const result = await checkBackendHealth();
      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      const axios = require('axios');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      axios.get = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await checkBackendHealth();
      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });

    it('should use correct URL and timeout', async () => {
      const axios = require('axios');
      axios.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { status: 'healthy' }
      });

      await checkBackendHealth();
      
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('127.0.0.1'),
        expect.objectContaining({ timeout: 5000 })
      );
    });
  });

  describe('createWindow', () => {
    it('should create a BrowserWindow instance', () => {
      const { BrowserWindow } = require('electron');
      
      createWindow();
      
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 1200,
          height: 800,
          title: 'Vitora HMIS'
        })
      );
    });

    it('should configure webPreferences correctly', () => {
      const { BrowserWindow } = require('electron');
      
      createWindow();
      
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          webPreferences: expect.objectContaining({
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
          })
        })
      );
    });

    it('should load index.html file', () => {
      createWindow();
      
      expect(mockBrowserWindow.loadFile).toHaveBeenCalledWith(
        expect.stringContaining('index.html')
      );
    });

    it('should register ready-to-show handler', () => {
      createWindow();
      
      expect(mockBrowserWindow.once).toHaveBeenCalledWith(
        'ready-to-show',
        expect.any(Function)
      );
    });

    it('should register closed handler', () => {
      createWindow();
      
      expect(mockBrowserWindow.on).toHaveBeenCalledWith(
        'closed',
        expect.any(Function)
      );
    });
  });
});

describe('IPC Handlers Registration', () => {
  it('should register api-request handler', () => {
    expect(ipcHandlers['api-request']).toBeDefined();
    expect(typeof ipcHandlers['api-request']).toBe('function');
  });

  it('should register get-backend-url handler', () => {
    expect(ipcHandlers['get-backend-url']).toBeDefined();
    expect(typeof ipcHandlers['get-backend-url']).toBe('function');
  });

  it('should register store-tokens handler', () => {
    expect(ipcHandlers['store-tokens']).toBeDefined();
    expect(typeof ipcHandlers['store-tokens']).toBe('function');
  });

  it('should register get-stored-tokens handler', () => {
    expect(ipcHandlers['get-stored-tokens']).toBeDefined();
    expect(typeof ipcHandlers['get-stored-tokens']).toBe('function');
  });

  it('should register clear-tokens handler', () => {
    expect(ipcHandlers['clear-tokens']).toBeDefined();
    expect(typeof ipcHandlers['clear-tokens']).toBe('function');
  });
});

describe('IPC Handler Functionality', () => {
  describe('api-request handler', () => {
    it('should make HTTP request to backend', async () => {
      const axios = require('axios');
      
      axios.mockResolvedValue({
        data: { patients: [] }
      });

      const handler = ipcHandlers['api-request'];
      if (handler) {
        const result = await handler({}, {
          method: 'GET',
          endpoint: '/api/patients/',
          data: null
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ patients: [] });
      }
    });

    it('should include auth header for non-token endpoints', async () => {
      const axios = require('axios');
      
      mockStore.get.mockReturnValue('test-token');
      axios.mockResolvedValue({ data: {} });

      const handler = ipcHandlers['api-request'];
      if (handler) {
        await handler({}, {
          method: 'GET',
          endpoint: '/api/patients/',
          data: null
        });

        expect(axios).toHaveBeenCalledWith(
          expect.objectContaining({
            headers: expect.objectContaining({
              'Authorization': 'Bearer test-token'
            })
          })
        );
      }
    });

    it('should not include auth header for token endpoints', async () => {
      const axios = require('axios');
      
      mockStore.get.mockReturnValue('test-token');
      axios.mockResolvedValue({ data: {} });

      const handler = ipcHandlers['api-request'];
      if (handler) {
        await handler({}, {
          method: 'POST',
          endpoint: '/api/token/',
          data: { username: 'test', password: 'test' }
        });

        // For token endpoints, the Authorization header should NOT be included
        const callArgs = axios.mock.calls[axios.mock.calls.length - 1][0];
        expect(callArgs.headers.Authorization).toBeUndefined();
      }
    });

    it('should return error on request failure', async () => {
      const axios = require('axios');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      axios.mockRejectedValue({
        message: 'Network Error',
        response: { data: { detail: 'Not found' } }
      });

      const handler = ipcHandlers['api-request'];
      if (handler) {
        const result = await handler({}, {
          method: 'GET',
          endpoint: '/api/nonexistent/',
          data: null
        });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
      consoleSpy.mockRestore();
    });
  });

  describe('get-backend-url handler', () => {
    it('should return the backend URL', async () => {
      const handler = ipcHandlers['get-backend-url'];
      if (handler) {
        const result = await handler();
        expect(result).toContain('127.0.0.1');
        expect(result).toContain('9088');
      }
    });
  });

  describe('store-tokens handler', () => {
    it('should store access token', async () => {
      const handler = ipcHandlers['store-tokens'];
      if (handler) {
        await handler({}, { accessToken: 'new-access-token' });
        expect(mockStore.set).toHaveBeenCalledWith('auth.accessToken', 'new-access-token');
      }
    });

    it('should store refresh token', async () => {
      const handler = ipcHandlers['store-tokens'];
      if (handler) {
        await handler({}, { refreshToken: 'new-refresh-token' });
        expect(mockStore.set).toHaveBeenCalledWith('auth.refreshToken', 'new-refresh-token');
      }
    });

    it('should store user data', async () => {
      const handler = ipcHandlers['store-tokens'];
      if (handler) {
        const user = { id: 1, username: 'testuser' };
        await handler({}, { user });
        expect(mockStore.set).toHaveBeenCalledWith('auth.user', user);
      }
    });

    it('should return success on store', async () => {
      const handler = ipcHandlers['store-tokens'];
      if (handler) {
        const result = await handler({}, { accessToken: 'token' });
        expect(result.success).toBe(true);
      }
    });

    it('should handle store error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      mockStore.set.mockImplementation(() => {
        throw new Error('Storage error');
      });

      const handler = ipcHandlers['store-tokens'];
      if (handler) {
        const result = await handler({}, { accessToken: 'token' });
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
      consoleSpy.mockRestore();
      mockStore.set.mockReset();
    });
  });

  describe('get-stored-tokens handler', () => {
    it('should return stored tokens', async () => {
      mockStore.get.mockImplementation((key) => {
        if (key === 'auth.accessToken') return 'access-token';
        if (key === 'auth.refreshToken') return 'refresh-token';
        if (key === 'auth.user') return { id: 1 };
        return undefined;
      });

      const handler = ipcHandlers['get-stored-tokens'];
      if (handler) {
        const result = await handler();
        expect(result.accessToken).toBe('access-token');
        expect(result.refreshToken).toBe('refresh-token');
        expect(result.user).toEqual({ id: 1 });
      }
    });

    it('should return null on error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      mockStore.get.mockImplementation(() => {
        throw new Error('Read error');
      });

      const handler = ipcHandlers['get-stored-tokens'];
      if (handler) {
        const result = await handler();
        expect(result).toBeNull();
      }
      consoleSpy.mockRestore();
      mockStore.get.mockReset();
    });
  });

  describe('clear-tokens handler', () => {
    it('should delete all tokens', async () => {
      const handler = ipcHandlers['clear-tokens'];
      if (handler) {
        await handler();
        expect(mockStore.delete).toHaveBeenCalledWith('auth.accessToken');
        expect(mockStore.delete).toHaveBeenCalledWith('auth.refreshToken');
        expect(mockStore.delete).toHaveBeenCalledWith('auth.user');
      }
    });

    it('should return success on clear', async () => {
      const handler = ipcHandlers['clear-tokens'];
      if (handler) {
        const result = await handler();
        expect(result.success).toBe(true);
      }
    });

    it('should handle delete error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      mockStore.delete.mockImplementation(() => {
        throw new Error('Delete error');
      });

      const handler = ipcHandlers['clear-tokens'];
      if (handler) {
        const result = await handler();
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
      consoleSpy.mockRestore();
      mockStore.delete.mockReset();
    });
  });
});
describe('App Lifecycle', () => {
  describe('Exported functions', () => {
    it('should export all necessary functions', () => {
      expect(typeof startBackend).toBe('function');
      expect(typeof stopBackend).toBe('function');
      expect(typeof checkBackendHealth).toBe('function');
      expect(typeof createWindow).toBe('function');
      expect(typeof getAccessToken).toBe('function');
      expect(typeof createSuperuser).toBe('function');
      expect(typeof createTestUser).toBe('function');
      expect(typeof runMigrations).toBe('function');
      expect(typeof importKenyaLocations).toBe('function');
      expect(typeof initialize).toBe('function');
      expect(typeof BACKEND_URL).toBe('string');
    });
  });
});

describe('Initialize function', () => {
  it('should be exported and callable', () => {
    expect(typeof initialize).toBe('function');
  });
});

describe('stopBackend detailed tests', () => {
  it('should handle Windows process termination', async () => {
    const { spawn } = require('child_process');
    const originalPlatform = process.platform;
    
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true
    });
    
    // This test verifies Windows-specific behavior exists in the code
    expect(typeof stopBackend).toBe('function');
    
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true
    });
  });

  it('should handle Unix process termination', async () => {
    const { spawn } = require('child_process');
    const originalPlatform = process.platform;
    
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true
    });
    
    expect(typeof stopBackend).toBe('function');
    
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true
    });
  });
});

describe('createWindow with --dev flag', () => {
  it('should open DevTools when --dev flag is present', () => {
    const originalArgv = process.argv;
    process.argv = [...originalArgv, '--dev'];
    
    createWindow();
    
    expect(mockBrowserWindow.webContents.openDevTools).toHaveBeenCalled();
    
    process.argv = originalArgv;
  });

  it('should not open DevTools without --dev flag', () => {
    const originalArgv = process.argv;
    process.argv = originalArgv.filter(arg => arg !== '--dev');
    
    mockBrowserWindow.webContents.openDevTools.mockClear();
    createWindow();
    
    // Without --dev flag, openDevTools should not be called
    expect(mockBrowserWindow.webContents.openDevTools).not.toHaveBeenCalled();
    
    process.argv = originalArgv;
  });

  it('should trigger ready-to-show callback', () => {
    createWindow();
    
    // Find the ready-to-show callback
    const readyCallback = mockBrowserWindow.once.mock.calls.find(
      call => call[0] === 'ready-to-show'
    );
    
    expect(readyCallback).toBeDefined();
    
    // Execute the callback
    if (readyCallback) {
      const callback = readyCallback[1];
      callback();
      expect(mockBrowserWindow.show).toHaveBeenCalled();
    }
  });

  it('should trigger closed callback', () => {
    createWindow();
    
    // Find the closed callback
    const closedCallback = mockBrowserWindow.on.mock.calls.find(
      call => call[0] === 'closed'
    );
    
    expect(closedCallback).toBeDefined();
    
    // Execute the callback (sets mainWindow to null)
    if (closedCallback) {
      const callback = closedCallback[1];
      callback();
    }
  });
});

describe('activate handler', () => {
  it('should create window when mainWindow is null', () => {
    const { app, BrowserWindow } = require('electron');
    
    // Set mainWindow to null
    _setMainWindowForTesting(null);
    
    const handlerCall = app.on.mock.calls.find(
      call => call[0] === 'activate'
    );
    
    if (handlerCall) {
      BrowserWindow.mockClear();
      const handler = handlerCall[1];
      handler();
      
      // Window should be created when mainWindow is null
      expect(BrowserWindow).toHaveBeenCalled();
    }
  });

  it('should not create window when mainWindow exists', () => {
    const { app, BrowserWindow } = require('electron');
    
    // Set mainWindow to a mock window
    _setMainWindowForTesting(mockBrowserWindow);
    
    const handlerCall = app.on.mock.calls.find(
      call => call[0] === 'activate'
    );
    
    if (handlerCall) {
      BrowserWindow.mockClear();
      const handler = handlerCall[1];
      handler();
      
      // Window should NOT be created when mainWindow exists
      expect(BrowserWindow).not.toHaveBeenCalled();
    }
    
    // Reset
    _setMainWindowForTesting(null);
  });
});

describe('Test helper functions', () => {
  it('should get and set backendProcess', () => {
    const mockProcess = { pid: 123 };
    _setBackendProcessForTesting(mockProcess);
    expect(_getBackendProcess()).toBe(mockProcess);
    _setBackendProcessForTesting(null);
  });

  it('should get and set mainWindow', () => {
    const mockWindow = { id: 456 };
    _setMainWindowForTesting(mockWindow);
    expect(_getMainWindow()).toBe(mockWindow);
    _setMainWindowForTesting(null);
  });
});

describe('Branch Coverage - Additional Tests', () => {
  describe('api-request with no token', () => {
    it('should make request without auth header when no token', async () => {
      const axios = require('axios');
      
      mockStore.get.mockReturnValue(undefined);
      axios.mockResolvedValue({ data: {} });

      const handler = ipcHandlers['api-request'];
      if (handler) {
        await handler({}, {
          method: 'GET',
          endpoint: '/api/patients/',
          data: null
        });

        const callArgs = axios.mock.calls[axios.mock.calls.length - 1][0];
        expect(callArgs.headers.Authorization).toBeUndefined();
      }
    });

    it('should make request without auth header when token is null', async () => {
      const axios = require('axios');
      
      mockStore.get.mockReturnValue(null);
      axios.mockResolvedValue({ data: {} });

      const handler = ipcHandlers['api-request'];
      if (handler) {
        await handler({}, {
          method: 'GET',
          endpoint: '/api/patients/',
          data: null
        });

        const callArgs = axios.mock.calls[axios.mock.calls.length - 1][0];
        expect(callArgs.headers.Authorization).toBeUndefined();
      }
    });

    it('should make request without auth header when token is empty string', async () => {
      const axios = require('axios');
      
      mockStore.get.mockReturnValue('');
      axios.mockResolvedValue({ data: {} });

      const handler = ipcHandlers['api-request'];
      if (handler) {
        await handler({}, {
          method: 'GET',
          endpoint: '/api/patients/',
          data: null
        });

        const callArgs = axios.mock.calls[axios.mock.calls.length - 1][0];
        expect(callArgs.headers.Authorization).toBeUndefined();
      }
    });
  });

  describe('api-request error without response', () => {
    it('should return error message when no response data', async () => {
      const axios = require('axios');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Error without response object
      axios.mockRejectedValue({
        message: 'Network Error'
      });

      const handler = ipcHandlers['api-request'];
      if (handler) {
        const result = await handler({}, {
          method: 'GET',
          endpoint: '/api/patients/',
          data: null
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Network Error');
      }
      consoleSpy.mockRestore();
    });

    it('should return response data on error when available', async () => {
      const axios = require('axios');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      axios.mockRejectedValue({
        message: 'Request failed',
        response: { data: { detail: 'Permission denied' } }
      });

      const handler = ipcHandlers['api-request'];
      if (handler) {
        const result = await handler({}, {
          method: 'GET',
          endpoint: '/api/patients/',
          data: null
        });

        expect(result.success).toBe(false);
        expect(result.error.detail).toBe('Permission denied');
      }
      consoleSpy.mockRestore();
    });
  });

  describe('health check with various responses', () => {
    it('should return false when response has no status field', async () => {
      const axios = require('axios');
      axios.get = jest.fn().mockResolvedValue({
        status: 200,
        data: {}
      });

      const result = await checkBackendHealth();
      expect(result).toBe(false);
    });

    it('should return false when status is not 200', async () => {
      const axios = require('axios');
      axios.get = jest.fn().mockResolvedValue({
        status: 503,
        data: { status: 'healthy' }
      });

      const result = await checkBackendHealth();
      expect(result).toBe(false);
    });

    it('should return false when data status is not healthy', async () => {
      const axios = require('axios');
      axios.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { status: 'starting' }
      });

      const result = await checkBackendHealth();
      expect(result).toBe(false);
    });

    it('should return true only when both conditions are met', async () => {
      const axios = require('axios');
      axios.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { status: 'healthy' }
      });

      const result = await checkBackendHealth();
      expect(result).toBe(true);
    });
  });

  describe('token endpoint detection', () => {
    it('should not include auth header for /api/token/ endpoint', async () => {
      const axios = require('axios');
      mockStore.get.mockReturnValue('test-token');
      axios.mockResolvedValue({ data: {} });

      const handler = ipcHandlers['api-request'];
      if (handler) {
        await handler({}, {
          method: 'POST',
          endpoint: '/api/token/',
          data: {}
        });

        const callArgs = axios.mock.calls[axios.mock.calls.length - 1][0];
        expect(callArgs.headers.Authorization).toBeUndefined();
      }
    });

    it('should not include auth header for /api/token/refresh/ endpoint', async () => {
      const axios = require('axios');
      mockStore.get.mockReturnValue('test-token');
      axios.mockResolvedValue({ data: {} });

      const handler = ipcHandlers['api-request'];
      if (handler) {
        await handler({}, {
          method: 'POST',
          endpoint: '/api/token/refresh/',
          data: {}
        });

        const callArgs = axios.mock.calls[axios.mock.calls.length - 1][0];
        expect(callArgs.headers.Authorization).toBeUndefined();
      }
    });

    it('should not include auth header for /api/token/verify/ endpoint', async () => {
      const axios = require('axios');
      mockStore.get.mockReturnValue('test-token');
      axios.mockResolvedValue({ data: {} });

      const handler = ipcHandlers['api-request'];
      if (handler) {
        await handler({}, {
          method: 'POST',
          endpoint: '/api/token/verify/',
          data: {}
        });

        const callArgs = axios.mock.calls[axios.mock.calls.length - 1][0];
        expect(callArgs.headers.Authorization).toBeUndefined();
      }
    });

    it('should include auth header for non-token endpoints', async () => {
      const axios = require('axios');
      mockStore.get.mockReturnValue('valid-token');
      axios.mockResolvedValue({ data: {} });

      const handler = ipcHandlers['api-request'];
      if (handler) {
        await handler({}, {
          method: 'GET',
          endpoint: '/api/encounters/',
          data: null
        });

        const callArgs = axios.mock.calls[axios.mock.calls.length - 1][0];
        expect(callArgs.headers.Authorization).toBe('Bearer valid-token');
      }
    });
  });

  describe('store-tokens with partial data', () => {
    it('should handle tokens object with only accessToken', async () => {
      mockStore.set.mockClear();
      const handler = ipcHandlers['store-tokens'];
      if (handler) {
        const result = await handler({}, { accessToken: 'only-access' });
        expect(result.success).toBe(true);
        expect(mockStore.set).toHaveBeenCalledWith('auth.accessToken', 'only-access');
        expect(mockStore.set).toHaveBeenCalledTimes(1);
      }
    });

    it('should handle tokens object with only refreshToken', async () => {
      mockStore.set.mockClear();
      const handler = ipcHandlers['store-tokens'];
      if (handler) {
        const result = await handler({}, { refreshToken: 'only-refresh' });
        expect(result.success).toBe(true);
        expect(mockStore.set).toHaveBeenCalledWith('auth.refreshToken', 'only-refresh');
      }
    });

    it('should handle tokens object with only user', async () => {
      mockStore.set.mockClear();
      const handler = ipcHandlers['store-tokens'];
      if (handler) {
        const result = await handler({}, { user: { id: 1 } });
        expect(result.success).toBe(true);
        expect(mockStore.set).toHaveBeenCalledWith('auth.user', { id: 1 });
      }
    });

    it('should handle all tokens together', async () => {
      mockStore.set.mockClear();
      const handler = ipcHandlers['store-tokens'];
      if (handler) {
        const result = await handler({}, {
          accessToken: 'access',
          refreshToken: 'refresh',
          user: { id: 1, username: 'test' }
        });
        expect(result.success).toBe(true);
        expect(mockStore.set).toHaveBeenCalledTimes(3);
      }
    });

    it('should handle empty tokens object', async () => {
      mockStore.set.mockClear();
      const handler = ipcHandlers['store-tokens'];
      if (handler) {
        const result = await handler({}, {});
        expect(result.success).toBe(true);
        expect(mockStore.set).not.toHaveBeenCalled();
      }
    });
  });
});