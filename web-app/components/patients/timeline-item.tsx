'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Stethoscope,
  TestTube2,
  Pill,
  AlertTriangle,
  FileText,
  LogIn,
  LogOut,
  LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatRelativeTime } from '@/lib/utils/format';
import type { TimelineEvent, TimelineEventType } from '@/lib/types/timeline';

interface TimelineItemProps {
  event: TimelineEvent;
  isLast?: boolean;
}

const eventConfig: Record<TimelineEventType, { 
  icon: LucideIcon; 
  color: string; 
  bgColor: string;
  label: string;
}> = {
  encounter: {
    icon: Stethoscope,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    label: 'Visit',
  },
  lab_result: {
    icon: TestTube2,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    label: 'Lab Result',
  },
  prescription: {
    icon: Pill,
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    label: 'Prescription',
  },
  vital_alert: {
    icon: AlertTriangle,
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    label: 'Alert',
  },
  diagnosis: {
    icon: FileText,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    label: 'Diagnosis',
  },
  admission: {
    icon: LogIn,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
    label: 'Admission',
  },
  discharge: {
    icon: LogOut,
    color: 'text-teal-600',
    bgColor: 'bg-teal-100 dark:bg-teal-900/30',
    label: 'Discharge',
  },
};

export function TimelineItem({ event, isLast = false }: TimelineItemProps) {
  const config = eventConfig[event.type];
  const Icon = config.icon;
  const isCritical = event.metadata?.severity === 'critical';
  const isWarning = event.metadata?.severity === 'warning';

  // Determine the link destination based on event type
  const getEventLink = () => {
    switch (event.type) {
      case 'encounter':
        return `/encounters/${event.metadata?.encounterId}`;
      case 'lab_result':
        return `/laboratory/results/${event.id.replace('lab-', '')}`;
      case 'prescription':
        return `/pharmacy/prescriptions/${event.id.replace('rx-', '')}`;
      default:
        return null;
    }
  };

  const link = getEventLink();

  const content = (
    <div
      className={cn(
        'relative flex gap-4 pb-6',
        !isLast && 'before:absolute before:left-[17px] before:top-10 before:h-full before:w-0.5 before:bg-border'
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          config.bgColor,
          isCritical && 'ring-2 ring-destructive ring-offset-2',
          isWarning && 'ring-2 ring-amber-500 ring-offset-2'
        )}
      >
        <Icon className={cn('h-4 w-4', config.color)} />
      </div>

      {/* Content */}
      <div className="flex-1 pt-0.5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-sm">{event.title}</h4>
            <Badge variant="secondary" className="text-xs">
              {config.label}
            </Badge>
            {event.metadata?.encounterType && (
              <Badge 
                variant="outline" 
                className={cn(
                  'text-xs',
                  event.metadata.encounterType === 'EMERGENCY' && 'border-destructive text-destructive'
                )}
              >
                {event.metadata.encounterType}
              </Badge>
            )}
            {isCritical && (
              <Badge variant="destructive" className="text-xs">
                Critical
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <time dateTime={event.timestamp} title={formatDate(event.timestamp)}>
              {formatRelativeTime(event.timestamp)}
            </time>
          </div>
        </div>

        {event.description && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {event.description}
          </p>
        )}

        {/* Metadata display */}
        {event.metadata?.provider && (
          <p className="mt-1 text-xs text-muted-foreground">
            Provider: {event.metadata.provider}
          </p>
        )}

        {event.metadata?.icd10Code && (
          <p className="mt-1 text-xs font-mono text-muted-foreground">
            ICD-10: {event.metadata.icd10Code}
          </p>
        )}

        {event.metadata?.status && (
          <Badge variant="outline" className="mt-2 text-xs">
            {event.metadata.status}
          </Badge>
        )}
      </div>
    </div>
  );

  if (link) {
    return (
      <Link
        href={link}
        className="block transition-colors hover:bg-accent/50 rounded-lg -mx-2 px-2"
      >
        {content}
      </Link>
    );
  }

  return content;
}

export default TimelineItem;
