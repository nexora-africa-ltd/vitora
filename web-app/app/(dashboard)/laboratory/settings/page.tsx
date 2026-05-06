'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { laboratoryApi } from '@/lib/api/laboratory';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Cpu,
  Plus,
  Pencil,
  Power,
  PowerOff,
  RefreshCw,
  XCircle,
  MessageSquareText,
  Building2,
  Tag,
  Barcode,
  Settings2,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  Instrument,
  InterfaceType,
  SpecimenRejectionReason,
  ResultCommentTemplate,
  CommentTemplateCategory,
  ReferralLab,
  SampleLabelTemplate,
  LabelSize,
  LabBarcodeConfig,
  LabWorkflowSettings,
} from '@/lib/types/laboratory';

// =============================================================================
// Main Page
// =============================================================================

export default function LaboratorySettingsPage() {
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();
  const [tab, setTab] = useState('instruments');

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Lab Settings"
          helpContent="Manage laboratory instruments, specimen rejection reasons, result comment templates, referral labs, barcode configuration, sample label templates, and workflow preferences."
        />

        <Tabs value={tab} onValueChange={setTab}>
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="w-max sm:w-auto">
              <TabsTrigger value="instruments" className="gap-1.5">
                <Cpu className="h-4 w-4" />
                <span className="hidden sm:inline">Instruments</span>
              </TabsTrigger>
              <TabsTrigger value="rejection-reasons" className="gap-1.5">
                <XCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Rejections</span>
              </TabsTrigger>
              <TabsTrigger value="comments" className="gap-1.5">
                <MessageSquareText className="h-4 w-4" />
                <span className="hidden sm:inline">Comments</span>
              </TabsTrigger>
              <TabsTrigger value="referral-labs" className="gap-1.5">
                <Building2 className="h-4 w-4" />
                <span className="hidden sm:inline">Referral Labs</span>
              </TabsTrigger>
              <TabsTrigger value="labels" className="gap-1.5">
                <Tag className="h-4 w-4" />
                <span className="hidden sm:inline">Labels</span>
              </TabsTrigger>
              <TabsTrigger value="barcodes" className="gap-1.5">
                <Barcode className="h-4 w-4" />
                <span className="hidden sm:inline">Barcodes</span>
              </TabsTrigger>
              <TabsTrigger value="workflow" className="gap-1.5">
                <Settings2 className="h-4 w-4" />
                <span className="hidden sm:inline">Workflow</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="instruments" className="mt-4">
            <InstrumentsTab queryClient={queryClient} />
          </TabsContent>
          <TabsContent value="rejection-reasons" className="mt-4">
            <RejectionReasonsTab queryClient={queryClient} />
          </TabsContent>
          <TabsContent value="comments" className="mt-4">
            <CommentTemplatesTab queryClient={queryClient} />
          </TabsContent>
          <TabsContent value="referral-labs" className="mt-4">
            <ReferralLabsTab queryClient={queryClient} />
          </TabsContent>
          <TabsContent value="labels" className="mt-4">
            <LabelTemplatesTab queryClient={queryClient} />
          </TabsContent>
          <TabsContent value="barcodes" className="mt-4">
            <BarcodeConfigTab queryClient={queryClient} />
          </TabsContent>
          <TabsContent value="workflow" className="mt-4">
            <WorkflowSettingsTab queryClient={queryClient} />
          </TabsContent>
        </Tabs>
      </div>
    </PullToRefresh>
  );
}

// =============================================================================
// Instruments Tab
// =============================================================================

