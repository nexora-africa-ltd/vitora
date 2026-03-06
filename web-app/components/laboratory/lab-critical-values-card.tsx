'use client';

import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChartEmptyState } from '@/components/charts';
import { HelpPopover } from '@/components/shared/help-popover';
import type { CriticalValuesReport } from '@/lib/types/laboratory';

interface LabCriticalValuesCardProps {
  data: CriticalValuesReport;
  isLoading?: boolean;
}

/**
 * Card displaying critical values summary and breakdown.
 */
export function LabCriticalValuesCard({ data, isLoading }: LabCriticalValuesCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Critical Values
            </CardTitle>
            <HelpPopover content="Results outside critical ranges requiring immediate clinical attention. These values may indicate life-threatening conditions." />
          </div>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-12 bg-muted rounded" />
            <div className="h-24 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Critical Values
          </CardTitle>
          <HelpPopover content="Results outside critical ranges requiring immediate clinical attention. These values may indicate life-threatening conditions." />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hero stat */}
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-destructive">{data.total_critical}</span>
          <span className="text-sm text-muted-foreground">critical results</span>
        </div>

        {/* Test breakdown */}
        {data.by_test.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              By Test Type
            </p>
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {data.by_test.map((item) => (
                <div
                  key={item.test_code}
                  className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {item.test_code}
                    </Badge>
                    <span className="text-sm truncate">{item.test_name}</span>
                  </div>
                  <Badge variant="destructive" className="shrink-0">
                    {item.critical_count}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ) : data.total_critical === 0 ? (
          <ChartEmptyState chartType="generic" title="No critical values" description="No critical values reported in this period" />
        ) : (
          <ChartEmptyState chartType="generic" title="No breakdown" description="No breakdown data available" />
        )}
      </CardContent>
    </Card>
  );
}

export default LabCriticalValuesCard;
