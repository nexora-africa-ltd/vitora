/**
 * Basic toast hook implementation
 * This is a simplified version - in production, you'd use a more complete implementation
 * with proper toast management and UI components
 */

type ToastVariant = 'default' | 'destructive';

interface ToastProps {
  title: string;
  description?: string;
  variant?: ToastVariant;
  className?: string;
}

interface Toast extends ToastProps {
  id: string;
}

// Global toast state (simplified)
let toasts: Toast[] = [];
let listeners: Array<(toasts: Toast[]) => void> = [];

function notifyListeners() {
  listeners.forEach((listener) => listener(toasts));
}

export function useToast() {
  const toast = (props: ToastProps) => {
    const id = Math.random().toString(36).substring(7);
    const newToast: Toast = { ...props, id };
    toasts = [...toasts, newToast];
    notifyListeners();

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
      notifyListeners();
    }, 5000);
  };

  return { toast };
}

// For future toast rendering component
export function useToasts() {
  const [currentToasts, setCurrentToasts] = React.useState<Toast[]>(toasts);

  React.useEffect(() => {
    listeners.push(setCurrentToasts);
    return () => {
      listeners = listeners.filter((listener) => listener !== setCurrentToasts);
    };
  }, []);

  return currentToasts;
}

// React import for useEffect/useState (will be available in Next.js context)
import React from 'react';
