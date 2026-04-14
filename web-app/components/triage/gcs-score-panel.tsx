/**
 * GCSScorePanel Component
 *
 * Glasgow Coma Scale (GCS) assessment panel with three sub-scores:
 * - Eye Response (1-4)
 * - Verbal Response (1-5)
 * - Motor Response (1-6)
 *
 * Total score ranges from 3-15:
 * - 13-15: Mild injury
 * - 9-12: Moderate injury
 * - 3-8: Severe injury (likely needs intubation)
 *
 * Sprint 1.5-1.6 Track E: Triage MVP - Neurological Assessment
 */
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { HelpPopover } from '@/components/shared/help-popover';
import { AlertTriangle, Brain, Eye, MessageSquare, Hand } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export interface GCSScores {
  eye: number | null;
  verbal: number | null;
  motor: number | null;
}

export interface GCSScorePanelProps {
  /** Current GCS values */
  value: GCSScores;
  /** Callback when values change */
  onChange: (value: GCSScores) => void;
  /** Whether the panel is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
  /** Whether to show the panel expanded or collapsed initially */
  defaultExpanded?: boolean;
}

// =============================================================================
// GCS Configuration
// =============================================================================

interface GCSOption {
  value: number;
  label: string;
  description: string;
}

interface GCSComponentConfig {
  key: keyof GCSScores;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  options: GCSOption[];
  maxScore: number;
}

const GCS_CONFIG: GCSComponentConfig[] = [
  {
    key: 'eye',
    label: 'Eye Response',
    icon: Eye,
    maxScore: 4,
    options: [
      { value: 4, label: 'Spontaneous', description: 'Opens eyes spontaneously' },
      { value: 3, label: 'To Voice', description: 'Opens eyes to verbal command' },
      { value: 2, label: 'To Pain', description: 'Opens eyes only to painful stimulus' },
      { value: 1, label: 'None', description: 'No eye opening' },
    ],
  },
  {
    key: 'verbal',
    label: 'Verbal Response',
    icon: MessageSquare,
    maxScore: 5,
    options: [
      { value: 5, label: 'Oriented', description: 'Oriented, answers appropriately' },
      { value: 4, label: 'Confused', description: 'Confused conversation' },
      { value: 3, label: 'Words', description: 'Inappropriate words' },
      { value: 2, label: 'Sounds', description: 'Incomprehensible sounds' },
      { value: 1, label: 'None', description: 'No verbal response' },
    ],
  },
  {
    key: 'motor',
    label: 'Motor Response',
    icon: Hand,
    maxScore: 6,
    options: [
      { value: 6, label: 'Obeys Commands', description: 'Follows simple commands' },
      { value: 5, label: 'Localizes Pain', description: 'Localizes to painful stimulus' },
      { value: 4, label: 'Withdraws', description: 'Normal flexion/withdrawal' },
      { value: 3, label: 'Abnormal Flexion', description: 'Decorticate posturing' },
      { value: 2, label: 'Extension', description: 'Decerebrate posturing' },
      { value: 1, label: 'None', description: 'No motor response' },
    ],
  },
];

// =============================================================================
// Helper Functions
// =============================================================================

function calculateTotal(scores: GCSScores): number | null {
  if (scores.eye && scores.verbal && scores.motor) {
    return scores.eye + scores.verbal + scores.motor;
  }
  return null;
}

function getSeverity(total: number | null): { label: string; description: string; color: string; bgColor: string } {
  if (total === null) {
    return {
      label: 'Incomplete',
      description: 'Complete all three components to calculate total',
      color: 'text-muted-foreground',
      bgColor: 'bg-muted'
    };
  }
  if (total <= 8) {
    return {
      label: 'Severe Brain Injury',
      description: 'GCS 3-8: Coma - May require intubation',
      color: 'text-red-700 dark:text-red-300',
      bgColor: 'bg-red-100 dark:bg-red-950'
    };
  }
  if (total <= 12) {
    return {
      label: 'Moderate Brain Injury',
      description: 'GCS 9-12: Close neurological monitoring required',
      color: 'text-orange-700 dark:text-orange-300',
      bgColor: 'bg-orange-100 dark:bg-orange-950'
    };
  }
  return {
    label: 'Mild Brain Injury',
    description: 'GCS 13-15: Normal or mild impairment',
    color: 'text-green-700 dark:text-green-300',
    bgColor: 'bg-green-100 dark:bg-green-950'
  };
}

