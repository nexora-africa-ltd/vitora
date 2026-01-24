/**
 * Idempotency utilities for API requests.
 *
 * Sprint 1.7: Data Integrity & Idempotency
 *
 * Provides utilities to generate and manage idempotency keys
 * for API requests. This prevents duplicate resource creation
 * when users accidentally submit forms multiple times or when
 * network retries occur.
 *
 * Usage:
 *   // In a form component
 *   const idempotencyKey = useMemo(
 *     () => getOrCreateIdempotencyKey('patient-registration'),
 *     []
 *   );
 *
 *   const handleSubmit = async (data) => {
 *     try {
 *       await createPatient(data, idempotencyKey);
 *       clearIdempotencyKey('patient-registration');
 *     } catch (error) {
 *       // Key persists for retry
 *     }
 *   };
 */

/**
 * Generate a new UUID v4 idempotency key.
 *
 * Uses crypto.randomUUID() for secure random generation.
 *
 * @returns A new UUID string
 */
export function generateIdempotencyKey(): string {
  // Use native crypto API if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get an existing idempotency key from storage, or create a new one.
 *
 * Keys are stored in sessionStorage to persist across page refreshes
 * within the same browser session, but are cleared when the tab is closed.
 *
 * @param formId - A unique identifier for the form (e.g., 'patient-registration')
 * @returns The idempotency key (existing or newly created)
 */
export function getOrCreateIdempotencyKey(formId: string): string {
  if (typeof window === 'undefined') {
    // Server-side rendering fallback
    return generateIdempotencyKey();
  }

  const storageKey = `idempotency_${formId}`;
  let key = sessionStorage.getItem(storageKey);

  if (!key) {
    key = generateIdempotencyKey();
    sessionStorage.setItem(storageKey, key);
  }

  return key;
}

/**
 * Clear an idempotency key from storage.
 *
 * Call this after a successful form submission to allow
 * the user to submit a new form with a fresh key.
 *
 * @param formId - The form identifier used when creating the key
 */
export function clearIdempotencyKey(formId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const storageKey = `idempotency_${formId}`;
  sessionStorage.removeItem(storageKey);
}

/**
 * React hook for idempotency key management.
 *
 * Returns an idempotency key that persists across re-renders
 * and a function to clear it after successful submission.
 *
 * @param formId - A unique identifier for the form
 * @returns [idempotencyKey, clearKey] tuple
 *
 * @example
 * function PatientForm() {
 *   const [idempotencyKey, clearKey] = useIdempotencyKey('patient-registration');
 *
 *   const handleSubmit = async (data) => {
 *     try {
 *       await createPatient(data, idempotencyKey);
 *       clearKey();
 *       // Success...
 *     } catch (error) {
 *       // Key persists for retry
 *     }
 *   };
 * }
 */
export function useIdempotencyKey(formId: string): [string, () => void] {
  // Use a lazy initializer to only generate/fetch the key once
  const key = getOrCreateIdempotencyKey(formId);

  const clearKey = () => {
    clearIdempotencyKey(formId);
  };

  return [key, clearKey];
}
