import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  label?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
};

export function LoadingSpinner({ size = 'md', className, label }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <Loader2
        className={cn('animate-spin text-primary', sizeClasses[size], className)}
        aria-hidden="true"
      />
      {label && (
        <span className="text-sm text-muted-foreground animate-pulse">{label}</span>
      )}
      <span className="sr-only">{label || 'Loading...'}</span>
    </div>
  );
}

/**
 * Full page loading overlay with optional message
 */
interface PageLoadingProps {
  message?: string;
  fullScreen?: boolean;
}

export function PageLoading({ message = 'Loading...', fullScreen = true }: PageLoadingProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm',
        fullScreen ? 'fixed inset-0 z-50' : 'min-h-[400px] w-full'
      )}
      role="status"
      aria-live="polite"
    >
      <div className="relative">
        {/* Outer ring */}
        <div className="h-16 w-16 rounded-full border-4 border-muted" />
        {/* Spinning ring */}
        <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-transparent border-t-primary animate-spin" />
        {/* Inner pulse */}
        <div className="absolute inset-3 h-10 w-10 rounded-full bg-primary/20 animate-pulse" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
    </div>
  );
}

/**
 * Skeleton loading placeholder for content
 */
interface ContentLoadingProps {
  rows?: number;
  className?: string;
}

export function ContentLoading({ rows = 3, className }: ContentLoadingProps) {
  return (
    <div className={cn('space-y-3 animate-pulse', className)} role="status" aria-label="Loading content">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-1/2" />
        </div>
      ))}
      <span className="sr-only">Loading content...</span>
    </div>
  );
}

/**
 * Card skeleton for loading states
 */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-card p-6 animate-pulse', className)} role="status">
      <div className="space-y-4">
        <div className="h-5 bg-muted rounded w-1/3" />
        <div className="space-y-2">
          <div className="h-4 bg-muted rounded w-full" />
          <div className="h-4 bg-muted rounded w-2/3" />
        </div>
        <div className="h-10 bg-muted rounded w-1/4" />
      </div>
      <span className="sr-only">Loading card...</span>
    </div>
  );
}

/**
 * Table row skeleton for loading states
 */
export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="animate-pulse" role="status">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="p-4">
          <div className="h-4 bg-muted rounded w-full" />
        </td>
      ))}
    </tr>
  );
}
