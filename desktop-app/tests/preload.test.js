/**
 * Tests for preload script
 * 
 * These tests verify the contextBridge API exposed to the renderer process.
 */

// Mock electron modules
const mockInvoke = jest.fn();

jest.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: jest.fn()
  },
  ipcRenderer: {
    invoke: jest.fn()
  }
}));

describe('Preload Script - preload.js', () => {
  let exposedAPI;

  beforeAll(() => {
    // Clear module cache to ensure fresh require
    jest.resetModules();
    
    // Re-mock after reset
    jest.mock('electron', () => ({
      contextBridge: {
        exposeInMainWorld: jest.fn((name, api) => {
          exposedAPI = api;
        })
      },
      ipcRenderer: {
        invoke: mockInvoke
      }
    }));

    // Now require the preload script
    require('../src/preload/preload');
  });

  beforeEach(() => {
    mockInvoke.mockClear();
  });

  describe('contextBridge.exposeInMainWorld', () => {
    it('should expose electronAPI to the renderer', () => {
      const { contextBridge } = require('electron');
      
      expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith(
        'electronAPI',
        expect.any(Object)
      );
    });

    it('should expose apiRequest method', () => {
      expect(exposedAPI).toBeDefined();
      expect(typeof exposedAPI.apiRequest).toBe('function');
    });

    it('should expose getBackendUrl method', () => {
      expect(typeof exposedAPI.getBackendUrl).toBe('function');
    });

    it('should expose storeTokens method', () => {
      expect(typeof exposedAPI.storeTokens).toBe('function');
    });

    it('should expose getStoredTokens method', () => {
      expect(typeof exposedAPI.getStoredTokens).toBe('function');
    });

    it('should expose clearTokens method', () => {
      expect(typeof exposedAPI.clearTokens).toBe('function');
    });
  });

  describe('apiRequest', () => {
    it('should invoke api-request with correct parameters', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: {} });
      
      await exposedAPI.apiRequest('GET', '/api/patients/', null);
      
      expect(mockInvoke).toHaveBeenCalledWith('api-request', {
        method: 'GET',
        endpoint: '/api/patients/',
        data: null
      });
    });

    it('should pass POST data correctly', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: {} });
      const postData = { first_name: 'John', last_name: 'Doe' };
      
      await exposedAPI.apiRequest('POST', '/api/patients/', postData);
      
      expect(mockInvoke).toHaveBeenCalledWith('api-request', {
        method: 'POST',
        endpoint: '/api/patients/',
        data: postData
      });
    });

    it('should return the IPC response', async () => {
      const mockResponse = { success: true, data: { id: 1 } };
      mockInvoke.mockResolvedValue(mockResponse);
      
      const result = await exposedAPI.apiRequest('GET', '/api/patients/1/', null);
      
      expect(result).toEqual(mockResponse);
    });

    it('should handle PUT requests', async () => {
      mockInvoke.mockResolvedValue({ success: true });
      const updateData = { first_name: 'Jane' };
      
      await exposedAPI.apiRequest('PUT', '/api/patients/1/', updateData);
      
      expect(mockInvoke).toHaveBeenCalledWith('api-request', {
        method: 'PUT',
        endpoint: '/api/patients/1/',
        data: updateData
      });
    });

    it('should handle DELETE requests', async () => {
      mockInvoke.mockResolvedValue({ success: true });
      
      await exposedAPI.apiRequest('DELETE', '/api/patients/1/', null);
      
      expect(mockInvoke).toHaveBeenCalledWith('api-request', {
        method: 'DELETE',
        endpoint: '/api/patients/1/',
        data: null
      });
    });

    it('should handle PATCH requests', async () => {
      mockInvoke.mockResolvedValue({ success: true });
      const patchData = { status: 'active' };
      
      await exposedAPI.apiRequest('PATCH', '/api/patients/1/', patchData);
      
      expect(mockInvoke).toHaveBeenCalledWith('api-request', {
        method: 'PATCH',
        endpoint: '/api/patients/1/',
        data: patchData
      });
    });
  });

  describe('getBackendUrl', () => {
    it('should invoke get-backend-url', async () => {
      mockInvoke.mockResolvedValue('http://127.0.0.1:9088');
      
      await exposedAPI.getBackendUrl();
      
      expect(mockInvoke).toHaveBeenCalledWith('get-backend-url');
    });

    it('should return the backend URL', async () => {
      mockInvoke.mockResolvedValue('http://127.0.0.1:9088');
      
      const url = await exposedAPI.getBackendUrl();
      
      expect(url).toBe('http://127.0.0.1:9088');
    });
  });

  describe('storeTokens', () => {
    it('should invoke store-tokens with tokens object', async () => {
      mockInvoke.mockResolvedValue({ success: true });
      const tokens = {
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        user: { id: 1, username: 'testuser' }
      };
      
      await exposedAPI.storeTokens(tokens);
      
      expect(mockInvoke).toHaveBeenCalledWith('store-tokens', tokens);
    });

    it('should store only access token', async () => {
      mockInvoke.mockResolvedValue({ success: true });
      
      await exposedAPI.storeTokens({ accessToken: 'access-123' });
      
      expect(mockInvoke).toHaveBeenCalledWith('store-tokens', {
        accessToken: 'access-123'
      });
    });

    it('should store only refresh token', async () => {
      mockInvoke.mockResolvedValue({ success: true });
      
      await exposedAPI.storeTokens({ refreshToken: 'refresh-456' });
      
      expect(mockInvoke).toHaveBeenCalledWith('store-tokens', {
        refreshToken: 'refresh-456'
      });
    });

    it('should return the result', async () => {
      mockInvoke.mockResolvedValue({ success: true });
      
      const result = await exposedAPI.storeTokens({ accessToken: 'test' });
      
      expect(result).toEqual({ success: true });
    });
  });

  describe('getStoredTokens', () => {
    it('should invoke get-stored-tokens', async () => {
      mockInvoke.mockResolvedValue({
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        user: { id: 1 }
      });
      
      await exposedAPI.getStoredTokens();
      
      expect(mockInvoke).toHaveBeenCalledWith('get-stored-tokens');
    });

    it('should return stored tokens', async () => {
      const storedTokens = {
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        user: { id: 1, username: 'testuser' }
      };
      mockInvoke.mockResolvedValue(storedTokens);
      
      const result = await exposedAPI.getStoredTokens();
      
      expect(result).toEqual(storedTokens);
    });

    it('should return null when no tokens stored', async () => {
      mockInvoke.mockResolvedValue(null);
      
      const result = await exposedAPI.getStoredTokens();
      
      expect(result).toBeNull();
    });
  });

  describe('clearTokens', () => {
    it('should invoke clear-tokens', async () => {
      mockInvoke.mockResolvedValue({ success: true });
      
      await exposedAPI.clearTokens();
      
      expect(mockInvoke).toHaveBeenCalledWith('clear-tokens');
    });

    it('should return the result', async () => {
      mockInvoke.mockResolvedValue({ success: true });
      
      const result = await exposedAPI.clearTokens();
      
      expect(result).toEqual({ success: true });
    });
  });
});

