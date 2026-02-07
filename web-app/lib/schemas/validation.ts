/**
 * API Response Validation Utilities
 *
 * Provides safe parsing of API responses with Zod schemas.
 *
 * Behavior:
 * - Strict by default in all environments (fail fast, catch bugs early)
 * - Throws ZodError directly for structured error inspection
 * - Logs detailed validation errors in development
 * - Can opt-out with explicit `strict: false` (not recommended)
 *
 * This ensures data shape mismatches are caught immediately before they
 * cause cryptic runtime errors like "Cannot read properties of undefined".
 */
import { z, ZodError, ZodTypeAny } from 'zod';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Validation options
 */
export interface ParseOptions {
  /**
   * If true, throw ZodError on validation failure.
   * If false, log warning and return data as-is (not recommended).
   * @default true
   */
  strict?: boolean;

  /** Context for error messages (e.g., "clinicsApi.getQueue") */
  context?: string;

  /**
   * Log received data on validation failure (dev only).
   * @default true
   */
  logData?: boolean;
}

/**
 * Safely parse API response data with a Zod schema.
 *
 * @param schema - Zod schema to validate against
 * @param data - Raw API response data
 * @param options - Validation options
 * @returns Parsed and typed data
 * @throws ZodError if validation fails and strict mode is enabled
 *
 * @example
 * ```ts
 * const patient = parseResponse(PatientSchema, response.data, {
 *   context: 'patientsApi.get'
 * });
 * ```
 */
export function parseResponse<S extends ZodTypeAny>(
  schema: S,
  data: unknown,
  options: ParseOptions = {}
): z.infer<S> {
  const {
    strict = true,
    context = 'API response',
    logData = true,
  } = options;

  const result = schema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  // Attach context to error for programmatic access
  (result.error as ZodError & { context?: string }).context = context;

  const message = `[API Validation] ${context}: response validation failed`;

  if (isDev) {
    console.warn(message);
    console.warn(formatZodError(result.error));

    if (logData) {
      try {
        console.warn(
          '[API Validation] Received data:',
          JSON.stringify(data, null, 2).slice(0, 1000)
        );
      } catch {
        console.warn('[API Validation] Received data: <unserializable>');
      }
    }
  }

  if (strict) {
    throw result.error;
  }

  // Explicitly lenient mode (not recommended)
  return data as z.infer<S>;
}

/**
 * Format Zod errors for readable console output
 */
function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : 'root';
      return `  - ${path}: ${issue.message} (${issue.code})`;
    })
    .join('\n');
}

/**
 * Create a validated async API method wrapper.
 *
 * Wraps an async function to automatically validate its return value
 * against a Zod schema.
 *
 * @param schema - Zod schema to validate response against
 * @param fn - Async function that returns raw API data
 * @param options - Validation options
 * @returns Wrapped function that returns validated, typed data
 *
 * @example
 * ```ts
 * const getQueue = validated(
 *   ClinicVisitArraySchema,
 *   async (clinicId: number) => {
 *     const response = await apiClient.get(`/api/clinics/${clinicId}/queue/`);
 *     return response.data;
 *   },
 *   { context: 'clinicsApi.getQueue' }
 * );
 * ```
 */
export function validated<S extends ZodTypeAny, Args extends unknown[]>(
  schema: S,
  fn: (...args: Args) => Promise<unknown>,
  options?: ParseOptions
): (...args: Args) => Promise<z.infer<S>> {
  return async (...args: Args) => {
    const data = await fn(...args);
    return parseResponse(schema, data, options);
  };
}