// =============================================================================
// Sub-components
// =============================================================================

interface GCSComponentSelectorProps {
  config: GCSComponentConfig;
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function GCSComponentSelector({ config, value, onChange, disabled }: GCSComponentSelectorProps) {
  const Icon = config.icon;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium">{config.label}</Label>
        <Badge variant="outline" className="ml-auto text-xs">
          {value ?? '-'}/{config.maxScore}
        </Badge>
      </div>
      <RadioGroup
        value={value?.toString() ?? ''}
        onValueChange={(v) => onChange(parseInt(v, 10))}
        disabled={disabled}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
      >
        {config.options.map((option) => {
          const isSelected = value === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer flex-col rounded-lg border p-3 text-center transition-all',
                disabled && 'cursor-not-allowed opacity-50',
                isSelected
                  ? 'border-primary bg-primary/10 ring-2 ring-primary'
                  : 'border-border hover:bg-muted/50'
              )}
            >
              <RadioGroupItem
                value={option.value.toString()}
                className="sr-only"
              />
              <span className="text-lg font-bold">{option.value}</span>
              <span className="text-xs font-medium">{option.label}</span>
              <span className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
                {option.description}
              </span>
            </label>
          );
        })}
      </RadioGroup>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function GCSScorePanel({
  value,
  onChange,
  disabled = false,
  className,
}: GCSScorePanelProps) {
  const total = calculateTotal(value);
  const severity = getSeverity(total);

  const handleComponentChange = (key: keyof GCSScores, score: number) => {
    onChange({ ...value, [key]: score });
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            <CardTitle className="text-base">Glasgow Coma Scale</CardTitle>
            <HelpPopover content="GCS measures level of consciousness. Total score 3-15. ≤8 indicates severe brain injury requiring immediate intervention." />
          </div>
          <div className="flex items-center gap-2">
            {/* Total Score Badge */}
            <div className={cn('rounded-lg px-3 py-1.5 text-center', severity.bgColor)}>
              <div className="text-2xl font-bold tabular-nums">
                {total ?? '-'}
              </div>
              <div className={cn('text-[10px] font-medium uppercase tracking-wide', severity.color)}>
                {severity.label}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Alert for severe GCS */}
        {total !== null && total <= 8 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Severe brain injury (GCS ≤8).</strong> Patient may require intubation.
              Immediate neurosurgical assessment recommended.
            </AlertDescription>
          </Alert>
        )}

        {/* Alert for moderate GCS */}
        {total !== null && total >= 9 && total <= 12 && (
          <Alert className="border-orange-500 bg-orange-50 text-orange-900 dark:bg-orange-950 dark:text-orange-100">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertDescription>
              <strong>Moderate brain injury (GCS 9-12).</strong> Close neurological monitoring required.
              Consider CT head scan.
            </AlertDescription>
          </Alert>
        )}

        {/* GCS Component Selectors */}
        {GCS_CONFIG.map((config) => (
          <GCSComponentSelector
            key={config.key}
            config={config}
            value={value[config.key]}
            onChange={(score) => handleComponentChange(config.key, score)}
            disabled={disabled}
          />
        ))}

        {/* Score Summary */}
        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
          <div className="text-sm text-muted-foreground">
            E{value.eye ?? '-'} + V{value.verbal ?? '-'} + M{value.motor ?? '-'}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Total:</span>
            <span className={cn('text-lg font-bold', severity.color)}>
              {total ?? 'Incomplete'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
