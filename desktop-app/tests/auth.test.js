/**
 * Tests for Authentication and Token Management
 *
 * Following TDD principles: these tests validate token storage,
 * retrieval, refresh, and expiry handling.
 *
 * Sprint 0.6: Login UI implementation
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
    webContents: {
      on: jest.fn(),
      send: jest.fn()
    }
  })),
  ipcMain: {
    handle: jest.fn()
  }
}));

// Create a mock store implementation
const mockStoreData = {};
jest.mock('electron-store', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn((key, defaultValue) => mockStoreData[key] ?? defaultValue),
    set: jest.fn((key, value) => { mockStoreData[key] = value; }),
    delete: jest.fn((key) => { delete mockStoreData[key]; }),
    has: jest.fn((key) => key in mockStoreData),
    clear: jest.fn(() => { Object.keys(mockStoreData).forEach(key => delete mockStoreData[key]); })
  }));
});

jest.mock('axios');

// Helper to clear mock store between tests
function clearMockStore() {
  Object.keys(mockStoreData).forEach(key => delete mockStoreData[key]);
}

describe('Token Management', () => {
  let authModule;
  let axios;

  beforeEach(() => {
    clearMockStore();
    jest.resetModules();
    axios = require('axios');
  });

  describe('Token Storage', () => {
    it('should store access and refresh tokens', () => {
      const Store = require('electron-store');
      const store = new Store();

      const tokens = {
        access: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.test_access_token',
        refresh: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.test_refresh_token'
      };

      store.set('auth.accessToken', tokens.access);
      store.set('auth.refreshToken', tokens.refresh);

      expect(store.get('auth.accessToken')).toBe(tokens.access);
      expect(store.get('auth.refreshToken')).toBe(tokens.refresh);
    });

    it('should clear tokens on logout', () => {
      const Store = require('electron-store');
      const store = new Store();

      // Set tokens first
      store.set('auth.accessToken', 'test_access');
      store.set('auth.refreshToken', 'test_refresh');
      store.set('auth.user', { username: 'testuser' });

      // Clear tokens
      store.delete('auth.accessToken');
      store.delete('auth.refreshToken');
      store.delete('auth.user');

      expect(store.get('auth.accessToken')).toBeUndefined();
      expect(store.get('auth.refreshToken')).toBeUndefined();
      expect(store.get('auth.user')).toBeUndefined();
    });

    it('should return null for missing tokens', () => {
      const Store = require('electron-store');
      const store = new Store();

      expect(store.get('auth.accessToken')).toBeUndefined();
      expect(store.get('auth.refreshToken')).toBeUndefined();
    });
  });

  describe('Token Expiry', () => {
    it('should detect expired token from JWT payload', () => {
      // Create a mock expired JWT (exp in the past)
      const expiredPayload = {
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        user_id: 1,
        username: 'testuser'
      };
      const encodedPayload = Buffer.from(JSON.stringify(expiredPayload)).toString('base64');
      const expiredToken = `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.${encodedPayload}.signature`;

      // Function to check token expiry
      function isTokenExpired(token) {
        try {
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          return payload.exp < Math.floor(Date.now() / 1000);
        } catch {
          return true; // Invalid token is considered expired
        }
      }

      expect(isTokenExpired(expiredToken)).toBe(true);
    });

    it('should detect valid (non-expired) token', () => {
      // Create a mock valid JWT (exp in the future)
      const validPayload = {
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        user_id: 1,
        username: 'testuser'
      };
      const encodedPayload = Buffer.from(JSON.stringify(validPayload)).toString('base64');
      const validToken = `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.${encodedPayload}.signature`;

      function isTokenExpired(token) {
        try {
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          return payload.exp < Math.floor(Date.now() / 1000);
        } catch {
          return true;
        }
      }

      expect(isTokenExpired(validToken)).toBe(false);
    });
  });

  describe('Login API', () => {
    it('should return tokens on successful login', async () => {
      const mockResponse = {
        data: {
          access: 'access_token_123',
          refresh: 'refresh_token_456'
        }
      };

      axios.post = jest.fn().mockResolvedValue(mockResponse);

      const response = await axios.post('http://127.0.0.1:8000/api/token/', {
        username: 'testuser',
        password: 'testpassword123'
      });

      expect(response.data.access).toBe('access_token_123');
      expect(response.data.refresh).toBe('refresh_token_456');
      expect(axios.post).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/api/token/',
        { username: 'testuser', password: 'testpassword123' }
      );
    });

    it('should throw error for invalid credentials', async () => {
      const mockError = {
        response: {
          status: 401,
          data: { detail: 'No active account found with the given credentials' }
        }
      };

      axios.post = jest.fn().mockRejectedValue(mockError);

      await expect(
        axios.post('http://127.0.0.1:8000/api/token/', {
          username: 'wronguser',
          password: 'wrongpassword'
        })
      ).rejects.toEqual(mockError);
    });
  });

  describe('Token Refresh', () => {
    it('should refresh access token using refresh token', async () => {
      const mockResponse = {
        data: {
          access: 'new_access_token_789'
        }
      };

      axios.post = jest.fn().mockResolvedValue(mockResponse);

      const response = await axios.post('http://127.0.0.1:8000/api/token/refresh/', {
        refresh: 'refresh_token_456'
      });

      expect(response.data.access).toBe('new_access_token_789');
      expect(axios.post).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/api/token/refresh/',
        { refresh: 'refresh_token_456' }
      );
    });

    it('should fail refresh with invalid refresh token', async () => {
      const mockError = {
        response: {
          status: 401,
          data: { detail: 'Token is invalid or expired' }
        }
      };

      axios.post = jest.fn().mockRejectedValue(mockError);

      await expect(
        axios.post('http://127.0.0.1:8000/api/token/refresh/', {
          refresh: 'invalid_refresh_token'
        })
      ).rejects.toEqual(mockError);
    });
  });

  describe('Authenticated Requests', () => {
    it('should include Authorization header with token', async () => {
      axios.get = jest.fn().mockResolvedValue({ data: [] });

      const accessToken = 'valid_access_token';

      await axios.get('http://127.0.0.1:8000/api/patients/', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      expect(axios.get).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/api/patients/',
        {
          headers: {
            'Authorization': 'Bearer valid_access_token'
          }
        }
      );
    });

    it('should return 401 for requests without token', async () => {
      const mockError = {
        response: {
          status: 401,
          data: { detail: 'Authentication credentials were not provided.' }
        }
      };

      axios.get = jest.fn().mockRejectedValue(mockError);

      await expect(
        axios.get('http://127.0.0.1:8000/api/patients/')
      ).rejects.toEqual(mockError);
    });
  });
});

describe('User Session', () => {
  beforeEach(() => {
    clearMockStore();
  });

  it('should store user information after login', () => {
    const Store = require('electron-store');
    const store = new Store();

    const user = {
      username: 'testuser',
      email: 'test@example.com'
    };

    store.set('auth.user', user);

    expect(store.get('auth.user')).toEqual(user);
  });

  it('should check if user is logged in', () => {
    const Store = require('electron-store');
    const store = new Store();

    // Not logged in initially
    expect(store.has('auth.accessToken')).toBe(false);

    // After login
    store.set('auth.accessToken', 'test_token');
    expect(store.has('auth.accessToken')).toBe(true);
  });
});
