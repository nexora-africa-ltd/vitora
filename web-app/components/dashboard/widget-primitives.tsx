import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VitoraLogo } from '@/components/ui/vitora-logo';
import { cn } from '@/lib/utils/cn';

interface DashboardListSkeletonProps {
  rows?: number;
  showMeta?: boolean;
  className?: string;
}

interface DashboardEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
}

interface DashboardFooterLinkProps {
  href: string;
  label: string;
}

export function DashboardListSkeleton({
  rows = 3,
  showMeta = true,
  className,
}: DashboardListSkeletonProps) {
  return (
    <div className={cn('space-y-3', className)} aria-live="polite" aria-label="Loading widget content">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={`widget-skeleton-${index}`}
          className="rounded-xl border border-border/60 bg-muted/20 p-3"
        >
          <div className="flex items-start gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-32 max-w-[65%]" />
              <Skeleton className="h-3 w-full max-w-[85%]" />
              {showMeta && <Skeleton className="h-3 w-24 max-w-[40%]" />}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardEmptyState({
  icon: Icon,
  title,
  description,
  className,
}: DashboardEmptyStateProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center',
        className
      )}
      role="status"
      aria-live="polite"
    >
      {/* Watermark logo */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <VitoraLogo
          variant="icon"
          tone="teal"
          alt=""
          className="w-24 sm:w-28 opacity-[0.045] dark:opacity-[0.06]"
          imageClassName="pointer-events-none select-none"
        />
      </div>
      {/* Foreground content */}
      <div className="relative z-10 flex flex-col items-center">
        <div className="mb-3 rounded-full bg-background p-3 shadow-sm ring-1 ring-border/60">
          <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">{description}</p>
      </div>
    </div>
  );
}

export function DashboardFooterLink({ href, label }: DashboardFooterLinkProps) {
  return (
    <div className="border-t border-border/60 pt-3">
      <Button variant="ghost" size="sm" className="w-full justify-center" asChild>
        <Link href={href}>
          {label}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
