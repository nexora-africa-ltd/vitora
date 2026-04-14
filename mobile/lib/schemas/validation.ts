import { z, type ZodError, type ZodTypeAny } from 'zod';

export interface ParseOptions {
  context?: string;
  strict?: boolean;
}

export function parseResponse<S extends ZodTypeAny>(schema: S, data: unknown, options: ParseOptions = {}): z.infer<S> {
  const { context = 'API response', strict = true } = options;
  const result = schema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  (result.error as ZodError & { context?: string }).context = context;

  if (__DEV__) {
    console.warn(`[API Validation] ${context} failed`, result.error.issues);
  }

  if (strict) {
    throw result.error;
  }

  return data as z.infer<S>;
}
