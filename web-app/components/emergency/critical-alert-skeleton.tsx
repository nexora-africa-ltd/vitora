/**
 * Critical Alert Skeleton Component
 *
 * Skeleton loader for the CriticalAlertBanner during data fetching.
 * Maintains visual consistency while loading critical patient data.
 */
'use client';

import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';

interface CriticalAlertSkeletonProps {
  className?: string;
}

export function CriticalAlertSkeleton({ className }: CriticalAlertSkeletonProps) {
  return (
    <Card className={cn('border-destructive/30', className)}>
      <CardHeader className="border-b border-destructive/10 bg-destructive/5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive/40" />
            <div className="h-5 w-48 animate-pulse rounded bg-destructive/20" />
          </div>
          <div className="h-8 w-16 animate-pulse rounded bg-muted" />
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-md border bg-muted/50 p-3">
            <div className="flex items-center gap-3">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-8 w-16 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
