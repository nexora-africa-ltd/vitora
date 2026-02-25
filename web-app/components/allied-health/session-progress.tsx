/**
 * Allied Health Progress Indicator
 * Shows session progress for therapy orders
 */

import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface SessionProgressProps {
  completed: number;
  total: number;
  showLabel?: boolean;
  className?: string;
}

export function SessionProgress({
  completed,
  total,
  showLabel = true,
  className,
}: SessionProgressProps) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className={cn('space-y-1', className)}>
      {showLabel && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Sessions</span>
          <span className="font-medium">
            {completed}/{total} ({percentage}%)
          </span>
        </div>
      )}
      <Progress value={percentage} className="h-2" />
    </div>
  );
}

interface SessionCountProps {
  completed: number;
  total: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function SessionCount({ completed, total, size = 'md', className }: SessionCountProps) {
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <span className={cn(sizeClasses[size], 'text-muted-foreground', className)}>
      <span className="font-medium text-foreground">{completed}</span>
      <span>/</span>
      <span>{total}</span>
      <span className="ml-1">sessions</span>
    </span>
  );
}
