import { transformAxiosError } from '@/lib/api/client';
import axios, { AxiosError } from 'axios';

jest.mock('@/lib/auth/storage');

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have correct base URL', () => {
    // Import dynamically after mocks are set up
    const { apiClient } = require('@/lib/api/client');
    expect(apiClient.defaults.baseURL).toBeDefined();
  });

  it('should have timeout configured', () => {
    const { apiClient } = require('@/lib/api/client');
    expect(apiClient.defaults.timeout).toBe(30000);
  });

  it('should have interceptors configured', () => {
    const { apiClient } = require('@/lib/api/client');
    expect(apiClient.interceptors.request.handlers.length).toBeGreaterThan(0);
    expect(apiClient.interceptors.response.handlers.length).toBeGreaterThan(0);
  });

  it('should have correct content-type header', () => {
    const { apiClient } = require('@/lib/api/client');
    expect(apiClient.defaults.headers['Content-Type']).toBe('application/json');
  });
});

describe('transformAxiosError', () => {
  it('should transform response error', () => {
    const error = {
      response: {
        status: 400,
        data: { detail: 'Bad request' },
      },
    } as AxiosError;
    
    const result = transformAxiosError(error);
    
    expect(result.message).toBe('Bad request');
    expect(result.status).toBe(400);
  });

  it('should handle network error', () => {
    const error = {
      request: {},
    } as AxiosError;
    
    const result = transformAxiosError(error);
    
    expect(result.code).toBe('NETWORK_ERROR');
    expect(result.status).toBe(0);
  });
});
