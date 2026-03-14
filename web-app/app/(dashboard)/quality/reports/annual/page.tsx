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
import { Plus, Loader2 } from 'lucide-react';
import type { AnnualReport, AnnualReportListParams } from '@/lib/types/quality';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function AnnualReportsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();

  const [year, setYear] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [genClinicId, setGenClinicId] = useState('');
  const [genYear, setGenYear] = useState(String(currentYear));

  const queryParams = useMemo<AnnualReportListParams>(() => {
    const params: AnnualReportListParams = { page, ordering: '-year' };
    if (year !== 'all') params.year = Number(year);
    return params;
  }, [page, year]);

  const { data, isLoading } = useQuery({
    queryKey: ['annual-reports', queryParams],
    queryFn: () => qualityApi.listAnnualReports(queryParams),
    staleTime: 30_000,
  });

  const { mutateAsync: generateReport, isPending: isGenerating } = useMutation({
    mutationFn: () =>
      qualityApi.generateAnnualReport({
        clinic_id: Number(genClinicId),
        year: Number(genYear),
      }),
    onSuccess: () => {
      toast({ title: 'Annual report generated successfully' });
      queryClient.invalidateQueries({ queryKey: ['annual-reports'] });
      setShowGenerateDialog(false);
    },
    onError: () => {
      toast({
        title: 'Generation failed',
        description: 'Ensure quarterly or monthly reports exist for the selected year.',
        variant: 'destructive',
      });
    },
  });

  const totalPages = data ? Math.ceil(data.count / 20) : 0;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Annual Reports"
          helpContent="Annual reports aggregate 4 quarterly reports (or 12 monthly reports as fallback) for a clinic. Submit to DHIS2 for national reporting."
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
          <Select value={year} onValueChange={(v) => { setYear(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>

        {/* Table */}
        <ResponsiveTable<AnnualReport>
          data={data?.results ?? []}
          keyExtractor={(item) => item.id}
          onRowClick={(item) => router.push(`/quality/reports/annual/${item.id}`)}
          isLoading={isLoading}
          emptyMessage="No annual reports found. Generate reports from quarterly or monthly clinic data."
          columns={[
            {
              key: 'clinic',
              header: 'Clinic',
              sortable: true,
              sortFn: (a, b) => (a.clinic_name || '').localeCompare(b.clinic_name || ''),
              cell: (item) => <span className="font-medium">{item.clinic_name}</span>,
            },
            {
              key: 'year',
              header: 'Year',
              sortable: true,
              sortType: 'number',
              sortFn: (a, b) => a.year - b.year,
              cell: (item) => String(item.year),
            },
            {
              key: 'visits',
              header: 'Total Visits',
              sortable: true,
              sortType: 'number',
              sortFn: (a, b) => a.total_visits - b.total_visits,
              cell: (item) => item.total_visits.toLocaleString(),
              hideOnMobile: true,
            },
            {
              key: 'revenue',
              header: 'Revenue',
              sortable: true,
              sortType: 'number',
              sortFn: (a, b) => Number(a.total_revenue) - Number(b.total_revenue),
              cell: (item) => `KES ${Number(item.total_revenue).toLocaleString()}`,
              hideOnMobile: true,
            },
            {
              key: 'dhis2',
              header: 'DHIS2',
              sortable: true,
              sortFn: (a, b) => Number(a.dhis2_submitted) - Number(b.dhis2_submitted),
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
                  <p className="font-medium text-sm truncate">{item.clinic_name}</p>
                  <p className="text-xs text-muted-foreground">{item.year}</p>
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
                <DialogTitle>Generate Annual Report</DialogTitle>
                <HelpPopover content="Aggregates quarterly reports (or monthly if quarterly not available) for a clinic and year." />
              </div>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gen-clinic">Clinic ID</Label>
                <Input
                  id="gen-clinic"
                  type="number"
                  placeholder="Enter clinic ID"
                  value={genClinicId}
                  onChange={(e) => setGenClinicId(e.target.value)}
                  required
                />
              </div>
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => generateReport()}
                disabled={isGenerating || !genClinicId}
              >
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