describe('Preload API Integration Scenarios', () => {
  let exposedAPI;
  const mockInvoke = jest.fn();

  beforeAll(() => {
    jest.resetModules();
    jest.mock('electron', () => ({
      contextBridge: {
        exposeInMainWorld: jest.fn((name, api) => {
          exposedAPI = api;
        })
      },
      ipcRenderer: {
        invoke: mockInvoke
      }
    }));
    require('../src/preload/preload');
  });

  beforeEach(() => {
    mockInvoke.mockClear();
  });

  describe('Authentication Flow', () => {
    it('should support complete login flow', async () => {
      // 1. Login request
      mockInvoke.mockResolvedValueOnce({
        success: true,
        data: {
          access: 'new-access-token',
          refresh: 'new-refresh-token'
        }
      });
      
      const loginResponse = await exposedAPI.apiRequest('POST', '/api/token/', {
        username: 'testuser',
        password: 'password123'
      });
      
      expect(loginResponse.success).toBe(true);
      
      // 2. Store tokens
      mockInvoke.mockResolvedValueOnce({ success: true });
      
      await exposedAPI.storeTokens({
        accessToken: loginResponse.data.access,
        refreshToken: loginResponse.data.refresh,
        user: { username: 'testuser' }
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('store-tokens', expect.any(Object));
    });

    it('should support logout flow', async () => {
      mockInvoke.mockResolvedValue({ success: true });
      
      await exposedAPI.clearTokens();
      
      expect(mockInvoke).toHaveBeenCalledWith('clear-tokens');
    });

    it('should support token refresh flow', async () => {
      // Get stored refresh token
      mockInvoke.mockResolvedValueOnce({
        accessToken: null, // expired
        refreshToken: 'valid-refresh-token'
      });
      
      const stored = await exposedAPI.getStoredTokens();
      
      // Refresh request
      mockInvoke.mockResolvedValueOnce({
        success: true,
        data: { access: 'new-access-token' }
      });
      
      const refreshResponse = await exposedAPI.apiRequest('POST', '/api/token/refresh/', {
        refresh: stored.refreshToken
      });
      
      expect(refreshResponse.success).toBe(true);
      
      // Store new access token
      mockInvoke.mockResolvedValueOnce({ success: true });
      
      await exposedAPI.storeTokens({
        accessToken: refreshResponse.data.access
      });
      
      expect(mockInvoke).toHaveBeenLastCalledWith('store-tokens', {
        accessToken: 'new-access-token'
      });
    });
  });

  describe('Patient API Flow', () => {
    it('should support fetching patient list', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        data: {
          results: [
            { id: 1, first_name: 'John', last_name: 'Doe' },
            { id: 2, first_name: 'Jane', last_name: 'Smith' }
          ],
          count: 2
        }
      });
      
      const response = await exposedAPI.apiRequest('GET', '/api/patients/', null);
      
      expect(response.success).toBe(true);
      expect(response.data.results.length).toBe(2);
    });

    it('should support creating a patient', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        data: {
          id: 3,
          mrn: 'MRN-20251230-0001',
          first_name: 'New',
          last_name: 'Patient'
        }
      });
      
      const response = await exposedAPI.apiRequest('POST', '/api/patients/', {
        first_name: 'New',
        last_name: 'Patient',
        date_of_birth: '1990-01-15',
        sex: 'M',
        county: 1,
        sub_county: 1
      });
      
      expect(response.success).toBe(true);
      expect(response.data.mrn).toBeDefined();
    });

    it('should support updating a patient', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        data: { id: 1, phone_number: '0712345678' }
      });
      
      const response = await exposedAPI.apiRequest('PATCH', '/api/patients/1/', {
        phone_number: '0712345678'
      });
      
      expect(response.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      mockInvoke.mockResolvedValue({
        success: false,
        error: 'Network Error'
      });
      
      const response = await exposedAPI.apiRequest('GET', '/api/patients/', null);
      
      expect(response.success).toBe(false);
      expect(response.error).toBe('Network Error');
    });

    it('should handle 401 unauthorized', async () => {
      mockInvoke.mockResolvedValue({
        success: false,
        error: { detail: 'Authentication credentials were not provided.' }
      });
      
      const response = await exposedAPI.apiRequest('GET', '/api/patients/', null);
      
      expect(response.success).toBe(false);
    });

    it('should handle 404 not found', async () => {
      mockInvoke.mockResolvedValue({
        success: false,
        error: { detail: 'Not found.' }
      });
      
      const response = await exposedAPI.apiRequest('GET', '/api/patients/9999/', null);
      
      expect(response.success).toBe(false);
    });

    it('should handle 400 validation errors', async () => {
      mockInvoke.mockResolvedValue({
        success: false,
        error: {
          first_name: ['This field is required.'],
          last_name: ['This field is required.']
        }
      });
      
      const response = await exposedAPI.apiRequest('POST', '/api/patients/', {});
      
      expect(response.success).toBe(false);
      expect(response.error.first_name).toBeDefined();
    });
  });
});
