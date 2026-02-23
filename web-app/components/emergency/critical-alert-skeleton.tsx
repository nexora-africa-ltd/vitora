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
      <CardHeader className="pb-3 bg-destructive/5 border-b border-destructive/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive/40" />
            <div className="h-5 w-48 bg-destructive/20 animate-pulse rounded" />
          </div>
          <div className="h-8 w-16 bg-muted animate-pulse rounded" />
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-md bg-muted/50 border">
            <div className="flex items-center gap-3">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              <div className="h-4 w-20 bg-muted animate-pulse rounded" />
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            </div>
            <div className="h-8 w-16 bg-muted animate-pulse rounded" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
