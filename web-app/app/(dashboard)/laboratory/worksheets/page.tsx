'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileSpreadsheet,
  Printer,
  Plus,
  Download,
  CheckCircle2,
  Clock,
  Tag,
} from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { worksheetsApi } from '@/lib/api/worksheets';
import type { Worksheet, WorksheetTemplate, LabelPrintJob } from '@/lib/types/worksheets';

// =============================================================================
// Helpers
// =============================================================================

function worksheetStatusColor(status: string) {
  switch (status) {
    case 'DRAFT':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300';
    case 'IN_PROGRESS':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'COMPLETED':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'CANCELLED':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function labelJobStatusColor(status: string) {
  switch (status) {
    case 'PENDING':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'GENERATING':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'READY':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'PRINTED':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300';
    case 'FAILED':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// =============================================================================
// Page Component
// =============================================================================

export default function WorksheetsPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [generateTitle, setGenerateTitle] = useState('');

  // Queries
  const { data: worksheetsData } = useQuery({
    queryKey: ['worksheets'],
    queryFn: () => worksheetsApi.listWorksheets(),
  });

  const { data: templatesData } = useQuery({
    queryKey: ['worksheet-templates'],
    queryFn: () => worksheetsApi.listTemplates(),
  });

  const { data: printJobsData } = useQuery({
    queryKey: ['label-print-jobs'],
    queryFn: () => worksheetsApi.listPrintJobs(),
  });

  // Mutations
  const generateMutation = useMutation({
    mutationFn: (data: { title?: string }) => worksheetsApi.generateWorksheet(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worksheets'] });
      setShowGenerateDialog(false);
      setGenerateTitle('');
    },
  });

  const markPrintedMutation = useMutation({
    mutationFn: (id: number) => worksheetsApi.markWorksheetPrinted(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['worksheets'] }),
  });

  const worksheets = worksheetsData?.results || [];
  const templates = templatesData?.results || [];
  const printJobs = printJobsData?.results || [];

  // Stats
  const totalWorksheets = worksheetsData?.count || 0;
  const inProgress = worksheets.filter((w) => w.status === 'IN_PROGRESS').length;
  const completed = worksheets.filter((w) => w.status === 'COMPLETED').length;
  const totalPrintJobs = printJobsData?.count || 0;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Worksheets & Labels"
          helpContent="Generate lab worksheets for batch processing and print specimen labels. Worksheets group pending orders by test, department, or priority for efficient bench work."
          actions={
            <Button onClick={() => setShowGenerateDialog(true)} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Generate Worksheet</span>
              <span className="sm:hidden">Generate</span>
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total</span>
              </div>
              <p className="mt-1 text-2xl font-bold">{totalWorksheets}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-muted-foreground">In Progress</span>
              </div>
              <p className="mt-1 text-2xl font-bold">{inProgress}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Completed</span>
              </div>
              <p className="mt-1 text-2xl font-bold">{completed}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Print Jobs</span>
              </div>
              <p className="mt-1 text-2xl font-bold">{totalPrintJobs}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="worksheets">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="worksheets" className="gap-1.5 flex-1 sm:flex-none text-xs sm:text-sm">
              <FileSpreadsheet className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="sm:hidden">Sheets</span>
              <span className="hidden sm:inline">Worksheets</span>
            </TabsTrigger>
            <TabsTrigger value="labels" className="gap-1.5 flex-1 sm:flex-none text-xs sm:text-sm">
              <Printer className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="sm:hidden">Labels</span>
              <span className="hidden sm:inline">Print Jobs</span>
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-1.5 flex-1 sm:flex-none text-xs sm:text-sm">
              <FileSpreadsheet className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Templates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="worksheets" className="mt-4">
            <ResponsiveTable
              data={worksheets}
              keyExtractor={(item) => item.id}
              defaultSortColumn="generated_at"
              defaultSortDirection="desc"
              columns={[
                {
                  key: 'worksheet_number',
                  header: 'Worksheet #',
                  sortable: true,
                  cell: (item) => (
                    <span className="font-mono text-sm">{item.worksheet_number}</span>
                  ),
                },
                {
                  key: 'title',
                  header: 'Title',
                  sortable: true,
                  cell: (item) => item.title || item.template_name || '—',
                },
                {
                  key: 'specimen_count',
                  header: 'Items',
                  sortable: true,
                  sortType: 'number',
                  cell: (item) => item.specimen_count,
                },
                {
                  key: 'status',
                  header: 'Status',
                  sortable: true,
                  cell: (item) => (
                    <Badge className={`${worksheetStatusColor(item.status)} shrink-0 w-fit`}>
                      {item.status.replace('_', ' ')}
                    </Badge>
                  ),
                },
                {
                  key: 'generated_at',
                  header: 'Generated',
                  sortable: true,
                  sortType: 'date',
                  cell: (item) => formatDate(item.generated_at),
                  hideOnMobile: true,
                },
                {
                  key: 'actions',
                  header: '',
                  cell: (item) => (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          worksheetsApi.exportWorksheetCsv(item.id).then((blob) => {
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${item.worksheet_number}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                          });
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {item.status !== 'COMPLETED' && item.status !== 'PRINTED' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const detail = await worksheetsApi.getWorksheet(item.id);
                              const printWindow = window.open('', '_blank');
                              if (printWindow) {
                                printWindow.document.write(`
                                  <html><head><title>${detail.worksheet_number}</title>
                                  <style>
                                    body { font-family: system-ui, sans-serif; padding: 20px; }
                                    h1 { font-size: 18px; margin-bottom: 4px; }
                                    p { font-size: 13px; color: #666; margin: 2px 0; }
                                    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
                                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
                                    th { background: #f5f5f5; font-weight: 600; }
                                    @media print { body { padding: 0; } }
                                  </style></head><body>
                                  <h1>${detail.worksheet_number}</h1>
                                  <p>${detail.title || 'Lab Worksheet'}</p>
                                  <p>Generated: ${new Date(detail.generated_at).toLocaleString()}</p>
                                  <table>
                                    <thead><tr><th>#</th><th>Patient</th><th>Test</th><th>Specimen</th></tr></thead>
                                    <tbody>
                                      ${detail.items.map((it, idx) => `
                                        <tr>
                                          <td>${idx + 1}</td>
                                          <td>${it.patient_name}</td>
                                          <td>${it.test_name}</td>
                                          <td>${it.specimen_barcode || '—'}</td>
                                        </tr>
                                      `).join('')}
                                    </tbody>
                                  </table>
                                  </body></html>
                                `);
                                printWindow.document.close();
                                printWindow.focus();
                                printWindow.print();
                              }
                              markPrintedMutation.mutate(item.id);
                            } catch {
                              // If fetch fails, still allow marking as printed
                              markPrintedMutation.mutate(item.id);
                            }
                          }}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
              mobileCard={(item) => (
                <div className="p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-mono text-sm font-medium">{item.worksheet_number}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.title || item.template_name}
                      </p>
                    </div>
                    <Badge className={`${worksheetStatusColor(item.status)} shrink-0 w-fit`}>
                      {item.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{item.specimen_count} items</span>
                    <span>{formatDate(item.generated_at)}</span>
                  </div>
                </div>
              )}
            />
          </TabsContent>

          <TabsContent value="labels" className="mt-4">
            <ResponsiveTable
              data={printJobs}
              keyExtractor={(item) => item.id}
              defaultSortColumn="created_at"
              defaultSortDirection="desc"
              columns={[
                {
                  key: 'id',
                  header: 'Job #',
                  sortable: true,
                  cell: (item) => `#${item.id}`,
                },
                {
                  key: 'template_name',
                  header: 'Template',
                  sortable: true,
                  cell: (item) => item.template_name,
                },
                {
                  key: 'total_labels',
                  header: 'Labels',
                  sortable: true,
                  sortType: 'number',
                  cell: (item) => item.total_labels,
                },
                {
                  key: 'status',
                  header: 'Status',
                  sortable: true,
                  cell: (item) => (
                    <Badge className={`${labelJobStatusColor(item.status)} shrink-0 w-fit`}>
                      {item.status}
                    </Badge>
                  ),
                },
                {
                  key: 'created_at',
                  header: 'Created',
                  sortable: true,
                  sortType: 'date',
                  cell: (item) => formatDate(item.created_at),
                  hideOnMobile: true,
                },
              ]}
              mobileCard={(item) => (
                <div className="p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <p className="font-medium">Job #{item.id}</p>
                    <Badge className={`${labelJobStatusColor(item.status)} shrink-0 w-fit`}>
                      {item.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {item.template_name} • {item.total_labels} labels
                  </p>
                </div>
              )}
            />
          </TabsContent>

          <TabsContent value="templates" className="mt-4">
            <ResponsiveTable
              data={templates}
              keyExtractor={(item) => item.id}
              columns={[
                {
                  key: 'name',
                  header: 'Name',
                  sortable: true,
                  cell: (item) => item.name,
                },
                {
                  key: 'group_by',
                  header: 'Group By',
                  sortable: true,
                  cell: (item) => item.group_by.replace('_', ' '),
                },
                {
                  key: 'default_export_format',
                  header: 'Format',
                  sortable: true,
                  cell: (item) => item.default_export_format,
                  hideOnMobile: true,
                },
                {
                  key: 'page_size',
                  header: 'Page Size',
                  sortable: true,
                  sortType: 'number',
                  cell: (item) => item.page_size,
                  hideOnMobile: true,
                },
                {
                  key: 'is_active',
                  header: 'Active',
                  sortable: true,
                  cell: (item) => (
                    <Badge
                      className={
                        item.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300'
                      }
                    >
                      {item.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  ),
                },
              ]}
              mobileCard={(item) => (
                <div className="p-3 space-y-1">
                  <div className="flex justify-between items-center">
                    <p className="font-medium">{item.name}</p>
                    <Badge
                      className={
                        item.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300'
                      }
                    >
                      {item.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Group by {item.group_by.replace('_', ' ')} • {item.default_export_format}
                  </p>
                </div>
              )}
            />
          </TabsContent>
        </Tabs>

        {/* Generate Worksheet Dialog */}
        <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Generate Worksheet</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="ws-title">Title (optional)</Label>
                <Input
                  id="ws-title"
                  value={generateTitle}
                  onChange={(e) => setGenerateTitle(e.target.value)}
                  placeholder="e.g., Morning Chemistry Run"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowGenerateDialog(false)} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button
                onClick={() => generateMutation.mutate({ title: generateTitle || undefined })}
                disabled={generateMutation.isPending}
                className="w-full sm:w-auto"
              >
                {generateMutation.isPending ? 'Generating...' : 'Generate'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
