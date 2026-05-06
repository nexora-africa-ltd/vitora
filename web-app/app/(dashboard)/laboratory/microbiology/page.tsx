'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bug, Plus, FlaskConical, FileDown, BarChart3, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useCultures, useAntibiograms, useGenerateAntibiogram } from '@/lib/hooks/use-laboratory';
import { microbiologyApi } from '@/lib/api/laboratory';
import { CultureStatus } from '@/lib/types/laboratory';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { toast } from 'sonner';

const STATUS_COLORS: Record<CultureStatus, string> = {
  INOCULATED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  INCUBATING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  READING: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  PRELIMINARY: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  FINAL: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  NO_GROWTH: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

export default function MicrobiologyPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [tab, setTab] = useState('cultures');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [page, setPage] = useState(1);
  const [antibiogramYear, setAntibiogramYear] = useState(new Date().getFullYear());

  const { data: culturesData, isLoading: culturesLoading } = useCultures({
    status: statusFilter || undefined,
    search: debouncedSearch || undefined,
    page,
  });

  const { data: antibiogramData, isLoading: antibiogramLoading } = useAntibiograms({
    year: antibiogramYear,
  });

  const generateAntibiogram = useGenerateAntibiogram();

  const handleGenerateAntibiogram = async () => {
    try {
      const result = await generateAntibiogram.mutateAsync(antibiogramYear);
      toast.success(`Generated antibiogram: ${result.generated} entries for ${result.year}`);
    } catch {
      toast.error('Failed to generate antibiogram');
    }
  };

  const handleWHONETExport = async () => {
    try {
      const blob = await microbiologyApi.downloadWHONETExport(antibiogramYear);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whonet_export_${antibiogramYear}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('WHONET export downloaded');
    } catch {
      toast.error('Failed to download WHONET export');
    }
  };

  const cultureColumns = [
    {
      key: 'id',
      header: 'ID',
      sortable: true,
      sortType: 'number' as const,
      cell: (item: (typeof cultures)[number]) => `#${item.id}`,
    },
    {
      key: 'patient_name',
      header: 'Patient',
      sortable: true,
      cell: (item: (typeof cultures)[number]) => item.patient_name || '—',
    },
    {
      key: 'organism_name',
      header: 'Organism',
      sortable: true,
      cell: (item: (typeof cultures)[number]) => item.organism_name || 'Pending',
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: (typeof cultures)[number]) => (
        <Badge className={`${STATUS_COLORS[item.status]} shrink-0 w-fit`}>
          {item.status_display}
        </Badge>
      ),
    },
    {
      key: 'culture_medium',
      header: 'Medium',
      hideOnMobile: true,
      cell: (item: (typeof cultures)[number]) => item.culture_medium || '—',
    },
    {
      key: 'days_incubating',
      header: 'Days',
      hideOnMobile: true,
      sortable: true,
      sortType: 'number' as const,
      cell: (item: (typeof cultures)[number]) =>
        item.days_incubating !== null ? `${item.days_incubating}d` : '—',
    },
    {
      key: 'created_at',
      header: 'Date',
      sortable: true,
      sortType: 'date' as const,
      cell: (item: (typeof cultures)[number]) =>
        new Date(item.created_at).toLocaleDateString(),
    },
  ];

  const cultures = culturesData?.results ?? [];
  const antibiograms = antibiogramData?.results ?? [];

  // Stats
  const totalCultures = culturesData?.count ?? 0;
  const activeCultures = cultures.filter(
    (c) => !['FINAL', 'NO_GROWTH', 'CANCELLED'].includes(c.status)
  ).length;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Microbiology"
          helpContent="Culture & sensitivity workflow, antibiogram generation, and WHONET-compatible data export."
          actions={
            <Button onClick={() => router.push('/laboratory/microbiology/new')}>
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">New Culture</span>
              <span className="sm:hidden">New</span>
            </Button>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <Bug className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Total Cultures</p>
              </div>
              <p className="text-xl font-bold mt-1">{totalCultures}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
              <p className="text-xl font-bold mt-1">{activeCultures}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Antibiogram</p>
              </div>
              <p className="text-xl font-bold mt-1">{antibiograms.length}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <FileDown className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Year</p>
              </div>
              <p className="text-xl font-bold mt-1">{antibiogramYear}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="cultures" className="gap-1.5">
              <FlaskConical className="h-4 w-4" />
              <span className="hidden sm:inline">Cultures</span>
            </TabsTrigger>
            <TabsTrigger value="antibiogram" className="gap-1.5">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Antibiogram</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cultures" className="mt-4 space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <Input
                placeholder="Search organism, order..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64"
              />
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="INOCULATED">Inoculated</SelectItem>
                  <SelectItem value="INCUBATING">Incubating</SelectItem>
                  <SelectItem value="READING">Reading</SelectItem>
                  <SelectItem value="PRELIMINARY">Preliminary</SelectItem>
                  <SelectItem value="FINAL">Final</SelectItem>
                  <SelectItem value="NO_GROWTH">No Growth</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ResponsiveTable
              data={cultures}
              keyExtractor={(item) => item.id}
              columns={cultureColumns}
              onRowClick={(item) => router.push(`/laboratory/microbiology/${item.id}`)}
              defaultSortColumn="created_at"
              defaultSortDirection="desc"
              isLoading={culturesLoading}
              emptyMessage="No cultures found"
            />

            {/* Pagination */}
            {culturesData && culturesData.count > 20 && (
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  Showing {cultures.length} of {culturesData.count}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!culturesData.next}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="antibiogram" className="mt-4 space-y-4">
            {/* Antibiogram Controls */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center sm:justify-between">
              <div className="flex gap-2 items-center">
                <Select
                  value={String(antibiogramYear)}
                  onValueChange={(v) => setAntibiogramYear(Number(v))}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026].map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateAntibiogram}
                  disabled={generateAntibiogram.isPending}
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${generateAntibiogram.isPending ? 'animate-spin' : ''}`} />
                  Generate
                </Button>
                <Button variant="outline" size="sm" onClick={handleWHONETExport}>
                  <FileDown className="h-4 w-4 mr-1" />
                  WHONET
                </Button>
              </div>
            </div>

            {/* Antibiogram Table */}
            {antibiogramLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading antibiogram data...</div>
            ) : antibiograms.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <p>No antibiogram data for {antibiogramYear}.</p>
                  <p className="text-sm mt-1">Generate from finalized culture results.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Cumulative Antibiogram — {antibiogramYear}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-0 sm:px-6">
                  <div className="overflow-x-auto">
                    <table className="min-w-[600px] w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2 font-medium">Organism</th>
                          <th className="text-left p-2 font-medium">Antibiotic</th>
                          <th className="text-center p-2 font-medium">N</th>
                          <th className="text-center p-2 font-medium">%S</th>
                          <th className="text-center p-2 font-medium">%R</th>
                        </tr>
                      </thead>
                      <tbody>
                        {antibiograms.map((row) => (
                          <tr key={row.id} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="p-2">{row.organism_name}</td>
                            <td className="p-2">{row.antibiotic_name}</td>
                            <td className="p-2 text-center">{row.total_isolates}</td>
                            <td className="p-2 text-center">
                              <Badge
                                variant="outline"
                                className={
                                  (row.percent_sensitive ?? 0) >= 80
                                    ? 'text-green-700 border-green-300'
                                    : (row.percent_sensitive ?? 0) >= 50
                                      ? 'text-amber-700 border-amber-300'
                                      : 'text-red-700 border-red-300'
                                }
                              >
                                {row.percent_sensitive != null ? `${row.percent_sensitive}%` : '—'}
                              </Badge>
                            </td>
                            <td className="p-2 text-center">
                              {row.percent_resistant != null ? `${row.percent_resistant}%` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PullToRefresh>
  );
}
