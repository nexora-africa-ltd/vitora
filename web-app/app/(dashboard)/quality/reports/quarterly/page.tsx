'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { HelpPopover } from '@/components/shared/help-popover';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { qualityApi } from '@/lib/api/quality';
import { toast } from '@/lib/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';
import { FileBarChart, Plus, Loader2 } from 'lucide-react';
import type { QuarterlyReport, QuarterlyReportListParams } from '@/lib/types/quality';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function QuarterlyReportsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();

  const [year, setYear] = useState<string>('all');
  const [quarter, setQuarter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [genClinicId, setGenClinicId] = useState('');
  const [genYear, setGenYear] = useState(String(currentYear));
  const [genQuarter, setGenQuarter] = useState('1');

  const queryParams = useMemo<QuarterlyReportListParams>(() => {
    const params: QuarterlyReportListParams = { page, ordering: '-year,-quarter' };
    if (year !== 'all') params.year = Number(year);
    if (quarter !== 'all') params.quarter = Number(quarter);
    return params;
  }, [page, year, quarter]);

  const { data, isLoading } = useQuery({
    queryKey: ['quarterly-reports', queryParams],
    queryFn: () => qualityApi.listQuarterlyReports(queryParams),
    staleTime: 30_000,
  });

  const { mutateAsync: generateReport, isPending: isGenerating } = useMutation({
    mutationFn: () =>
      genClinicId
        ? qualityApi.generateQuarterlyReport({
            clinic_id: Number(genClinicId),
            year: Number(genYear),
            quarter: Number(genQuarter),
          })
        : qualityApi.generateAllQuarterlyReports({
            year: Number(genYear),
            quarter: Number(genQuarter),
          }).then((reports) => reports[0]),
    onSuccess: () => {
      toast({ title: 'Report generated successfully' });
      queryClient.invalidateQueries({ queryKey: ['quarterly-reports'] });
      setShowGenerateDialog(false);
    },
    onError: () => {
      toast({
        title: 'Generation failed',
        description: 'Ensure monthly reports exist for the selected period.',
        variant: 'destructive',
      });
    },
  });

  const totalPages = data ? Math.ceil(data.count / 20) : 0;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Quarterly Reports"
          helpContent="Quarterly reports aggregate 3 months of clinic data. Generate reports from existing monthly reports or submit to DHIS2."
          actions={
            <Button size="sm" onClick={() => setShowGenerateDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Generate Report</span>
              <span className="sm:hidden">Generate</span>
            </Button>
          }
        />

        {/* Filters */}
        <Card className="p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={year} onValueChange={(v) => { setYear(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={quarter} onValueChange={(v) => { setQuarter(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Quarter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Quarters</SelectItem>
                <SelectItem value="1">Q1 (Jan-Mar)</SelectItem>
                <SelectItem value="2">Q2 (Apr-Jun)</SelectItem>
                <SelectItem value="3">Q3 (Jul-Sep)</SelectItem>
                <SelectItem value="4">Q4 (Oct-Dec)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Table */}
        <ResponsiveTable<QuarterlyReport>
          data={data?.results ?? []}
          keyExtractor={(item) => item.id}
          onRowClick={(item) => router.push(`/quality/reports/quarterly/${item.id}`)}
          isLoading={isLoading}
          emptyMessage="No quarterly reports found. Generate reports from monthly clinic data."
          columns={[
            {
              key: 'clinic',
              header: 'Clinic',
              cell: (item) => <span className="font-medium">{item.clinic_name}</span>,
            },
            {
              key: 'period',
              header: 'Period',
              cell: (item) => item.quarter_display,
            },
            {
              key: 'visits',
              header: 'Total Visits',
              cell: (item) => item.total_visits.toLocaleString(),
              hideOnMobile: true,
            },
            {
              key: 'revenue',
              header: 'Revenue',
              cell: (item) => `KES ${Number(item.total_revenue).toLocaleString()}`,
              hideOnMobile: true,
            },
            {
              key: 'dhis2',
              header: 'DHIS2',
              cell: (item) => (
                <Badge
                  variant={item.dhis2_submitted ? 'default' : 'secondary'}
                  className="shrink-0 w-fit"
                >
                  {item.dhis2_submitted ? 'Submitted' : 'Pending'}
                </Badge>
              ),
            },
          ]}
          mobileCard={(item) => (
            <Card className="p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    {item.clinic_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.quarter_display}
                  </p>
                </div>
                <Badge
                  variant={item.dhis2_submitted ? 'default' : 'secondary'}
                  className="shrink-0 w-fit self-start"
                >
                  {item.dhis2_submitted ? 'Submitted' : 'Pending'}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{item.total_visits.toLocaleString()} visits</span>
                <span>KES {Number(item.total_revenue).toLocaleString()}</span>
              </div>
            </Card>
          )}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {data?.count ?? 0} report{(data?.count ?? 0) !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Generate Dialog */}
        <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>Generate Quarterly Report</DialogTitle>
                <HelpPopover content="Aggregates 3 monthly reports for a clinic. Leave Clinic ID empty to generate for all clinics." />
              </div>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gen-clinic">Clinic ID (optional)</Label>
                <Input
                  id="gen-clinic"
                  type="number"
                  placeholder="Leave empty for all clinics"
                  value={genClinicId}
                  onChange={(e) => setGenClinicId(e.target.value)}
                />
              </div>
              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Select value={genYear} onValueChange={setGenYear}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quarter</Label>
                  <Select value={genQuarter} onValueChange={setGenQuarter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Q1</SelectItem>
                      <SelectItem value="2">Q2</SelectItem>
                      <SelectItem value="3">Q3</SelectItem>
                      <SelectItem value="4">Q4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => generateReport()} disabled={isGenerating}>
                {isGenerating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Generate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
