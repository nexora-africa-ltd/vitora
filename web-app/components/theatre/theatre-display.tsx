'use client';

import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Priority, TheatreType } from '@/lib/types/theatre';

const CASE_STATUS_STYLES: Record<string, string> = {
  REQUESTED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  PRE_OP: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  IN_THEATRE: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  IN_SURGERY: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  IN_PACU: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  DISCHARGED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  POSTPONED: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  CANCELLED: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

const PRIORITY_STYLES: Record<Priority, string> = {
  ELECTIVE: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  URGENT: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  EMERGENCY: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

export const THEATRE_TYPE_LABELS: Record<TheatreType, string> = {
  GENERAL: 'General Surgery',
  ORTHO: 'Orthopedic',
  CARDIAC: 'Cardiac Surgery',
  NEURO: 'Neurosurgery',
  EYE: 'Ophthalmology',
  ENT: 'ENT Surgery',
  OBSTETRIC: 'Obstetric/Gynecology',
  PEDIATRIC: 'Pediatric Surgery',
  EMERGENCY: 'Emergency/Trauma',
  MINOR: 'Minor Procedures',
};

export function TheatreCaseStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge className={cn(CASE_STATUS_STYLES[status] || '', 'text-xs shrink-0 w-fit', className)}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

export function TheatreCasePriorityBadge({
  priority,
  hideElective = false,
  className,
}: {
  priority: Priority;
  hideElective?: boolean;
  className?: string;
}) {
  if (priority === 'ELECTIVE' && hideElective) {
    return null;
  }

  if (priority === 'ELECTIVE') {
    return <span className={cn('text-xs text-muted-foreground', className)}>Elective</span>;
  }

  return (
    <Badge className={cn(PRIORITY_STYLES[priority], 'text-xs shrink-0 w-fit', className)}>
      {priority === 'EMERGENCY' && <AlertTriangle className="mr-1 h-3 w-3" />}
      {priority}
    </Badge>
  );
}

export function TheatreSchedulingReadinessBadge({ ready }: { ready: boolean }) {
  return (
    <Badge className={ready ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300'}>
      {ready ? 'Ready' : 'Pending'}
    </Badge>
  );
}

export function TheatreOperationalStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? 'default' : 'outline'} className={isActive ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' : ''}>
      {isActive ? 'Active' : 'Inactive'}
    </Badge>
  );
}

export function TheatreMetricCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
      <CardContent className="relative p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

export function formatTheatreHours(start: string, end: string) {
  return `${start.slice(0, 5)} - ${end.slice(0, 5)}`;
}
