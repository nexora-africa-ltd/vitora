'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpPopover } from '@/components/shared/help-popover';
import { cn } from '@/lib/utils/cn';

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  isLoading?: boolean;
  action?: React.ReactNode;
}

export function ChartCard({
  title,
  description,
  children,
  className,
  isLoading = false,
  action,
}: ChartCardProps) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
          {description && <HelpPopover content={description} />}
        </div>
        {action}
      </CardHeader>
      <CardContent className="pb-4">
        {isLoading ? (
          <div className="h-[250px] flex items-center justify-center">
            <Skeleton className="h-full w-full" />
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export default ChartCard;
