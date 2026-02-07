/**
 * Imaging modality badge component.
 * Displays modality type with icon.
 */
'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { ImagingModality, MODALITY_LABELS } from '@/lib/types/imaging';
import {
  Radio,
  Waves,
  Scan,
  Image,
  Activity,
  CircleDot,
  Cog,
  HelpCircle,
} from 'lucide-react';

interface ModalityBadgeProps {
  modality: ImagingModality;
  className?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

const MODALITY_CONFIG: Record<
  ImagingModality,
  {
    className: string;
    icon: React.ElementType;
  }
> = {
  XR: {
    className:
      'border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300',
    icon: Radio,
  },
  US: {
    className:
      'border-cyan-200 text-cyan-700 bg-cyan-50 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300',
    icon: Waves,
  },
  CT: {
    className:
      'border-purple-200 text-purple-700 bg-purple-50 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300',
    icon: Scan,
  },
  MRI: {
    className:
      'border-indigo-200 text-indigo-700 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300',
    icon: Image,
  },
  NM: {
    className:
      'border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
    icon: Activity,
  },
  MG: {
    className:
      'border-pink-200 text-pink-700 bg-pink-50 dark:border-pink-500/30 dark:bg-pink-500/10 dark:text-pink-300',
    icon: CircleDot,
  },
  FL: {
    className:
      'border-teal-200 text-teal-700 bg-teal-50 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300',
    icon: Cog,
  },
  OTHER: {
    className: 'border-border text-muted-foreground bg-muted/30',
    icon: HelpCircle,
  },
};

export function ModalityBadge({
  modality,
  className,
  showIcon = true,
  size = 'md',
}: ModalityBadgeProps) {
  const config = MODALITY_CONFIG[modality];
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 font-medium',
        config.className,
        size === 'sm' && 'text-xs px-1.5 py-0',
        className
      )}
    >
      {showIcon && <Icon className={cn('h-3 w-3', size === 'sm' && 'h-2.5 w-2.5')} />}
      {size === 'sm' ? modality : MODALITY_LABELS[modality]}
    </Badge>
  );
}

export default ModalityBadge;
