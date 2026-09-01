'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
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
  /**
   * When provided, the banner gets a "Don't show again" checkbox.
   * Dismissing with the checkbox checked persists the choice in localStorage
   * under `banner-dismissed:{persistKey}` so the banner never shows again.
   */
  persistKey?: string;
}

const variantStyles: Record<
  BannerVariant,
  {
    container: string;
    icon: string;
    title: string;
    description: string;
  }
> = {
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
  persistKey,
}: NotificationBannerProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [persistHidden, setPersistHidden] = useState(false);

  // On mount, check localStorage for permanent dismissal
  useEffect(() => {
    if (persistKey) {
      try {
        const stored = localStorage.getItem(`banner-dismissed:${persistKey}`);
        if (stored === 'true') {
          setPersistHidden(true);
        }
      } catch {
        // localStorage unavailable (SSR, private browsing)
      }
    }
  }, [persistKey]);

  const handleDismiss = useCallback(() => {
    if (persistKey && dontShowAgain) {
      try {
        localStorage.setItem(`banner-dismissed:${persistKey}`, 'true');
      } catch {
        // ignore
      }
      setPersistHidden(true);
    }
    onDismiss?.();
  }, [persistKey, dontShowAgain, onDismiss]);

  if (!show || persistHidden) return null;

  const styles = variantStyles[variant];
  const IconComponent = variantIcons[variant];

  return (
    <div className={cn('rounded-lg border-b', styles.container, className)} role="alert">
      <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-4">
        <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center sm:gap-3">
          {icon || (
            <IconComponent
              className={cn('mt-0.5 h-4 w-4 shrink-0 sm:mt-0 sm:h-5 sm:w-5', styles.icon)}
            />
          )}
          <div className="min-w-0 flex-1">
            <h4 className={cn('text-sm font-medium sm:text-base', styles.title)}>{title}</h4>
            {description && (
              <p className={cn('mt-0.5 text-xs sm:text-sm', styles.description)}>{description}</p>
            )}
          </div>
          {/* Dismiss button - top right on mobile */}
          {onDismiss && (
            <Button
              className="h-6 w-6 shrink-0 sm:hidden"
              size="icon"
              variant="ghost"
              onClick={handleDismiss}
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
          {/* "Don't show again" checkbox */}
          {persistKey && onDismiss && (
            <label className="flex cursor-pointer select-none items-center gap-1.5">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-current accent-current"
              />
              <span className={cn('whitespace-nowrap text-xs', styles.description)}>
                Don&apos;t show again
              </span>
            </label>
          )}
          {action && (
            <Button
              size="sm"
              variant="outline"
              onClick={action.onClick}
              className="h-8 text-xs sm:text-sm"
            >
              {action.label}
            </Button>
          )}
          {/* Dismiss button - right side on desktop */}
          {onDismiss && (
            <Button
              className="hidden h-8 w-8 sm:flex"
              size="icon"
              variant="ghost"
              onClick={handleDismiss}
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
