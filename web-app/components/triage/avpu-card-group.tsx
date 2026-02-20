/**
 * AVPUCardGroup Component
 *
 * Enhanced AVPU (Alert, Voice, Pain, Unresponsive) mental status selector
 * with color-coded cards that clearly indicate severity levels.
 *
 * P (Pain) and U (Unresponsive) are highlighted as critical/warning states.
 *
 * Sprint 1.5-1.6 Track E: Triage MVP
 */
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, AlertTriangle, Eye, Ear, Hand, BrainCog } from 'lucide-react';
import type { AVPUStatus } from '@/lib/types/triage';

// =============================================================================
// Types
// =============================================================================

export interface AVPUCardGroupProps {
  /** Current AVPU value */
  value: AVPUStatus | undefined;
  /** Callback when value changes */
  onChange: (value: AVPUStatus) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
  /** Show inline critical alert when P or U selected */
  showInlineAlert?: boolean;
}

// =============================================================================
// AVPU Configuration with enhanced visuals
// =============================================================================

interface AVPUConfig {
  code: AVPUStatus;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  severity: 'normal' | 'warning' | 'critical';
  colors: {
    base: string;
    selected: string;
    border: string;
    icon: string;
    text: string;
  };
}

const AVPU_CARD_CONFIG: AVPUConfig[] = [
  {
    code: 'A',
    label: 'Alert',
    description: 'Fully awake and responsive',
    icon: Eye,
    severity: 'normal',
    colors: {
      base: 'bg-white dark:bg-gray-950 hover:bg-green-50 dark:hover:bg-green-950/30',
      selected: 'bg-green-50 dark:bg-green-950/50 ring-2 ring-green-500',
      border: 'border-gray-200 dark:border-gray-800',
      icon: 'text-green-600 dark:text-green-400',
      text: 'text-green-700 dark:text-green-300',
    },
  },
  {
    code: 'V',
    label: 'Voice',
    description: 'Responds to verbal stimulus',
    icon: Ear,
    severity: 'warning',
    colors: {
      base: 'bg-white dark:bg-gray-950 hover:bg-yellow-50 dark:hover:bg-yellow-950/30',
      selected: 'bg-yellow-50 dark:bg-yellow-950/50 ring-2 ring-yellow-500',
      border: 'border-gray-200 dark:border-gray-800',
      icon: 'text-yellow-600 dark:text-yellow-400',
      text: 'text-yellow-700 dark:text-yellow-300',
    },
  },
  {
    code: 'P',
    label: 'Pain',
    description: 'Responds only to pain',
    icon: Hand,
    severity: 'warning',
    colors: {
      base: 'bg-orange-50/50 dark:bg-orange-950/20 hover:bg-orange-100 dark:hover:bg-orange-950/40',
      selected: 'bg-orange-100 dark:bg-orange-950/60 ring-2 ring-orange-500',
      border: 'border-orange-200 dark:border-orange-800',
      icon: 'text-orange-600 dark:text-orange-400',
      text: 'text-orange-700 dark:text-orange-300',
    },
  },
  {
    code: 'U',
    label: 'Unresponsive',
    description: 'No response to stimuli',
    icon: BrainCog,
    severity: 'critical',
    colors: {
      base: 'bg-red-50/50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40',
      selected: 'bg-red-100 dark:bg-red-950/60 ring-2 ring-red-500',
      border: 'border-red-200 dark:border-red-700',
      icon: 'text-red-600 dark:text-red-400',
      text: 'text-red-700 dark:text-red-300',
    },
  },
];

// =============================================================================
// Component
// =============================================================================

/**
 * AVPUCardGroup - Visual mental status selector
 *
 * Features:
 * - Large card-style selection for easy tapping
 * - Color-coded severity (green=Alert, yellow=Voice, orange=Pain, red=Unresponsive)
 * - Icons for each status level
 * - Inline critical alert when P or U is selected
 * - Accessible with ARIA labels
 *
 * @example
 * ```tsx
 * <AVPUCardGroup
 *   value={mentalStatus}
 *   onChange={(status) => setMentalStatus(status)}
 *   showInlineAlert
 * />
 * ```
 */
export function AVPUCardGroup({
  value,
  onChange,
  disabled = false,
  className,
  showInlineAlert = true,
}: AVPUCardGroupProps) {
  return (
    <div className={cn('space-y-3', className)} data-testid="avpu-card-group">
      {/* Header */}
      <Label className="text-sm font-medium flex items-center gap-2">
        <BrainCog className="h-4 w-4 text-muted-foreground" />
        Mental Status (AVPU) <span className="text-destructive">*</span>
      </Label>

      {/* Card Grid */}
      <RadioGroup
        value={value ?? ''}
        onValueChange={(val) => onChange(val as AVPUStatus)}
        disabled={disabled}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        aria-label="Mental status AVPU scale"
      >
        {AVPU_CARD_CONFIG.map((config) => {
          const Icon = config.icon;
          const isSelected = value === config.code;

          return (
            <div key={config.code}>
              <RadioGroupItem
                value={config.code}
                id={`avpu-${config.code}`}
                className="peer sr-only"
              />
              <Label
                htmlFor={`avpu-${config.code}`}
                className={cn(
                  'flex flex-col items-center justify-center rounded-xl border-2 p-4 cursor-pointer transition-all duration-200',
                  'hover:scale-[1.02] active:scale-[0.98]',
                  config.colors.base,
                  config.colors.border,
                  isSelected && config.colors.selected,
                  disabled && 'opacity-50 cursor-not-allowed hover:scale-100'
                )}
              >
                {/* Icon */}
                <Icon
                  className={cn(
                    'h-8 w-8 mb-2 transition-colors',
                    isSelected ? config.colors.icon : 'text-muted-foreground'
                  )}
                />

                {/* Code Badge */}
                <span
                  className={cn(
                    'text-2xl font-bold mb-1 transition-colors',
                    isSelected ? config.colors.text : 'text-foreground'
                  )}
                >
                  {config.code}
                </span>

                {/* Label */}
                <span
                  className={cn(
                    'text-sm font-medium transition-colors',
                    isSelected ? config.colors.text : 'text-muted-foreground'
                  )}
                >
                  {config.label}
                </span>

                {/* Description (visible on larger screens) */}
                <span className="text-xs text-muted-foreground text-center mt-1 hidden sm:block">
                  {config.description}
                </span>

                {/* Critical indicator for P and U */}
                {(config.code === 'P' || config.code === 'U') && (
                  <div className="mt-2">
                    {config.code === 'U' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
                        <AlertCircle className="h-3 w-3" />
                        CRITICAL
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 dark:text-orange-400">
                        <AlertTriangle className="h-3 w-3" />
                        URGENT
                      </span>
                    )}
                  </div>
                )}
              </Label>
            </div>
          );
        })}
      </RadioGroup>

      {/* Inline Critical Alerts */}
      {showInlineAlert && value === 'U' && (
        <Alert variant="destructive" className="bg-red-50 dark:bg-red-950/50 border-red-300 dark:border-red-800">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="font-medium">
            CRITICAL: Unresponsive patient — Immediate intervention required. This triggers RED triage category.
          </AlertDescription>
        </Alert>
      )}

      {showInlineAlert && value === 'P' && (
        <Alert className="bg-orange-50 dark:bg-orange-950/50 border-orange-300 dark:border-orange-700">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800 dark:text-orange-200 font-medium">
            Responds only to pain — Urgent assessment required. High risk of deterioration.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default AVPUCardGroup;
