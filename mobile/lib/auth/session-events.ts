const listeners = new Set<() => void>();

export function subscribeToAuthInvalidation(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyAuthInvalidation(): void {
  listeners.forEach((listener) => listener());
}
