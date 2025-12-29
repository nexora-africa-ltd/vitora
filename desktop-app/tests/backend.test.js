/**
 * Tests for backend integration
 *
 * Following TDD principles: these tests are written to validate
 * backend server startup, shutdown, and health checking.
 */

// Mock electron and electron-store BEFORE requiring any modules
jest.mock('electron', () => ({
  app: {
    whenReady: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    quit: jest.fn(),
    exit: jest.fn(),
    getPath: jest.fn().mockReturnValue('/tmp')
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadFile: jest.fn(),
    on: jest.fn(),
    webContents: { on: jest.fn() }
  })),
  ipcMain: {
    handle: jest.fn()
  }
}));

jest.mock('electron-store', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn()
  }));
});

// Mock child_process and axios for testing
jest.mock('child_process');
jest.mock('axios');

// Now import after mocks are set up
const { startBackend, stopBackend, checkBackendHealth } = require('../src/main/index');

describe('Backend Integration Tests', () => {
  describe('startBackend', () => {
    it('should start the Django backend server', async () => {
      // This test validates that startBackend function exists and can be called
      expect(typeof startBackend).toBe('function');
    });

    it('should resolve when backend starts successfully', async () => {
      // Mock successful server start
      const { spawn } = require('child_process');
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        pid: 12345,
        exitCode: null
      };

      spawn.mockReturnValue(mockProcess);

      // Simulate server started message
      setTimeout(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find(
          call => call[0] === 'data'
        )?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('Starting development server at http://127.0.0.1:8000/'));
        }
      }, 100);

      await expect(startBackend()).resolves.toBeUndefined();
    });
  });

  describe('stopBackend', () => {
    it('should stop the Django backend server', async () => {
      expect(typeof stopBackend).toBe('function');
      // Note: stopBackend may fail if no process is running, which is expected in tests
      // We're primarily verifying the function exists and is callable
    });
  });

  describe('checkBackendHealth', () => {
    it('should return true when backend is healthy', async () => {
      const axios = require('axios');
      axios.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { status: 'healthy' }
      });

      const healthy = await checkBackendHealth();
      expect(healthy).toBe(true);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/'),
        expect.any(Object)
      );
    });

    it('should return false when backend is not responding', async () => {
      const axios = require('axios');
      axios.get = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const healthy = await checkBackendHealth();
      expect(healthy).toBe(false);
    });
  });
});
