'use client';

import { ReactNode } from 'react';
import { AlertCircle, Info, AlertTriangle, CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type BannerVariant = 'info' | 'warning' | 'error' | 'success';

interface NotificationBannerProps {
  /** Whether the banner is visible */
  show?: boolean;
  /** Callback when the banner is dismissed */
  onDismiss?: () => void;
  /** Title of the notification */
  title: string;
  /** Description/body text */
  description?: string;
  /** Visual variant */
  variant?: BannerVariant;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Custom icon (overrides variant icon) */
  icon?: ReactNode;
  /** Additional class names */
  className?: string;
}

const variantStyles: Record<BannerVariant, {
  container: string;
  icon: string;
  title: string;
  description: string;
}> = {
  info: {
    container: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950',
    icon: 'text-blue-600 dark:text-blue-400',
    title: 'text-blue-900 dark:text-blue-100',
    description: 'text-blue-700 dark:text-blue-300',
  },
  warning: {
    container: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950',
    icon: 'text-amber-600 dark:text-amber-400',
    title: 'text-amber-900 dark:text-amber-100',
    description: 'text-amber-700 dark:text-amber-300',
  },
  error: {
    container: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950',
    icon: 'text-red-600 dark:text-red-400',
    title: 'text-red-900 dark:text-red-100',
    description: 'text-red-700 dark:text-red-300',
  },
  success: {
    container: 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950',
    icon: 'text-green-600 dark:text-green-400',
    title: 'text-green-900 dark:text-green-100',
    description: 'text-green-700 dark:text-green-300',
  },
};

const variantIcons: Record<BannerVariant, typeof AlertCircle> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: CheckCircle,
};

/**
 * NotificationBanner - A dismissable notification banner component
 *
 * Used for important announcements, system updates, or contextual information.
 * Supports different variants (info, warning, error, success) with optional actions.
 */
export function NotificationBanner({
  show = true,
  onDismiss,
  title,
  description,
  variant = 'info',
  action,
  icon,
  className,
}: NotificationBannerProps) {
  if (!show) return null;

  const styles = variantStyles[variant];
  const IconComponent = variantIcons[variant];

  return (
    <div
      className={cn(
        'border-b rounded-lg',
        styles.container,
        className
      )}
      role="alert"
    >
      <div className="flex items-center justify-between p-4 gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {icon || <IconComponent className={cn('h-5 w-5 shrink-0', styles.icon)} />}
          <div className="min-w-0">
            <h4 className={cn('font-medium', styles.title)}>
              {title}
            </h4>
            {description && (
              <p className={cn('text-sm', styles.description)}>
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action && (
            <Button size="sm" variant="outline" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {onDismiss && (
            <Button
              className="h-8 w-8"
              size="icon"
              variant="ghost"
              onClick={onDismiss}
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default NotificationBanner;
