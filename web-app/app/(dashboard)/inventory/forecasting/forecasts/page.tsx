'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { inventoryApi } from '@/lib/api/inventory';
import { getApiErrorMessage } from '@/lib/api/client';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useToast } from '@/lib/hooks/use-toast';
import type { DemandForecast, ForecastMethod } from '@/lib/types/inventory';

const METHOD_CONFIG: Record<ForecastMethod, { label: string; color: string }> = {
  MOVING_AVERAGE: {
    label: 'Moving Avg',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  },
  EXPONENTIAL_SMOOTHING: {
    label: 'Exp. Smooth',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  },
  SEASONAL: {
    label: 'Seasonal',
    color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  },
};

function MethodBadge({ method }: { method: ForecastMethod }) {
  const cfg = METHOD_CONFIG[method] ?? METHOD_CONFIG.MOVING_AVERAGE;
  return <Badge className={`${cfg.color} shrink-0 w-fit`}>{cfg.label}</Badge>;
}

export default function DemandForecastsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();
  const [page, setPage] = useState(1);
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Generate form state
  const [genMethod, setGenMethod] = useState<'MOVING_AVERAGE' | 'EXPONENTIAL_SMOOTHING'>('MOVING_AVERAGE');
  const [genPeriod, setGenPeriod] = useState('3');

  const params = {
    page,
    ...(methodFilter !== 'all' ? { method: methodFilter as ForecastMethod } : {}),
    ordering: '-forecast_date',
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['demand-forecasts', params],
    queryFn: () => inventoryApi.listForecasts(params),
  });

  const forecasts = data?.results ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / 20);

  const belowReorder = forecasts.filter(
    (f) => f.reorder_point != null && f.suggested_order_quantity != null && Number(f.suggested_order_quantity) > 0
  ).length;

  const generateMutation = useMutation({
    mutationFn: () =>
      inventoryApi.generateForecast({
        method: genMethod,
        period_months: Number(genPeriod),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['demand-forecasts'] });
      queryClient.invalidateQueries({ queryKey: ['reorder-suggestions'] });
      const msg = 'count' in result ? `Generated ${result.count} forecast(s)` : 'Forecast generated';
      toast({ variant: 'success', title: msg });
      setDialogOpen(false);
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Failed to generate forecasts',
        description: getApiErrorMessage(err),
      });
    },
  });

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Demand Forecasts"
          helpContent="AI-generated demand forecasts predict future drug consumption using historical data. Forecasts drive reorder suggestions."
          actions={
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Sparkles className="mr-1 h-4 w-4" />
                  Generate Forecast
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Generate Demand Forecasts</DialogTitle>
                  <DialogDescription>
                    Generate forecasts for all drugs based on consumption history.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <Label>Method</Label>
                    <Select
                      value={genMethod}
                      onValueChange={(v) => setGenMethod(v as 'MOVING_AVERAGE' | 'EXPONENTIAL_SMOOTHING')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MOVING_AVERAGE">Moving Average</SelectItem>
                        <SelectItem value="EXPONENTIAL_SMOOTHING">Exponential Smoothing</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Period (months)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      value={genPeriod}
                      onChange={(e) => setGenPeriod(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => generateMutation.mutate()}
                    disabled={generateMutation.isPending}
                  >
                    {generateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Generate
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Total Forecasts</p>
              </div>
              <p className="text-xl font-bold mt-1">{isLoading ? '...' : totalCount}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <p className="text-xs text-muted-foreground">Need Reorder</p>
              </div>
              <p className="text-xl font-bold mt-1 text-amber-600">{isLoading ? '...' : belowReorder}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3">
          <Select value={methodFilter} onValueChange={(v) => { setMethodFilter(v); setPage(1); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Methods</SelectItem>
              <SelectItem value="MOVING_AVERAGE">Moving Average</SelectItem>
              <SelectItem value="EXPONENTIAL_SMOOTHING">Exp. Smoothing</SelectItem>
              <SelectItem value="SEASONAL">Seasonal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>Failed to load demand forecasts.</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <>
            <ResponsiveTable
              data={forecasts}
              keyExtractor={(f) => f.id}
              defaultSortColumn="forecast_date"
              defaultSortDirection="desc"
              columns={[
                {
                  key: 'drug_name',
                  header: 'Drug',
                  sortable: true,
                  cell: (f) => <span className="font-medium">{f.drug_name}</span>,
                },
                {
                  key: 'method',
                  header: 'Method',
                  sortable: true,
                  cell: (f) => <MethodBadge method={f.method} />,
                },
                {
                  key: 'predicted_demand',
                  header: 'Predicted',
                  sortable: true,
                  sortType: 'number' as const,
                  cell: (f) => <span className="font-mono">{Number(f.predicted_demand).toLocaleString()}</span>,
                },
                {
                  key: 'confidence_lower',
                  header: 'Confidence',
                  cell: (f) =>
                    f.confidence_lower != null && f.confidence_upper != null ? (
                      <span className="text-xs text-muted-foreground font-mono">
                        {Number(f.confidence_lower).toLocaleString()} – {Number(f.confidence_upper).toLocaleString()}
                      </span>
                    ) : (
                      '—'
                    ),
                  hideOnMobile: true,
                },
                {
                  key: 'reorder_point',
                  header: 'Reorder Pt',
                  sortable: true,
                  sortType: 'number' as const,
                  cell: (f) =>
                    f.reorder_point != null ? (
                      <span className="font-mono">{Number(f.reorder_point).toLocaleString()}</span>
                    ) : (
                      '—'
                    ),
                  hideOnMobile: true,
                },
                {
                  key: 'suggested_order_quantity',
                  header: 'Suggested Qty',
                  sortable: true,
                  sortType: 'number' as const,
                  cell: (f) =>
                    f.suggested_order_quantity != null ? (
                      <span className={`font-mono ${Number(f.suggested_order_quantity) > 0 ? 'text-amber-600 font-medium' : ''}`}>
                        {Number(f.suggested_order_quantity).toLocaleString()}
                      </span>
                    ) : (
                      '—'
                    ),
                },
                {
                  key: 'forecast_date',
                  header: 'Date',
                  sortable: true,
                  sortType: 'date' as const,
                  cell: (f) => new Date(f.forecast_date).toLocaleDateString(),
                  hideOnMobile: true,
                },
              ]}
              mobileCard={(f) => (
                <Card className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{f.drug_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(f.forecast_date).toLocaleDateString()} &bull; {f.period_months}mo
                      </p>
                    </div>
                    <MethodBadge method={f.method} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">Predicted</span>
                      <p className="font-mono font-medium">{Number(f.predicted_demand).toLocaleString()}</p>
                    </div>
                    {f.suggested_order_quantity != null && (
                      <div>
                        <span className="text-xs text-muted-foreground">Suggested</span>
                        <p className="font-mono font-medium text-amber-600">
                          {Number(f.suggested_order_quantity).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              )}
            />

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <p className="text-muted-foreground">
                  Page {page} of {totalPages} ({totalCount} forecasts)
                </p>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1 rounded border disabled:opacity-50"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <button
                    className="px-3 py-1 rounded border disabled:opacity-50"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PullToRefresh>
  );
}
