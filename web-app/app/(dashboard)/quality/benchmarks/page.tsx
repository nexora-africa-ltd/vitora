'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Upload,
  FileText,
  TrendingUp,
  Database,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BarChart3,
} from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { formatDistanceToNow } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

interface BenchmarkObservation {
  indicator_code: string;
  time_period: string;
  facility_code: string;
  source: string;
  value: number;
  dimensions: Record<string, string> | null;
  imported_at: string;
}

interface BenchmarkListResponse {
  count: number;
  results: BenchmarkObservation[];
}

interface SDMXImportResponse {
  imported: number;
  dataset_id: string;
  sender: string;
  structure_ref: string;
}

// ============================================================================
// API functions
// ============================================================================

async function fetchBenchmarks(params?: {
  indicator_code?: string;
  source?: string;
  time_period?: string;
}): Promise<BenchmarkListResponse> {
  const response = await apiClient.get<BenchmarkListResponse>('/api/quality/benchmarks/', {
    params,
  });
  return response.data;
}

async function importSDMX(file: File, source: string): Promise<SDMXImportResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('source', source);
  const response = await apiClient.post<SDMXImportResponse>(
    '/api/quality/sdmx/import/',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
}

// ============================================================================
// Page Component
// ============================================================================

export default function BenchmarksPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();

  // Filters
  const [indicatorFilter, setIndicatorFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');

  // Import state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importSource, setImportSource] = useState('KHIS');
  const [dragOver, setDragOver] = useState(false);

  // Queries
  const { data: benchmarkData, isLoading } = useQuery({
    queryKey: ['benchmarks', indicatorFilter, sourceFilter, periodFilter],
    queryFn: () =>
      fetchBenchmarks({
        indicator_code: indicatorFilter || undefined,
        source: sourceFilter || undefined,
        time_period: periodFilter || undefined,
      }),
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (file: File) => importSDMX(file, importSource),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['benchmarks'] });
      setSelectedFile(null);
    },
  });

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xml') || file.name.endsWith('.sdmx'))) {
      setSelectedFile(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleImport = () => {
    if (selectedFile) {
      importMutation.mutate(selectedFile);
    }
  };

  const benchmarks = benchmarkData?.results || [];
  const totalCount = benchmarkData?.count || 0;

  // Extract unique values for filters
  const uniqueSources = [...new Set(benchmarks.map((b) => b.source))];
  const uniquePeriods = [...new Set(benchmarks.map((b) => b.time_period))].sort().reverse();

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-6">
        <PageHeader
          title="Benchmarks & SDMX Import"
          helpContent="Import SDMX-ML 2.1 benchmark data from KHIS/DHIS2 to compare facility performance against county and national indicators. Data is stored locally for offline comparison."
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Database className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalCount}</p>
                  <p className="text-xs text-muted-foreground">Observations</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {[...new Set(benchmarks.map((b) => b.indicator_code))].length}
                  </p>
                  <p className="text-xs text-muted-foreground">Indicators</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{uniqueSources.length}</p>
                  <p className="text-xs text-muted-foreground">Data Sources</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="data" className="space-y-4">
          <TabsList>
            <TabsTrigger value="data" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Benchmark Data</span>
              <span className="sm:hidden">Data</span>
            </TabsTrigger>
            <TabsTrigger value="import" className="gap-2">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Import SDMX</span>
              <span className="sm:hidden">Import</span>
            </TabsTrigger>
          </TabsList>

          {/* Benchmark Data Tab */}
          <TabsContent value="data" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    placeholder="Filter by indicator code..."
                    value={indicatorFilter}
                    onChange={(e) => setIndicatorFilter(e.target.value)}
                    className="flex-1"
                  />
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="All sources" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All sources</SelectItem>
                      {uniqueSources.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={periodFilter} onValueChange={setPeriodFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="All periods" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All periods</SelectItem>
                      {uniquePeriods.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Data Table */}
            {isLoading ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-2">Loading benchmarks...</p>
                </CardContent>
              </Card>
            ) : benchmarks.length > 0 ? (
              <ResponsiveTable
                data={benchmarks}
                keyExtractor={(item: BenchmarkObservation) => `${item.indicator_code}-${item.time_period}-${item.facility_code}`}
                columns={[
                  {
                    key: 'indicator_code',
                    header: 'Indicator',
                    sortable: true,
                    cell: (item) => (
                      <span className="font-mono text-xs">{item.indicator_code}</span>
                    ),
                  },
                  {
                    key: 'time_period',
                    header: 'Period',
                    sortable: true,
                    cell: (item) => item.time_period,
                  },
                  {
                    key: 'facility_code',
                    header: 'Facility',
                    sortable: true,
                    cell: (item) => item.facility_code || '—',
                    hideOnMobile: true,
                  },
                  {
                    key: 'source',
                    header: 'Source',
                    sortable: true,
                    cell: (item) => (
                      <Badge variant="outline" className="text-xs">
                        {item.source}
                      </Badge>
                    ),
                  },
                  {
                    key: 'value',
                    header: 'Value',
                    sortable: true,
                    sortType: 'number',
                    cell: (item) => (
                      <span className="font-medium tabular-nums">{item.value}</span>
                    ),
                  },
                  {
                    key: 'imported_at',
                    header: 'Imported',
                    sortable: true,
                    sortType: 'date',
                    cell: (item) => (
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(item.imported_at), { addSuffix: true })}
                      </span>
                    ),
                    hideOnMobile: true,
                  },
                ]}
                mobileCard={(item) => (
                  <div className="p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-medium">
                        {item.indicator_code}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {item.source}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{item.time_period}</span>
                      <span className="font-medium tabular-nums">{item.value}</span>
                    </div>
                  </div>
                )}
              />
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Database className="h-10 w-10 mx-auto text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground mt-3">
                    No benchmark data imported yet.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use the Import tab to upload SDMX-ML files from KHIS/DHIS2.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Import Tab */}
          <TabsContent value="import" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Import SDMX-ML 2.1 Data</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload SDMX-ML 2.1 files exported from KHIS (Kenya Health Information System) or
                  DHIS2. The data will be parsed and stored as benchmark observations for facility
                  performance comparison.
                </p>

                {/* Drag & Drop Zone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragOver
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                  }`}
                >
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm font-medium">
                    Drag & drop an SDMX-ML file here, or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Accepts .xml and .sdmx files
                  </p>
                  <Input
                    type="file"
                    accept=".xml,.sdmx"
                    onChange={handleFileSelect}
                    className="mt-3 max-w-xs mx-auto"
                  />
                </div>

                {/* Selected file + source selector */}
                {selectedFile && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 border rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">
                        {selectedFile.name}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <Select value={importSource} onValueChange={setImportSource}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="KHIS">KHIS</SelectItem>
                          <SelectItem value="DHIS2">DHIS2</SelectItem>
                          <SelectItem value="WHO">WHO</SelectItem>
                          <SelectItem value="COUNTY">County HQ</SelectItem>
                          <SelectItem value="EXTERNAL">Other</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        onClick={handleImport}
                        disabled={importMutation.isPending}
                        className="gap-2"
                      >
                        {importMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        Import
                      </Button>
                    </div>
                  </div>
                )}

                {/* Success result */}
                {importMutation.isSuccess && importMutation.data && (
                  <div className="flex items-start gap-3 p-4 border rounded-lg bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-700 dark:text-green-300">
                        Successfully imported {importMutation.data.imported} observations
                      </p>
                      <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        <p>Dataset: {importMutation.data.dataset_id}</p>
                        <p>Sender: {importMutation.data.sender}</p>
                        <p>Structure: {importMutation.data.structure_ref}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error */}
                {importMutation.isError && (
                  <div className="flex items-start gap-3 p-4 border rounded-lg bg-destructive/5 border-destructive/20">
                    <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-destructive">Import failed</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {importMutation.error instanceof Error
                          ? importMutation.error.message
                          : 'Invalid SDMX-ML file or server error'}
                      </p>
                    </div>
                  </div>
                )}

                {/* File format info */}
                <div className="border rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium">Expected File Format</p>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>• SDMX-ML 2.1 (Generic or Structure-Specific data messages)</p>
                    <p>• Must contain a {`<DataSet>`} element with {`<Obs>`} child elements</p>
                    <p>• Each observation should have OBS_VALUE and TIME_PERIOD dimensions</p>
                    <p>• INDICATOR dimension maps to the benchmark indicator code</p>
                  </div>
                  <pre className="mt-3 p-3 bg-muted rounded text-xs overflow-x-auto">
{`<message:GenericData xmlns:message="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message">
  <message:Header>
    <message:ID>KHIS_EXPORT_2026Q1</message:ID>
    <message:Sender id="KHIS"/>
  </message:Header>
  <message:DataSet structureRef="HEALTH_INDICATORS">
    <Obs>
      <ObsKey><Value id="INDICATOR" value="ANC_COVERAGE"/></ObsKey>
      <ObsKey><Value id="TIME_PERIOD" value="2026-Q1"/></ObsKey>
      <ObsValue value="78.5"/>
    </Obs>
  </message:DataSet>
</message:GenericData>`}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PullToRefresh>
  );
}