function InstrumentsTab({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Instrument | null>(null);

  const { data: instruments = [], isLoading } = useQuery<Instrument[]>({
    queryKey: ['instruments'],
    queryFn: () => laboratoryApi.listInstruments(),
  });

  const create = useMutation({
    mutationFn: (data: Partial<Instrument>) => laboratoryApi.createInstrument(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['instruments'] }); toast.success('Instrument registered'); setShowDialog(false); setEditing(null); },
    onError: () => toast.error('Failed to create instrument'),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Instrument> }) => laboratoryApi.updateInstrument(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['instruments'] }); toast.success('Instrument updated'); setShowDialog(false); setEditing(null); },
    onError: () => toast.error('Failed to update instrument'),
  });

  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => laboratoryApi.updateInstrument(id, { is_active }),
    onSuccess: (_, v) => { queryClient.invalidateQueries({ queryKey: ['instruments'] }); toast.success(v.is_active ? 'Activated' : 'Deactivated'); },
    onError: () => toast.error('Failed to update status'),
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base sm:text-lg">Instruments & Equipment</CardTitle>
          <Button size="sm" onClick={() => { setEditing(null); setShowDialog(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <ResponsiveTable
            data={instruments}
            keyExtractor={(i) => i.id}
            isLoading={isLoading}
            columns={[
              { key: 'code', header: 'Code', sortable: true, cell: (i) => <span className="font-mono text-sm">{i.code}</span> },
              { key: 'name', header: 'Name', sortable: true, cell: (i) => <div><p className="font-medium">{i.name}</p>{i.manufacturer && <p className="text-xs text-muted-foreground">{i.manufacturer} {i.model || ''}</p>}</div> },
              { key: 'department', header: 'Dept', sortable: true, cell: (i) => i.department || '—', hideOnMobile: true },
              { key: 'interface_type', header: 'Interface', sortable: true, cell: (i) => <Badge variant="outline">{i.interface_type_display}</Badge>, hideOnMobile: true },
              { key: 'is_active', header: 'Status', sortable: true, cell: (i) => <Badge className={i.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}>{i.is_active ? 'Active' : 'Inactive'}</Badge> },
              { key: 'actions', header: '', cell: (i) => <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(i); setShowDialog(true); }}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); toggle.mutate({ id: i.id, is_active: !i.is_active }); }}>{i.is_active ? <PowerOff className="h-4 w-4 text-muted-foreground" /> : <Power className="h-4 w-4 text-green-600" />}</Button></div> },
            ]}
            mobileCard={(i) => (
              <div className="flex items-center justify-between p-3">
                <div><p className="font-medium">{i.name}</p><p className="text-xs text-muted-foreground">{i.code} • {i.interface_type_display}</p></div>
                <div className="flex items-center gap-2">
                  <Badge className={`shrink-0 w-fit ${i.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>{i.is_active ? 'Active' : 'Inactive'}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(i); setShowDialog(true); }}><Pencil className="h-3 w-3" /></Button>
                </div>
              </div>
            )}
          />
        </CardContent>
      </Card>

      <InstrumentFormDialog
        open={showDialog}
        onOpenChange={(v) => { setShowDialog(v); if (!v) setEditing(null); }}
        instrument={editing}
        onSubmit={(data) => editing ? update.mutate({ id: editing.id, data }) : create.mutate(data)}
        isLoading={create.isPending || update.isPending}
      />
    </>
  );
}

// =============================================================================
// Rejection Reasons Tab
// =============================================================================

function RejectionReasonsTab({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<SpecimenRejectionReason | null>(null);

  const { data: reasons = [], isLoading } = useQuery({
    queryKey: ['rejection-reasons'],
    queryFn: () => laboratoryApi.listRejectionReasons(),
  });

  const create = useMutation({
    mutationFn: (data: Partial<SpecimenRejectionReason>) => laboratoryApi.createRejectionReason(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['rejection-reasons'] }); toast.success('Rejection reason added'); setShowDialog(false); },
    onError: () => toast.error('Failed to create'),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SpecimenRejectionReason> }) => laboratoryApi.updateRejectionReason(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['rejection-reasons'] }); toast.success('Updated'); setShowDialog(false); setEditing(null); },
    onError: () => toast.error('Failed to update'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => laboratoryApi.deleteRejectionReason(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['rejection-reasons'] }); toast.success('Deleted'); },
    onError: () => toast.error('Failed to delete'),
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg">Specimen Rejection Reasons</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Predefined reasons for specimen rejection, shown to lab techs when rejecting a sample</p>
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setShowDialog(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <ResponsiveTable
            data={reasons}
            keyExtractor={(r) => r.id}
            isLoading={isLoading}
            columns={[
              { key: 'code', header: 'Code', sortable: true, cell: (r) => <span className="font-mono text-sm">{r.code}</span> },
              { key: 'name', header: 'Name', sortable: true, cell: (r) => r.name },
              { key: 'requires_recollection', header: 'Recollect?', cell: (r) => r.requires_recollection ? <Badge variant="outline">Yes</Badge> : <span className="text-muted-foreground">No</span>, hideOnMobile: true },
              { key: 'is_active', header: 'Active', cell: (r) => <Badge className={r.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}>{r.is_active ? 'Yes' : 'No'}</Badge> },
              { key: 'actions', header: '', cell: (r) => <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(r); setShowDialog(true); }}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); remove.mutate(r.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></div> },
            ]}
            mobileCard={(r) => (
              <div className="flex items-center justify-between p-3">
                <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.code}{r.requires_recollection ? ' • Requires recollection' : ''}</p></div>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setShowDialog(true); }}><Pencil className="h-3 w-3" /></Button>
              </div>
            )}
          />
        </CardContent>
      </Card>

      <RejectionReasonDialog
        open={showDialog}
        onOpenChange={(v) => { setShowDialog(v); if (!v) setEditing(null); }}
        item={editing}
        onSubmit={(data) => editing ? update.mutate({ id: editing.id, data }) : create.mutate(data)}
        isLoading={create.isPending || update.isPending}
      />
    </>
  );
}

// =============================================================================
// Comment Templates Tab
// =============================================================================

function CommentTemplatesTab({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<ResultCommentTemplate | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['comment-templates'],
    queryFn: () => laboratoryApi.listCommentTemplates(),
  });

  const create = useMutation({
    mutationFn: (data: Partial<ResultCommentTemplate>) => laboratoryApi.createCommentTemplate(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['comment-templates'] }); toast.success('Template added'); setShowDialog(false); },
    onError: () => toast.error('Failed to create'),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ResultCommentTemplate> }) => laboratoryApi.updateCommentTemplate(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['comment-templates'] }); toast.success('Updated'); setShowDialog(false); setEditing(null); },
    onError: () => toast.error('Failed to update'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => laboratoryApi.deleteCommentTemplate(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['comment-templates'] }); toast.success('Deleted'); },
    onError: () => toast.error('Failed to delete'),
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg">Result Comment Templates</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Pre-canned interpretive comments that lab staff can quickly insert into results</p>
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setShowDialog(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <ResponsiveTable
            data={templates}
            keyExtractor={(t) => t.id}
            isLoading={isLoading}
            columns={[
              { key: 'code', header: 'Code', sortable: true, cell: (t) => <span className="font-mono text-sm">{t.code}</span> },
              { key: 'name', header: 'Name', sortable: true, cell: (t) => t.name },
              { key: 'category', header: 'Category', sortable: true, cell: (t) => <Badge variant="outline">{t.category_display}</Badge>, hideOnMobile: true },
              { key: 'text', header: 'Preview', cell: (t) => <span className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">{t.text}</span>, hideOnMobile: true },
              { key: 'actions', header: '', cell: (t) => <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(t); setShowDialog(true); }}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); remove.mutate(t.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></div> },
            ]}
            mobileCard={(t) => (
              <div className="flex items-center justify-between p-3">
                <div><p className="font-medium">{t.name}</p><p className="text-xs text-muted-foreground">{t.category_display} • {t.text.slice(0, 40)}…</p></div>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setShowDialog(true); }}><Pencil className="h-3 w-3" /></Button>
              </div>
            )}
          />
        </CardContent>
      </Card>

      <CommentTemplateDialog
        open={showDialog}
        onOpenChange={(v) => { setShowDialog(v); if (!v) setEditing(null); }}
        item={editing}
        onSubmit={(data) => editing ? update.mutate({ id: editing.id, data }) : create.mutate(data)}
        isLoading={create.isPending || update.isPending}
      />
    </>
  );
}

// =============================================================================
// Referral Labs Tab
// =============================================================================

function ReferralLabsTab({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<ReferralLab | null>(null);

  const { data: labs = [], isLoading } = useQuery({
    queryKey: ['referral-labs'],
    queryFn: () => laboratoryApi.listReferralLabs(),
  });

  const create = useMutation({
    mutationFn: (data: Partial<ReferralLab>) => laboratoryApi.createReferralLab(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['referral-labs'] }); toast.success('Referral lab added'); setShowDialog(false); },
    onError: () => toast.error('Failed to create'),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ReferralLab> }) => laboratoryApi.updateReferralLab(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['referral-labs'] }); toast.success('Updated'); setShowDialog(false); setEditing(null); },
    onError: () => toast.error('Failed to update'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => laboratoryApi.deleteReferralLab(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['referral-labs'] }); toast.success('Deleted'); },
    onError: () => toast.error('Failed to delete'),
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg">Referral / Outsourced Labs</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">External laboratories for send-out tests. Linked to orders with type &quot;External&quot;</p>
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setShowDialog(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <ResponsiveTable
            data={labs}
            keyExtractor={(l) => l.id}
            isLoading={isLoading}
            columns={[
              { key: 'code', header: 'Code', sortable: true, cell: (l) => <span className="font-mono text-sm">{l.code}</span> },
              { key: 'name', header: 'Name', sortable: true, cell: (l) => <div><p className="font-medium">{l.name}</p>{l.contact_person && <p className="text-xs text-muted-foreground">{l.contact_person}</p>}</div> },
              { key: 'phone', header: 'Contact', cell: (l) => l.phone || l.email || '—', hideOnMobile: true },
              { key: 'default_tat_days', header: 'TAT', sortable: true, cell: (l) => `${l.default_tat_days}d`, hideOnMobile: true },
              { key: 'is_active', header: 'Active', cell: (l) => <Badge className={l.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}>{l.is_active ? 'Yes' : 'No'}</Badge> },
              { key: 'actions', header: '', cell: (l) => <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(l); setShowDialog(true); }}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); remove.mutate(l.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></div> },
            ]}
            mobileCard={(l) => (
              <div className="flex items-center justify-between p-3">
                <div><p className="font-medium">{l.name}</p><p className="text-xs text-muted-foreground">{l.code} • TAT: {l.default_tat_days}d</p></div>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(l); setShowDialog(true); }}><Pencil className="h-3 w-3" /></Button>
              </div>
            )}
          />
        </CardContent>
      </Card>

      <ReferralLabDialog
        open={showDialog}
        onOpenChange={(v) => { setShowDialog(v); if (!v) setEditing(null); }}
        item={editing}
        onSubmit={(data) => editing ? update.mutate({ id: editing.id, data }) : create.mutate(data)}
        isLoading={create.isPending || update.isPending}
      />
    </>
  );
}

// =============================================================================
// Sample Label Templates Tab
// =============================================================================

function LabelTemplatesTab({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<SampleLabelTemplate | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['label-templates'],
    queryFn: () => laboratoryApi.listLabelTemplates(),
  });

  const create = useMutation({
    mutationFn: (data: Partial<SampleLabelTemplate>) => laboratoryApi.createLabelTemplate(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['label-templates'] }); toast.success('Label template added'); setShowDialog(false); },
    onError: () => toast.error('Failed to create'),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SampleLabelTemplate> }) => laboratoryApi.updateLabelTemplate(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['label-templates'] }); toast.success('Updated'); setShowDialog(false); setEditing(null); },
    onError: () => toast.error('Failed to update'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => laboratoryApi.deleteLabelTemplate(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['label-templates'] }); toast.success('Deleted'); },
    onError: () => toast.error('Failed to delete'),
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg">Sample Label Templates</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Configure what information appears on specimen container labels</p>
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setShowDialog(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <ResponsiveTable
            data={templates}
            keyExtractor={(t) => t.id}
            isLoading={isLoading}
            columns={[
              { key: 'name', header: 'Name', sortable: true, cell: (t) => <div><p className="font-medium">{t.name}</p>{t.is_default && <Badge variant="outline" className="text-xs">Default</Badge>}</div> },
              { key: 'label_size', header: 'Size', cell: (t) => t.label_size_display, hideOnMobile: true },
              { key: 'copies_per_specimen', header: 'Copies', cell: (t) => t.copies_per_specimen, hideOnMobile: true },
              { key: 'fields', header: 'Fields', cell: (t) => { const fields = [t.include_barcode && 'Barcode', t.include_patient_name && 'Name', t.include_mrn && 'MRN', t.include_test_name && 'Test', t.include_collection_date && 'Date'].filter(Boolean); return <span className="text-xs text-muted-foreground">{fields.join(', ')}</span>; }, hideOnMobile: true },
              { key: 'actions', header: '', cell: (t) => <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(t); setShowDialog(true); }}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); remove.mutate(t.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></div> },
            ]}
            mobileCard={(t) => (
              <div className="flex items-center justify-between p-3">
                <div><p className="font-medium">{t.name} {t.is_default && '(Default)'}</p><p className="text-xs text-muted-foreground">{t.label_size_display} • {t.copies_per_specimen} copies</p></div>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setShowDialog(true); }}><Pencil className="h-3 w-3" /></Button>
              </div>
            )}
          />
        </CardContent>
      </Card>

      <LabelTemplateDialog
        open={showDialog}
        onOpenChange={(v) => { setShowDialog(v); if (!v) setEditing(null); }}
        item={editing}
        onSubmit={(data) => editing ? update.mutate({ id: editing.id, data }) : create.mutate(data)}
        isLoading={create.isPending || update.isPending}
      />
    </>
  );
}

// =============================================================================
// Barcode Config Tab
// =============================================================================

function BarcodeConfigTab({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const { data: config, isLoading } = useQuery({
    queryKey: ['barcode-config'],
    queryFn: () => laboratoryApi.getBarcodeConfig(),
  });

  const update = useMutation({
    mutationFn: (data: Partial<LabBarcodeConfig>) => laboratoryApi.updateBarcodeConfig(config!.id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['barcode-config'] }); toast.success('Barcode config updated'); },
    onError: () => toast.error('Failed to update'),
  });

  const [form, setForm] = useState<Partial<LabBarcodeConfig>>({});

  const populatedForm = {
    prefix: form.prefix ?? config?.prefix ?? 'SP',
    sequence_length: form.sequence_length ?? config?.sequence_length ?? 6,
    include_date: form.include_date ?? config?.include_date ?? true,
    date_format: form.date_format ?? config?.date_format ?? 'YYYYMMDD',
    separator: form.separator ?? config?.separator ?? '-',
    barcode_format: form.barcode_format ?? config?.barcode_format ?? 'CODE128',
  };

  if (isLoading) return <Card><CardContent className="py-8 text-center text-muted-foreground">Loading...</CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">Barcode Configuration</CardTitle>
        <p className="text-xs text-muted-foreground">Configure how specimen barcodes are generated. Preview: <span className="font-mono font-medium">{config?.sample_barcode}</span></p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <Label>Prefix</Label>
            <Input className="mt-1 font-mono" value={populatedForm.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })} />
          </div>
          <div>
            <Label>Sequence Length</Label>
            <Input className="mt-1" type="number" min={3} max={10} value={populatedForm.sequence_length} onChange={(e) => setForm({ ...form, sequence_length: parseInt(e.target.value) || 6 })} />
          </div>
          <div>
            <Label>Separator</Label>
            <Input className="mt-1 font-mono" maxLength={1} value={populatedForm.separator} onChange={(e) => setForm({ ...form, separator: e.target.value })} />
          </div>
          <div>
            <Label>Date Format</Label>
            <Select value={populatedForm.date_format} onValueChange={(v) => setForm({ ...form, date_format: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="YYYYMMDD">YYYYMMDD</SelectItem>
                <SelectItem value="YYMMDD">YYMMDD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Barcode Format</Label>
            <Select value={populatedForm.barcode_format} onValueChange={(v) => setForm({ ...form, barcode_format: v as LabBarcodeConfig['barcode_format'] })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CODE128">Code 128</SelectItem>
                <SelectItem value="CODE39">Code 39</SelectItem>
                <SelectItem value="QR">QR Code</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-3 pb-1">
            <div className="flex items-center gap-2">
              <Switch checked={populatedForm.include_date} onCheckedChange={(v) => setForm({ ...form, include_date: v })} />
              <Label>Include Date</Label>
            </div>
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={() => update.mutate(populatedForm)} disabled={update.isPending}>
            {update.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </div>
        {config && (
          <p className="text-xs text-muted-foreground">Current sequence: {config.current_sequence} (next barcode will use #{config.current_sequence + 1})</p>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Workflow Settings Tab
// =============================================================================

function WorkflowSettingsTab({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['workflow-settings'],
    queryFn: () => laboratoryApi.getWorkflowSettings(),
  });

  const update = useMutation({
    mutationFn: (data: Partial<LabWorkflowSettings>) => laboratoryApi.updateWorkflowSettings(settings!.id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['workflow-settings'] }); toast.success('Workflow settings saved'); },
    onError: () => toast.error('Failed to save'),
  });

  if (isLoading) return <Card><CardContent className="py-8 text-center text-muted-foreground">Loading...</CardContent></Card>;
  if (!settings) return null;

  const toggle = (field: keyof LabWorkflowSettings) => {
    update.mutate({ [field]: !settings[field] });
  };

  const sections = [
    {
      title: 'Result Release & Verification',
      items: [
        { field: 'auto_release_normal_results' as const, label: 'Auto-release normal results', desc: 'Automatically release results within normal range without manual review' },
        { field: 'require_double_verification_critical' as const, label: 'Double verification for criticals', desc: 'Require two different staff members to verify critical results' },
      ],
    },
    {
      title: 'Printing',
      items: [
        { field: 'auto_print_on_verify' as const, label: 'Auto-print on verify', desc: 'Automatically print report when result is verified' },
        { field: 'auto_print_labels_on_collect' as const, label: 'Auto-print labels on collect', desc: 'Print specimen labels when sample is collected' },
      ],
    },
    {
      title: 'Notifications',
      items: [
        { field: 'notify_clinician_on_critical' as const, label: 'Alert on critical results', desc: 'Send alert to ordering clinician for critical results' },
        { field: 'notify_clinician_on_complete' as const, label: 'Notify on completion', desc: 'Notify ordering clinician when all results are ready' },
      ],
    },
    {
      title: 'Specimen Management',
      items: [
        { field: 'require_specimen_receipt' as const, label: 'Require specimen receipt', desc: 'Require explicit specimen receipt before processing can begin' },
        { field: 'specimen_rejection_requires_supervisor' as const, label: 'Supervisor approval for rejection', desc: 'Require supervisor approval to reject specimens' },
      ],
    },
    {
      title: 'Ordering',
      items: [
        { field: 'allow_duplicate_orders' as const, label: 'Allow duplicate orders', desc: 'Allow same test to be ordered for same patient within 24h' },
        { field: 'require_clinical_notes' as const, label: 'Require clinical notes', desc: 'Make clinical notes mandatory on all lab orders' },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {section.items.map((item) => (
              <div key={item.field} className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch
                  checked={settings[item.field] as boolean}
                  onCheckedChange={() => toggle(item.field)}
                  disabled={update.isPending}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">TAT Warning</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Label className="whitespace-nowrap">Warning threshold</Label>
            <Input
              type="number"
              className="w-20"
              min={50}
              max={95}
              value={settings.tat_warning_threshold_percent}
              onChange={(e) => update.mutate({ tat_warning_threshold_percent: parseInt(e.target.value) || 75 })}
            />
            <span className="text-sm text-muted-foreground">% of target elapsed before showing TAT warning</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Dialog Components
// =============================================================================

function InstrumentFormDialog({ open, onOpenChange, instrument, onSubmit, isLoading }: {
  open: boolean; onOpenChange: (v: boolean) => void; instrument: Instrument | null;
  onSubmit: (data: Partial<Instrument>) => void; isLoading: boolean;
}) {
  const [form, setForm] = useState({ code: '', name: '', manufacturer: '', model: '', serial_number: '', department: '', interface_type: 'MANUAL' as InterfaceType, is_active: true });

  const handleOpen = (v: boolean) => {
    if (v && instrument) setForm({ code: instrument.code, name: instrument.name, manufacturer: instrument.manufacturer || '', model: instrument.model || '', serial_number: instrument.serial_number || '', department: instrument.department || '', interface_type: instrument.interface_type, is_active: instrument.is_active });
    else if (v) setForm({ code: '', name: '', manufacturer: '', model: '', serial_number: '', department: '', interface_type: 'MANUAL', is_active: true });
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{instrument ? 'Edit Instrument' : 'Register Instrument'}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (form.code && form.name) onSubmit(form); }} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Code *</Label><Input className="mt-1 font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!instrument} placeholder="e.g. SYS-XN1000" /></div>
            <div><Label>Name *</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sysmex XN-1000" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Manufacturer</Label><Input className="mt-1" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></div>
            <div><Label>Model</Label><Input className="mt-1" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Serial Number</Label><Input className="mt-1" value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} /></div>
            <div><Label>Department</Label><Input className="mt-1" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Hematology" /></div>
          </div>
          <div>
            <Label>Interface Type</Label>
            <Select value={form.interface_type} onValueChange={(v) => setForm({ ...form, interface_type: v as InterfaceType })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MANUAL">Manual Entry</SelectItem>
                <SelectItem value="ASTM">ASTM / LIS2-A2</SelectItem>
                <SelectItem value="HL7_MLLP">HL7 v2 (MLLP)</SelectItem>
                <SelectItem value="FHIR">FHIR R4</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {instrument && (
            <div className="flex items-center gap-3"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>{form.is_active ? 'Active' : 'Inactive'}</Label></div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading || !form.code || !form.name}>{isLoading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}{instrument ? 'Save' : 'Register'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RejectionReasonDialog({ open, onOpenChange, item, onSubmit, isLoading }: {
  open: boolean; onOpenChange: (v: boolean) => void; item: SpecimenRejectionReason | null;
  onSubmit: (data: Partial<SpecimenRejectionReason>) => void; isLoading: boolean;
}) {
  const [form, setForm] = useState({ code: '', name: '', description: '', requires_recollection: true, is_active: true, display_order: 0 });

  const handleOpen = (v: boolean) => {
    if (v && item) setForm({ code: item.code, name: item.name, description: item.description, requires_recollection: item.requires_recollection, is_active: item.is_active, display_order: item.display_order });
    else if (v) setForm({ code: '', name: '', description: '', requires_recollection: true, is_active: true, display_order: 0 });
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{item ? 'Edit Rejection Reason' : 'Add Rejection Reason'}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (form.code && form.name) onSubmit(form); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Code *</Label><Input className="mt-1 font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. HEMOLYZED" /></div>
            <div><Label>Name *</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Hemolyzed sample" /></div>
          </div>
          <div><Label>Description</Label><Textarea className="mt-1" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="flex items-center gap-3"><Switch checked={form.requires_recollection} onCheckedChange={(v) => setForm({ ...form, requires_recollection: v })} /><Label>Requires recollection</Label></div>
          <div className="flex items-center gap-3"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading || !form.code || !form.name}>{isLoading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}{item ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CommentTemplateDialog({ open, onOpenChange, item, onSubmit, isLoading }: {
  open: boolean; onOpenChange: (v: boolean) => void; item: ResultCommentTemplate | null;
  onSubmit: (data: Partial<ResultCommentTemplate>) => void; isLoading: boolean;
}) {
  const [form, setForm] = useState({ code: '', name: '', text: '', category: 'GENERAL' as CommentTemplateCategory, is_active: true, display_order: 0 });

  const handleOpen = (v: boolean) => {
    if (v && item) setForm({ code: item.code, name: item.name, text: item.text, category: item.category, is_active: item.is_active, display_order: item.display_order });
    else if (v) setForm({ code: '', name: '', text: '', category: 'GENERAL', is_active: true, display_order: 0 });
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{item ? 'Edit Comment Template' : 'Add Comment Template'}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (form.code && form.name && form.text) onSubmit(form); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Code *</Label><Input className="mt-1 font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. RPT-2WK" /></div>
            <div><Label>Name *</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Repeat in 2 weeks" /></div>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as CommentTemplateCategory })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="GENERAL">General</SelectItem>
                <SelectItem value="CRITICAL">Critical Value</SelectItem>
                <SelectItem value="FOLLOW_UP">Follow-up</SelectItem>
                <SelectItem value="METHODOLOGY">Methodology Note</SelectItem>
                <SelectItem value="QUALITY">Quality Note</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Comment Text *</Label><Textarea className="mt-1" rows={3} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="The full comment text that will be inserted..." /></div>
          <div className="flex items-center gap-3"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading || !form.code || !form.name || !form.text}>{isLoading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}{item ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReferralLabDialog({ open, onOpenChange, item, onSubmit, isLoading }: {
  open: boolean; onOpenChange: (v: boolean) => void; item: ReferralLab | null;
  onSubmit: (data: Partial<ReferralLab>) => void; isLoading: boolean;
}) {
  const [form, setForm] = useState({ code: '', name: '', address: '', contact_person: '', phone: '', email: '', website: '', tests_offered: '', default_tat_days: 7, courier_schedule: '', notes: '', is_active: true });

  const handleOpen = (v: boolean) => {
    if (v && item) setForm({ code: item.code, name: item.name, address: item.address, contact_person: item.contact_person, phone: item.phone, email: item.email, website: item.website, tests_offered: item.tests_offered, default_tat_days: item.default_tat_days, courier_schedule: item.courier_schedule, notes: item.notes, is_active: item.is_active });
    else if (v) setForm({ code: '', name: '', address: '', contact_person: '', phone: '', email: '', website: '', tests_offered: '', default_tat_days: 7, courier_schedule: '', notes: '', is_active: true });
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{item ? 'Edit Referral Lab' : 'Add Referral Lab'}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (form.code && form.name) onSubmit(form); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Code *</Label><Input className="mt-1 font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. LANCET" /></div>
            <div><Label>Name *</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Lancet Laboratories" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Contact Person</Label><Input className="mt-1" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
            <div><Label>Phone</Label><Input className="mt-1" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input className="mt-1" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Default TAT (days)</Label><Input className="mt-1" type="number" min={1} value={form.default_tat_days} onChange={(e) => setForm({ ...form, default_tat_days: parseInt(e.target.value) || 7 })} /></div>
          </div>
          <div><Label>Address</Label><Textarea className="mt-1" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><Label>Courier Schedule</Label><Input className="mt-1" value={form.courier_schedule} onChange={(e) => setForm({ ...form, courier_schedule: e.target.value })} placeholder="e.g. Mon/Wed/Fri 8am pickup" /></div>
          <div><Label>Tests Offered</Label><Textarea className="mt-1" rows={2} value={form.tests_offered} onChange={(e) => setForm({ ...form, tests_offered: e.target.value })} placeholder="Comma-separated test codes or description" /></div>
          <div><Label>Notes</Label><Textarea className="mt-1" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex items-center gap-3"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading || !form.code || !form.name}>{isLoading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}{item ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LabelTemplateDialog({ open, onOpenChange, item, onSubmit, isLoading }: {
  open: boolean; onOpenChange: (v: boolean) => void; item: SampleLabelTemplate | null;
  onSubmit: (data: Partial<SampleLabelTemplate>) => void; isLoading: boolean;
}) {
  const [form, setForm] = useState({ name: '', label_size: 'MEDIUM' as LabelSize, include_barcode: true, include_patient_name: true, include_mrn: true, include_dob: false, include_collection_date: true, include_test_name: true, include_specimen_type: true, include_priority: false, copies_per_specimen: 1, is_default: false, is_active: true });

  const handleOpen = (v: boolean) => {
    if (v && item) setForm({ name: item.name, label_size: item.label_size, include_barcode: item.include_barcode, include_patient_name: item.include_patient_name, include_mrn: item.include_mrn, include_dob: item.include_dob, include_collection_date: item.include_collection_date, include_test_name: item.include_test_name, include_specimen_type: item.include_specimen_type, include_priority: item.include_priority, copies_per_specimen: item.copies_per_specimen, is_default: item.is_default, is_active: item.is_active });
    else if (v) setForm({ name: '', label_size: 'MEDIUM', include_barcode: true, include_patient_name: true, include_mrn: true, include_dob: false, include_collection_date: true, include_test_name: true, include_specimen_type: true, include_priority: false, copies_per_specimen: 1, is_default: false, is_active: true });
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{item ? 'Edit Label Template' : 'Add Label Template'}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (form.name) onSubmit(form); }} className="space-y-4">
          <div><Label>Name *</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Standard Tube Label" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Label Size</Label>
              <Select value={form.label_size} onValueChange={(v) => setForm({ ...form, label_size: v as LabelSize })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SMALL">Small (25×10mm)</SelectItem>
                  <SelectItem value="MEDIUM">Medium (50×25mm)</SelectItem>
                  <SelectItem value="LARGE">Large (75×25mm)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Copies per Specimen</Label><Input className="mt-1" type="number" min={1} max={5} value={form.copies_per_specimen} onChange={(e) => setForm({ ...form, copies_per_specimen: parseInt(e.target.value) || 1 })} /></div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Include on Label:</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['include_barcode', 'Barcode'],
                ['include_patient_name', 'Patient Name'],
                ['include_mrn', 'MRN'],
                ['include_dob', 'Date of Birth'],
                ['include_collection_date', 'Collection Date'],
                ['include_test_name', 'Test Name'],
                ['include_specimen_type', 'Specimen Type'],
                ['include_priority', 'Priority'],
              ] as const).map(([field, label]) => (
                <div key={field} className="flex items-center gap-2">
                  <Switch checked={form[field]} onCheckedChange={(v) => setForm({ ...form, [field]: v })} />
                  <Label className="text-sm">{label}</Label>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3"><Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} /><Label>Set as default template</Label></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading || !form.name}>{isLoading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}{item ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
