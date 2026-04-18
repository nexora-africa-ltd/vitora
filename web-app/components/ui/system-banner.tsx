'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

/** Semantic color variants for the banner */
type SemanticColor = "default" | "info" | "success" | "warning" | "destructive";

interface SystemBannerProps {
  /** Short text for fixed variant, or title for inline variant */
  text?: string;
  /** Description text (inline variant only) */
  description?: string | ReactNode;
  /** Icon component (inline variant only) */
  icon?: ReactNode;
  /** Semantic color variant */
  semanticColor?: SemanticColor;
  /** Custom background color - Tailwind class or hex (overrides semanticColor for fixed variant) */
  color?: string;
  /** Size for fixed variant badge */
  size?: "xs" | "sm" | "md" | "lg";
  /** Whether to show the banner */
  show?: boolean;
  /** Variant: fixed (top bar) or inline (alert-style) */
  variant?: "fixed" | "inline";
  /** Allow dismissing with "do not show again" */
  dismissible?: boolean;
  /** localStorage key for persisting dismissal */
  storageKey?: string;
}

const sizeClasses: Record<NonNullable<SystemBannerProps["size"]>, string> = {
  xs: "text-[10px] px-1 py-0.5",
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-3 py-1",
  lg: "text-base px-4 py-1.5"
};

/** Inline variant styles for each semantic color */
const inlineColorClasses: Record<SemanticColor, { container: string; icon: string; title: string }> = {
  default: {
    container: "bg-muted/50 border-border",
    icon: "text-muted-foreground",
    title: "text-foreground",
  },
  info: {
    container: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    icon: "text-blue-600 dark:text-blue-400",
    title: "text-blue-900 dark:text-blue-100",
  },
  success: {
    container: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
    icon: "text-green-600 dark:text-green-400",
    title: "text-green-900 dark:text-green-100",
  },
  warning: {
    container: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
    icon: "text-amber-600 dark:text-amber-400",
    title: "text-amber-900 dark:text-amber-100",
  },
  destructive: {
    container: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
    icon: "text-red-600 dark:text-red-400",
    title: "text-red-900 dark:text-red-100",
  },
};

/** Fixed variant background colors for each semantic color */
const fixedColorClasses: Record<SemanticColor, string> = {
  default: "bg-orange-500",
  info: "bg-blue-500",
  success: "bg-green-500",
  warning: "bg-amber-500",
  destructive: "bg-red-500",
};

export default function SystemBanner({
  text = "Development Mode",
  description,
  icon,
  semanticColor = "default",
  color,
  size = "xs",
  show = true,
  variant = "fixed",
  dismissible = false,
  storageKey,
}: SystemBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);

  // Check localStorage on mount for persisted dismissal
  useEffect(() => {
    if (storageKey && typeof window !== 'undefined') {
      const stored = localStorage.getItem(`banner-dismissed-${storageKey}`);
      if (stored === 'true') {
        setDismissed(true);
      }
    }
  }, [storageKey]);

  // Handle dismiss with persistence
  const handleDismiss = () => {
    setDismissed(true);
    if (doNotShowAgain && storageKey) {
      localStorage.setItem(`banner-dismissed-${storageKey}`, 'true');
    }
  };

  if (!show || dismissed) return null;

  const inlineStyles = inlineColorClasses[semanticColor];

  // Inline variant - alert-style banner
  if (variant === "inline") {
    return (
      <div
        className={`
          rounded-lg border p-3 sm:p-4
          ${inlineStyles.container}
        `}
      >
        <div className="flex gap-3">
          {icon && (
            <div className={`shrink-0 mt-0.5 ${inlineStyles.icon}`}>
              {icon}
            </div>
          )}
          <div className="flex-1 space-y-1.5">
            {text && (
              <p className={`text-sm sm:text-base font-medium leading-none ${inlineStyles.title}`}>
                {text}
              </p>
            )}
            {description && (
              <p className="text-xs sm:text-sm text-muted-foreground">
                {description}
              </p>
            )}
            {dismissible && (
              <div className="flex items-center justify-between pt-2 border-t border-border/50 mt-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={`do-not-show-${storageKey || 'banner'}`}
                    checked={doNotShowAgain}
                    onCheckedChange={(checked) => setDoNotShowAgain(checked === true)}
                  />
                  <Label
                    htmlFor={`do-not-show-${storageKey || 'banner'}`}
                    className="text-xs text-muted-foreground cursor-pointer"
                  >
                    Don&apos;t show again
                  </Label>
                </div>
                <button
                  onClick={handleDismiss}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Fixed variant - top bar with floating badge
  // Use custom color if provided, otherwise use semantic color
  const fixedBgClass = color
    ? (typeof color === "string" && color.startsWith("#") ? "" : color)
    : fixedColorClasses[semanticColor];
  const fixedBgStyle = color && typeof color === "string" && color.startsWith("#")
    ? { backgroundColor: color }
    : undefined;

  return (
    <div
      className={`
        fixed top-0 left-0 w-full h-0.5 z-50 flex justify-center
        ${fixedBgClass}
      `}
      style={fixedBgStyle}
    >
      <span
        className={`
          absolute -bottom-4 text-white font-bold rounded shadow-md max-w-[90vw] truncate
          ${sizeClasses[size]}
          ${fixedBgClass}
        `}
        style={fixedBgStyle}
      >
        {text}
      </span>
    </div>
  );
}
