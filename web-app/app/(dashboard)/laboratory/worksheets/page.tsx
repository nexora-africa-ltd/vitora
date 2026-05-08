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
  Loader2,
  Sparkles,
  Pencil,
  Trash2,
  MoreHorizontal,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { worksheetsApi } from '@/lib/api/worksheets';
import { toast } from 'sonner';
import type { Worksheet, WorksheetTemplate, WorksheetTemplateCreateData, LabelPrintJob, LabelPrintJobListItem, LabelTemplate, WorksheetGroupBy, WorksheetExportFormat } from '@/lib/types/worksheets';

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
    case 'GENERATED':
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

const EMPTY_TEMPLATE_FORM: WorksheetTemplateCreateData = {
  name: '',
  description: '',
  group_by: 'SECTION',
  section_filter: '',
  instrument: null,
  include_qc_slots: false,
  max_specimens_per_page: 30,
  default_export_format: 'PDF',
  columns: [],
};

export default function WorksheetsPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [generateTitle, setGenerateTitle] = useState('');

  // Template CRUD state
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WorksheetTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState<WorksheetTemplateCreateData>(EMPTY_TEMPLATE_FORM);
  const [deleteTemplateId, setDeleteTemplateId] = useState<number | null>(null);

  // Label printing state
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [labelWorksheetId, setLabelWorksheetId] = useState<number | null>(null);
  const [selectedLabelTemplate, setSelectedLabelTemplate] = useState<string>('');
  const [labelCopies, setLabelCopies] = useState(1);

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

  const { data: labelTemplatesData } = useQuery({
    queryKey: ['label-templates'],
    queryFn: () => worksheetsApi.listLabelTemplates({ is_active: true }),
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

  const seedDefaultsMutation = useMutation({
    mutationFn: () => worksheetsApi.seedDefaultTemplates(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['worksheet-templates'] });
      toast.success(data.message);
    },
    onError: () => toast.error('Failed to seed default templates'),
  });

  const createTemplateMutation = useMutation({
    mutationFn: (data: WorksheetTemplateCreateData) => worksheetsApi.createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worksheet-templates'] });
      setShowTemplateDialog(false);
      toast.success('Template created');
    },
    onError: () => toast.error('Failed to create template'),
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<WorksheetTemplateCreateData> }) =>
      worksheetsApi.updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worksheet-templates'] });
      setShowTemplateDialog(false);
      toast.success('Template updated');
    },
    onError: () => toast.error('Failed to update template'),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: number) => worksheetsApi.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worksheet-templates'] });
      setDeleteTemplateId(null);
      toast.success('Template deleted');
    },
    onError: () => toast.error('Failed to delete template'),
  });

  const generateLabelsMutation = useMutation({
    mutationFn: (data: { template_id: number; specimen_ids: number[]; copies?: number }) =>
      worksheetsApi.generateLabels(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['label-print-jobs'] });
      setShowLabelDialog(false);
      setLabelWorksheetId(null);
      setSelectedLabelTemplate('');
      setLabelCopies(1);
      toast.success('Label print job created');
    },
    onError: () => toast.error('Failed to generate labels'),
  });

  async function handlePrintLabels() {
    if (!labelWorksheetId || !selectedLabelTemplate) return;
    const detail = await worksheetsApi.getWorksheet(labelWorksheetId);
    const specimenIds = detail.items
      .filter((it) => it.specimen !== null)
      .map((it) => it.specimen as number);
    if (specimenIds.length === 0) {
      toast.error('No specimens in this worksheet');
      return;
    }
    generateLabelsMutation.mutate({
      template_id: parseInt(selectedLabelTemplate),
      specimen_ids: specimenIds,
      copies: labelCopies,
    });
  }

  function openCreateTemplate() {
    setEditingTemplate(null);
    setTemplateForm(EMPTY_TEMPLATE_FORM);
    setShowTemplateDialog(true);
  }

  function openEditTemplate(t: WorksheetTemplate) {
    setEditingTemplate(t);
    setTemplateForm({
      name: t.name,
      description: t.description,
      group_by: t.group_by,
      section_filter: t.section_filter,
      instrument: t.instrument,
      include_qc_slots: t.include_qc_slots,
      max_specimens_per_page: t.max_specimens_per_page,
      default_export_format: t.default_export_format,
      columns: t.columns || [],
    });
    setShowTemplateDialog(true);
  }

  function handleTemplateSubmit() {
    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data: templateForm });
    } else {
      createTemplateMutation.mutate(templateForm);
    }
  }

  const worksheets = worksheetsData?.results || [];
  const templates = templatesData?.results || [];
  const printJobs = printJobsData?.results || [];
  const labelTemplates = labelTemplatesData?.results || [];

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
                        title="Export CSV"
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
                      {item.status !== 'CANCELLED' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Print Labels"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLabelWorksheetId(item.id);
                              setSelectedLabelTemplate('');
                              setLabelCopies(1);
                              setShowLabelDialog(true);
                            }}
                          >
                            <Tag className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Print Worksheet"
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
                        </>
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
                  key: 'label_count',
                  header: 'Labels',
                  sortable: true,
                  sortType: 'number',
                  cell: (item) => item.label_count,
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
                    {item.template_name} • {item.label_count} labels
                  </p>
                </div>
              )}
            />
          </TabsContent>

          <TabsContent value="templates" className="mt-4">
            {templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileSpreadsheet className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-sm font-medium text-muted-foreground mb-1">No templates yet</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Seed default lab worksheet templates to get started, or create your own.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => seedDefaultsMutation.mutate()}
                    disabled={seedDefaultsMutation.isPending}
                  >
                    {seedDefaultsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Seed Defaults
                  </Button>
                  <Button size="sm" onClick={openCreateTemplate}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Template
                  </Button>
                </div>
              </div>
            ) : (
            <>
              <div className="flex justify-end mb-3">
                <Button size="sm" onClick={openCreateTemplate}>
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">New Template</span>
                  <span className="sm:hidden">New</span>
                </Button>
              </div>
              <ResponsiveTable
                data={templates}
                keyExtractor={(item) => item.id}
                onRowClick={(item) => openEditTemplate(item)}
                columns={[
                  {
                    key: 'name',
                    header: 'Name',
                    sortable: true,
                    cell: (item) => (
                      <div>
                        <p className="font-medium">{item.name}</p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'group_by',
                    header: 'Group By',
                    sortable: true,
                    cell: (item) => item.group_by.replace('_', ' '),
                    hideOnMobile: true,
                  },
                  {
                    key: 'section_filter',
                    header: 'Section',
                    sortable: true,
                    cell: (item) => item.section_filter || '—',
                    hideOnMobile: true,
                  },
                  {
                    key: 'max_specimens_per_page',
                    header: 'Max/Page',
                    sortable: true,
                    sortType: 'number',
                    cell: (item) => item.max_specimens_per_page,
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
                  {
                    key: 'actions',
                    header: '',
                    cell: (item) => (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditTemplate(item)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteTemplateId(item.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ),
                  },
                ]}
                mobileCard={(item) => (
                  <div className="p-3 space-y-1">
                    <div className="flex justify-between items-center">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{item.name}</p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge
                          className={
                            item.is_active
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300'
                          }
                        >
                          {item.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditTemplate(item)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeleteTemplateId(item.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Group by {item.group_by.replace('_', ' ')} • {item.default_export_format} • {item.max_specimens_per_page}/page
                    </p>
                  </div>
                )}
              />
            </>
            )}
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

        {/* Create/Edit Template Dialog */}
        <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? 'Edit Template' : 'New Template'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              <div>
                <Label htmlFor="tpl-name">Name *</Label>
                <Input
                  id="tpl-name"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  placeholder="e.g., Hematology Worklist"
                />
              </div>
              <div>
                <Label htmlFor="tpl-desc">Description</Label>
                <Textarea
                  id="tpl-desc"
                  value={templateForm.description || ''}
                  onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                  placeholder="Brief description of this worksheet template"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Group By</Label>
                  <Select
                    value={templateForm.group_by}
                    onValueChange={(v) => setTemplateForm({ ...templateForm, group_by: v as WorksheetGroupBy })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SECTION">Section</SelectItem>
                      <SelectItem value="ANALYZER">Analyzer</SelectItem>
                      <SelectItem value="PRIORITY">Priority</SelectItem>
                      <SelectItem value="SPECIMEN_TYPE">Specimen Type</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Export Format</Label>
                  <Select
                    value={templateForm.default_export_format || 'PDF'}
                    onValueChange={(v) => setTemplateForm({ ...templateForm, default_export_format: v as WorksheetExportFormat })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PDF">PDF</SelectItem>
                      <SelectItem value="CSV">CSV</SelectItem>
                      <SelectItem value="ZPL">ZPL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="tpl-section">Section Filter</Label>
                  <Input
                    id="tpl-section"
                    value={templateForm.section_filter || ''}
                    onChange={(e) => setTemplateForm({ ...templateForm, section_filter: e.target.value })}
                    placeholder="e.g., HEMATOLOGY"
                  />
                </div>
                <div>
                  <Label htmlFor="tpl-max">Max Specimens/Page</Label>
                  <Input
                    id="tpl-max"
                    type="number"
                    min={1}
                    value={templateForm.max_specimens_per_page || 30}
                    onChange={(e) => setTemplateForm({ ...templateForm, max_specimens_per_page: parseInt(e.target.value) || 30 })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={templateForm.include_qc_slots || false}
                  onCheckedChange={(checked) => setTemplateForm({ ...templateForm, include_qc_slots: checked })}
                />
                <Label>Include QC slots</Label>
              </div>
              <div>
                <Label className="mb-2 block">Columns</Label>
                <div className="space-y-2">
                  {['specimen_barcode', 'patient_name', 'test_name', 'priority', 'collection_time', 'specimen_type', 'section'].map((col) => {
                    const selected = (templateForm.columns || []).includes(col);
                    return (
                      <label key={col} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {
                            const current = templateForm.columns || [];
                            const next = selected
                              ? current.filter((c) => c !== col)
                              : [...current, col];
                            setTemplateForm({ ...templateForm, columns: next });
                          }}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="text-sm">{col.replace(/_/g, ' ')}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTemplateDialog(false)} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button
                onClick={handleTemplateSubmit}
                disabled={!templateForm.name || createTemplateMutation.isPending || updateTemplateMutation.isPending}
                className="w-full sm:w-auto"
              >
                {(createTemplateMutation.isPending || updateTemplateMutation.isPending) ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {editingTemplate ? 'Save Changes' : 'Create Template'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Template Confirmation */}
        <AlertDialog open={deleteTemplateId !== null} onOpenChange={(open) => { if (!open) setDeleteTemplateId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete template?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the template. Worksheets already generated from it will not be affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => { if (deleteTemplateId) deleteTemplateMutation.mutate(deleteTemplateId); }}
              >
                {deleteTemplateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Print Labels Dialog */}
        <Dialog open={showLabelDialog} onOpenChange={setShowLabelDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Print Specimen Labels</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Label Template</Label>
                {labelTemplates.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-1">
                    No label templates configured. Create one in Lab Settings first.
                  </p>
                ) : (
                  <Select value={selectedLabelTemplate} onValueChange={setSelectedLabelTemplate}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a label template" />
                    </SelectTrigger>
                    <SelectContent>
                      {labelTemplates.map((lt) => (
                        <SelectItem key={lt.id} value={String(lt.id)}>
                          {lt.name} ({lt.label_type} • {lt.label_format})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label htmlFor="label-copies">Copies per specimen</Label>
                <Input
                  id="label-copies"
                  type="number"
                  min={1}
                  max={10}
                  value={labelCopies}
                  onChange={(e) => setLabelCopies(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowLabelDialog(false)} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button
                onClick={handlePrintLabels}
                disabled={!selectedLabelTemplate || generateLabelsMutation.isPending}
                className="w-full sm:w-auto"
              >
                {generateLabelsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Tag className="h-4 w-4 mr-2" />
                )}
                Generate Labels
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
