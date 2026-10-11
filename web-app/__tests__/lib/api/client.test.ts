import {
  connectCloudSession,
  transformAxiosError,
  apiClient,
  getApiErrorMessage,
} from '@/lib/api/client';
import { AxiosError } from 'axios';
import { toast } from 'sonner';

const mockGetAppConfig = jest.fn();
const mockIsDesktop = jest.fn();
const mockSetCloudAccessToken = jest.fn();

jest.mock('@/lib/desktop', () => ({
  getAppConfig: (...args: unknown[]) => mockGetAppConfig(...args),
  isDesktop: (...args: unknown[]) => mockIsDesktop(...args),
}));
jest.mock('@/lib/auth/storage', () => ({
  tokenStorage: {
    getCloudAccessToken: jest.fn(),
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
    setCloudAccessToken: (...args: unknown[]) => mockSetCloudAccessToken(...args),
    clearCloudTokens: jest.fn(),
    clearAll: jest.fn(),
    setTokens: jest.fn(),
  },
}));
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

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
    // Just verify the interceptors object exists
    expect(apiClient.interceptors.request).toBeDefined();
    expect(apiClient.interceptors.response).toBeDefined();
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

describe('connectCloudSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsDesktop.mockReturnValue(true);
    mockGetAppConfig.mockResolvedValue({
      client_id: 'client-installation-id',
      deployment_mode: 'lan_client',
    });
  });

  it('asks the authenticated hub to sign and exchange for an access-only cloud token', async () => {
    jest.spyOn(apiClient, 'post').mockResolvedValue({ data: { access_token: 'cloud-access' } });

    await expect(connectCloudSession()).resolves.toEqual({ connected: true });

    expect(apiClient.post).toHaveBeenCalledWith('/api/licensing/hub/user-token/', {});
    expect(mockSetCloudAccessToken).toHaveBeenCalledWith('cloud-access');
    expect(toast.success).toHaveBeenCalledWith('Vitora Cloud connected', {
      description: 'Cloud-only workflows are now available.',
    });
  });

  it('reports a reachable cloud rejection instead of an unavailable cloud', async () => {
    jest.spyOn(apiClient, 'post').mockRejectedValue({
      response: {
        status: 409,
        data: { detail: 'Hub activation requires review.', code: 'hub_activation_pending' },
      },
    });

    await expect(connectCloudSession()).resolves.toEqual({
      connected: false,
      reason: 'rejected',
      detail: 'Hub activation requires review.',
    });
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

  it('should handle response with error field', () => {
    const error = {
      response: {
        status: 400,
        data: { error: "Cannot release an encounter with status 'CANCELLED'." },
      },
    } as AxiosError;

    const result = transformAxiosError(error);

    expect(result.message).toBe("Cannot release an encounter with status 'CANCELLED'.");
    expect(result.status).toBe(400);
  });

  it('should handle response with non_field_errors array', () => {
    const error = {
      response: {
        status: 400,
        data: { non_field_errors: ['Invalid credentials', 'Account locked'] },
      },
    } as AxiosError;

    const result = transformAxiosError(error);

    expect(result.message).toBe('Invalid credentials. Account locked');
    expect(result.status).toBe(400);
  });

  it('should prioritize detail over error field', () => {
    const error = {
      response: {
        status: 400,
        data: { detail: 'Primary error', error: 'Secondary error' },
      },
    } as AxiosError;

    const result = transformAxiosError(error);

    expect(result.message).toBe('Primary error');
  });
});

describe('getApiErrorMessage', () => {
  it('should extract detail field from API error', () => {
    const error = new AxiosError('Request failed');
    error.response = {
      status: 400,
      data: { detail: 'Invalid request data' },
      statusText: 'Bad Request',
      headers: {},
      config: {} as unknown,
    };

    expect(getApiErrorMessage(error)).toBe('Invalid request data');
  });

  it('should extract error field from API error', () => {
    const error = new AxiosError('Request failed');
    error.response = {
      status: 400,
      data: { error: "Cannot release an encounter with status 'CANCELLED'." },
      statusText: 'Bad Request',
      headers: {},
      config: {} as unknown,
    };

    expect(getApiErrorMessage(error)).toBe("Cannot release an encounter with status 'CANCELLED'.");
  });

  it('should extract message field from API error', () => {
    const error = new AxiosError('Request failed');
    error.response = {
      status: 500,
      data: { message: 'Something went wrong' },
      statusText: 'Internal Server Error',
      headers: {},
      config: {} as unknown,
    };

    expect(getApiErrorMessage(error)).toBe('Something went wrong');
  });

  it('should handle DRF field validation errors', () => {
    const error = new AxiosError('Request failed');
    error.response = {
      status: 400,
      data: {
        email: ['Enter a valid email address'],
        password: ['This field is required'],
      },
      statusText: 'Bad Request',
      headers: {},
      config: {} as unknown,
    };

    const result = getApiErrorMessage(error);
    expect(result).toContain('Email: Enter a valid email address');
    expect(result).toContain('Password: This field is required');
  });

  it('should handle non_field_errors without prefix', () => {
    const error = new AxiosError('Request failed');
    error.response = {
      status: 400,
      data: {
        non_field_errors: ['Invalid credentials'],
      },
      statusText: 'Bad Request',
      headers: {},
      config: {} as unknown,
    };

    expect(getApiErrorMessage(error)).toBe('Invalid credentials');
  });

  it('should prioritize detail over field errors', () => {
    const error = new AxiosError('Request failed');
    error.response = {
      status: 400,
      data: {
        detail: 'Authentication failed',
        email: ['Invalid email'],
      },
      statusText: 'Bad Request',
      headers: {},
      config: {} as unknown,
    };

    expect(getApiErrorMessage(error)).toBe('Authentication failed');
  });

  it('should return message from standard Error', () => {
    const error = new Error('Standard error message');
    expect(getApiErrorMessage(error)).toBe('Standard error message');
  });

  it('should return default message for unknown error type', () => {
    expect(getApiErrorMessage('string error')).toBe('An unexpected error occurred');
    expect(getApiErrorMessage(null)).toBe('An unexpected error occurred');
    expect(getApiErrorMessage(undefined)).toBe('An unexpected error occurred');
  });
});

describe('permission denied toasts', () => {
  const getRejectedInterceptor = () => {
    const handlers = (
      apiClient.interceptors.response as unknown as {
        handlers: Array<{ rejected?: (error: AxiosError) => Promise<unknown> }>;
      }
    ).handlers;
    const rejected = handlers[0]?.rejected;
    if (!rejected) {
      throw new Error('Response rejected interceptor not found');
    }
    return rejected;
  };

  const buildPermissionDeniedError = (method: string): AxiosError => {
    const error = new AxiosError('Forbidden') as AxiosError & {
      config: Record<string, unknown>;
    };
    error.response = {
      status: 403,
      data: {
        code: 'permission_denied',
        detail: 'You do not have permission to view this resource',
      },
      statusText: 'Forbidden',
      headers: {},
      config: {} as unknown,
    };
    error.config = { method };
    return error;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not show permission toast for 403 GET requests', async () => {
    const rejected = getRejectedInterceptor();
    await rejected(buildPermissionDeniedError('get')).catch(() => undefined);

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows permission toast for 403 write requests', async () => {
    const rejected = getRejectedInterceptor();
    await rejected(buildPermissionDeniedError('post')).catch(() => undefined);

    expect(toast.error).toHaveBeenCalledWith('Permission denied', {
      description: 'You do not have permission to view this resource',
    });
  });
});
