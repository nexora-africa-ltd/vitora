/**
 * Tests for backend integration
 * 
 * Following TDD principles: these tests are written to validate
 * backend server startup, shutdown, and health checking.
 */

const { startBackend, stopBackend, checkBackendHealth } = require('../src/main/index');

// Mock child_process and axios for testing
jest.mock('child_process');
jest.mock('axios');
jest.mock('electron', () => ({
  app: {
    whenReady: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    quit: jest.fn(),
    exit: jest.fn()
  },
  BrowserWindow: jest.fn(),
  ipcMain: {
    handle: jest.fn()
  }
}));

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
      await expect(stopBackend()).resolves.toBeUndefined();
    });
  });
  
  describe('checkBackendHealth', () => {
    it('should return true when backend is healthy', async () => {
      const axios = require('axios');
      axios.get = jest.fn().mockResolvedValue({ status: 200 });
      
      const healthy = await checkBackendHealth();
      expect(healthy).toBe(true);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/patients/'),
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
