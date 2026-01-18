import { useToast, toast } from '@/lib/hooks/use-toast';
import { ApiError } from '@/lib/api/client';

export function useToastNotification() {
  // Note: useToast is used for subscription to toast state
  useToast();

  return {
    success: (title: string, description?: string) => {
      toast({
        title,
        description,
        variant: 'default',
      });
    },

    error: (error: ApiError | Error | string, title = 'Error') => {
      const message = typeof error === 'string'
        ? error
        : 'message' in error
          ? error.message
          : 'An error occurred';

      toast({
        title,
        description: message,
        variant: 'destructive',
      });
    },

    warning: (title: string, description?: string) => {
      toast({
        title,
        description,
        variant: 'default',
        className: 'bg-amber-50 border-amber-200 text-amber-900',
      });
    },

    info: (title: string, description?: string) => {
      toast({
        title,
        description,
        variant: 'default',
      });
    },
  };
}
