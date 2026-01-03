/**
 * TriageCategoryBadge Component
 *
 * Displays color-coded KETA (Kenya Emergency Triage Assessment) category badges
 * for quick visual identification of patient priority levels.
 *
 * Sprint 1.5-1.6 Track E: Triage MVP
 *
 * @see features/triage/triage-category-badge.feature for BDD scenarios
 */
'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  CheckCircle,
  Info,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Skeleton } from '@/components/ui/skeleton';
import type { TriageCategory } from '@/lib/types/triage';
import { TRIAGE_CATEGORY_CONFIG } from '@/lib/types/triage';

// =============================================================================
// ICON MAPPING
// =============================================================================

const CATEGORY_ICONS: Record<TriageCategory, LucideIcon> = {
  RED: AlertCircle,
  ORANGE: AlertTriangle,
  YELLOW: Clock,
  GREEN: CheckCircle,
  BLUE: Info,
};

const ICON_TEST_IDS: Record<TriageCategory, string> = {
  RED: 'triage-icon-alert-circle',
  ORANGE: 'triage-icon-alert-triangle',
  YELLOW: 'triage-icon-clock',
  GREEN: 'triage-icon-check-circle',
  BLUE: 'triage-icon-info',
};

// =============================================================================
// BADGE VARIANTS
// =============================================================================

const triageBadgeVariants = cva(
  'inline-flex items-center justify-center gap-1 rounded-full font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      category: {
        RED: 'bg-red-600 text-white dark:bg-red-500',
        ORANGE: 'bg-orange-500 text-white dark:bg-orange-400',
        YELLOW: 'bg-yellow-500 text-black dark:bg-yellow-400',
        GREEN: 'bg-green-500 text-white dark:bg-green-400',
        BLUE: 'bg-blue-500 text-white dark:bg-blue-400',
        UNKNOWN: 'bg-gray-400 text-white',
        NOT_TRIAGED: 'bg-gray-300 text-gray-600',
      },
      size: {
        sm: 'h-5 px-2 text-xs',
        default: 'h-6 px-2.5 text-sm',
        lg: 'h-8 px-3 text-base',
        xl: 'h-10 px-4 text-lg',
      },
    },
    defaultVariants: {
      category: 'RED',
      size: 'default',
    },
  }
);

// =============================================================================
// TYPES
// =============================================================================

type BadgeCategory = TriageCategory | 'UNKNOWN' | 'NOT_TRIAGED';

export interface TriageCategoryBadgeProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick'>,
    Omit<VariantProps<typeof triageBadgeVariants>, 'category'> {
  /** KETA triage category */
  category?: TriageCategory | null;
  /** Show category icon */
  showIcon?: boolean;
  /** Enable pulse animation (typically for RED/critical) */
  animate?: boolean;
  /** Show loading skeleton */
  loading?: boolean;
  /** Click handler - makes badge interactive */
  onClick?: () => void;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Validate if a category is a valid TriageCategory
 */
function isValidCategory(category: unknown): category is TriageCategory {
  return (
    typeof category === 'string' &&
    ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE'].includes(category)
  );
}

/**
 * Get badge configuration for a category
 */
function getBadgeConfig(category: TriageCategory | null | undefined): {
  badgeCategory: BadgeCategory;
  label: string;
  fullLabel: string;
} {
  if (category === null || category === undefined) {
    return {
      badgeCategory: 'NOT_TRIAGED',
      label: 'Not Triaged',
      fullLabel: 'Not Triaged',
    };
  }

  if (!isValidCategory(category)) {
    return {
      badgeCategory: 'UNKNOWN',
      label: 'UNKNOWN',
      fullLabel: 'Unknown Category',
    };
  }

  const config = TRIAGE_CATEGORY_CONFIG[category];
  return {
    badgeCategory: category,
    label: category,
    fullLabel: config.label,
  };
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * TriageCategoryBadge - Displays KETA triage category with visual indicators
 *
 * Features:
 * - Color-coded badges per KETA standards (RED, ORANGE, YELLOW, GREEN, BLUE)
 * - Multiple sizes (sm, default, lg, xl)
 * - Optional severity icons
 * - Pulse animation for critical (RED) patients
 * - Loading skeleton state
 * - Graceful handling of invalid/missing categories
 * - Screen reader accessible
 * - Dark mode support
 *
 * @example
 * ```tsx
 * // Basic usage
 * <TriageCategoryBadge category="RED" />
 *
 * // With icon and animation
 * <TriageCategoryBadge category="RED" showIcon animate />
 *
 * // Different sizes
 * <TriageCategoryBadge category="ORANGE" size="lg" />
 *
 * // Clickable
 * <TriageCategoryBadge category="YELLOW" onClick={() => navigate('/triage/123')} />
 * ```
 */
export function TriageCategoryBadge({
  category,
  size = 'default',
  showIcon = false,
  animate = false,
  loading = false,
  onClick,
  className,
  ...props
}: TriageCategoryBadgeProps) {
  // Handle loading state
  if (loading) {
    return (
      <Skeleton
        data-testid="triage-badge-skeleton"
        className={cn(
          'rounded-full',
          size === 'sm' && 'h-5 w-16',
          size === 'default' && 'h-6 w-20',
          size === 'lg' && 'h-8 w-24',
          size === 'xl' && 'h-10 w-28'
        )}
      />
    );
  }

  const { badgeCategory, label, fullLabel } = getBadgeConfig(category);

  // Get icon for valid categories
  const IconComponent = isValidCategory(category) ? CATEGORY_ICONS[category] : null;
  const iconTestId = isValidCategory(category) ? ICON_TEST_IDS[category] : null;

  // Icon sizes based on badge size
  const iconSizes: Record<string, number> = {
    sm: 12,
    default: 14,
    lg: 16,
    xl: 18,
  };
  const iconSize = iconSizes[size || 'default'];

  return (
    <div
      role="status"
      aria-label={`Triage Category: ${fullLabel}`}
      title={fullLabel}
      onClick={onClick}
      className={cn(
        triageBadgeVariants({ category: badgeCategory, size }),
        onClick && 'cursor-pointer hover:opacity-90',
        animate && badgeCategory === 'RED' && 'animate-pulse',
        className
      )}
      {...props}
    >
      {showIcon && IconComponent && (
        <IconComponent data-testid={iconTestId} size={iconSize} className="shrink-0" />
      )}
      <span>{label}</span>
    </div>
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export { triageBadgeVariants };
export type { BadgeCategory };
