/**
 * Auto-Save Status Indicator Component
 * Shows the current status of auto-save with visual feedback
 * Sprint 1.5-1.6: Enhanced encounter form auto-save
 */

'use client';

import { Cloud, CloudOff, Check, Loader2, AlertCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/cn';
import type { AutoSaveStatus } from '@/lib/hooks/use-auto-save';

interface AutoSaveStatusIndicatorProps {
  status: AutoSaveStatus;
  lastSaved: Date | null;
  error: string | null;
  isDirty: boolean;
  pendingCount?: number;
  className?: string;
}

const STATUS_CONFIG: Record<AutoSaveStatus, {
  icon: React.ElementType;
  label: string;
  color: string;
  animate?: boolean;
}> = {
  idle: {
    icon: Cloud,
    label: 'All changes saved',
    color: 'text-muted-foreground',
  },
  pending: {
    icon: Clock,
    label: 'Changes pending...',
    color: 'text-yellow-600 dark:text-yellow-400',
  },
  saving: {
    icon: Loader2,
    label: 'Saving...',
    color: 'text-blue-600 dark:text-blue-400',
    animate: true,
  },
  saved: {
    icon: Check,
    label: 'Saved',
    color: 'text-green-600 dark:text-green-400',
  },
  error: {
    icon: AlertCircle,
    label: 'Save failed',
    color: 'text-destructive',
  },
  offline: {
    icon: CloudOff,
    label: 'Offline - changes queued',
    color: 'text-orange-600 dark:text-orange-400',
  },
};

function formatLastSaved(date: Date | null): string {
  if (!date) return 'Never';
  
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleString();
}

export function AutoSaveStatusIndicator({
  status,
  lastSaved,
  error,
  isDirty,
  pendingCount = 0,
  className,
}: AutoSaveStatusIndicatorProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex items-center gap-1.5 text-sm transition-colors',
              config.color,
              className
            )}
          >
            <Icon
              className={cn(
                'h-4 w-4',
                config.animate && 'animate-spin'
              )}
            />
            <span className="hidden sm:inline">
              {status === 'saved' ? 'Saved' : 
               status === 'saving' ? 'Saving...' :
               status === 'offline' ? 'Offline' :
               status === 'error' ? 'Error' :
               isDirty ? 'Unsaved' : 'Saved'}
            </span>
            {status === 'offline' && pendingCount > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {pendingCount}
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">{config.label}</p>
            {lastSaved && (
              <p className="text-xs text-muted-foreground">
                Last saved: {formatLastSaved(lastSaved)}
              </p>
            )}
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
            {status === 'offline' && pendingCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {pendingCount} change(s) will sync when online
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default AutoSaveStatusIndicator;
