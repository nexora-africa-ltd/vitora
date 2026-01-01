import { transformAxiosError, apiClient } from '@/lib/api/client';
import { AxiosError } from 'axios';

jest.mock('@/lib/auth/storage');

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have correct base URL', () => {
    expect(apiClient.defaults.baseURL).toBeDefined();
  });

  it('should have timeout configured', () => {
    expect(apiClient.defaults.timeout).toBe(30000);
  });

  it('should have interceptors configured', () => {
    expect(apiClient.interceptors.request.handlers.length).toBeGreaterThan(0);
    expect(apiClient.interceptors.response.handlers.length).toBeGreaterThan(0);
  });

  it('should have correct content-type header', () => {
    expect(apiClient.defaults.headers['Content-Type']).toBe('application/json');
  });

  it('should be an axios instance', () => {
    expect(apiClient.get).toBeDefined();
    expect(apiClient.post).toBeDefined();
    expect(apiClient.put).toBeDefined();
    expect(apiClient.delete).toBeDefined();
    expect(apiClient.patch).toBeDefined();
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

  it('should handle unknown error without request', () => {
    const error = {
      message: 'Something went wrong',
    } as AxiosError;

    const result = transformAxiosError(error);

    expect(result.code).toBe('UNKNOWN_ERROR');
    expect(result.status).toBe(0);
    expect(result.message).toBe('Something went wrong');
  });

  it('should handle response with message field', () => {
    const error = {
      response: {
        status: 500,
        data: { message: 'Internal server error' },
      },
    } as AxiosError;

    const result = transformAxiosError(error);

    expect(result.message).toBe('Internal server error');
    expect(result.status).toBe(500);
  });

  it('should handle response with code', () => {
    const error = {
      response: {
        status: 401,
        data: { detail: 'Unauthorized', code: 'TOKEN_EXPIRED' },
      },
    } as AxiosError;

    const result = transformAxiosError(error);

    expect(result.code).toBe('TOKEN_EXPIRED');
  });

  it('should handle response with errors object', () => {
    const error = {
      response: {
        status: 400,
        data: {
          errors: {
            email: ['Invalid email'],
            password: ['Too short'],
          },
        },
      },
    } as AxiosError;

    const result = transformAxiosError(error);

    // details should be the errors object when present
    expect(result.details).toEqual({
      email: ['Invalid email'],
      password: ['Too short'],
    });
  });

  it('should provide default message when data is empty', () => {
    const error = {
      response: {
        status: 500,
        data: {},
      },
    } as AxiosError;

    const result = transformAxiosError(error);

    expect(result.message).toBe('An error occurred');
  });

  it('should provide default message for empty error', () => {
    const error = {} as AxiosError;

    const result = transformAxiosError(error);

    expect(result.message).toBe('An unexpected error occurred');
  });
});
