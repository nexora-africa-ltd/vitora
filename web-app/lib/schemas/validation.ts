/**
 * API Response Validation Utilities
 *
 * Provides safe parsing of API responses with Zod schemas.
 * Logs validation errors in development and throws in strict mode.
 */
import { z, ZodSchema, ZodError } from 'zod';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Validation options
 */
export interface ParseOptions {
  /** If true, throw on validation failure. If false, log warning and return data as-is. */
  strict?: boolean;
  /** Context for error messages (e.g., "clinicsApi.getQueue") */
  context?: string;
}

/**
 * Safely parse API response data with a Zod schema.
 *
 * In development: logs detailed validation errors
 * In strict mode: throws ZodError
 * In lenient mode: returns data as-is with warning
 */
export function parseResponse<T>(
  schema: ZodSchema<T>,
  data: unknown,
  options: ParseOptions = {}
): T {
  const { strict = false, context = 'API response' } = options;

  const result = schema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  // Log validation errors
  const errorDetails = formatZodError(result.error);
  const message = `[API Validation] ${context}: Response validation failed\n${errorDetails}`;

  if (isDev) {
    console.warn(message);
    console.warn('[API Validation] Received data:', JSON.stringify(data, null, 2).slice(0, 1000));
  }

  if (strict) {
    throw new Error(`${context}: Invalid API response - ${result.error.issues[0]?.message || 'validation failed'}`);
  }

  // Return data as-is in lenient mode (type assertion since validation failed)
  return data as T;
}

/**
 * Format Zod errors for logging
 */
function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return `  - ${path || 'root'}: ${issue.message} (${issue.code})`;
    })
    .join('\n');
}

/**
 * Create a validated API method wrapper
 *
 * Usage:
 * ```ts
 * const getQueue = validated(
 *   ClinicVisitArrayResponseSchema,
 *   async (clinicId: number) => {
 *     const response = await apiClient.get(`/api/clinics/${clinicId}/queue/`);
 *     return response.data;
 *   },
 *   { context: 'clinicsApi.getQueue' }
 * );
 * ```
 */
export function validated<T, Args extends unknown[]>(
  schema: ZodSchema<T>,
  fn: (...args: Args) => Promise<unknown>,
  options: ParseOptions = {}
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    const data = await fn(...args);
    return parseResponse(schema, data, options);
  };
}
