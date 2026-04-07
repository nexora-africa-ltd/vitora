'use client';

import { useState } from 'react';
import {
  Eye,
  FileText,
  Loader2,
  Plus,
  Star,
  Trash2,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { printDischargeDocument } from '@/lib/documents';
import { useFacility } from '@/lib/context/facility-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { HelpPopover } from '@/components/shared/help-popover';
import {
  useDischargeTemplates,
  useCreateDischargeTemplate,
  useUpdateDischargeTemplate,
  useDeleteDischargeTemplate,
} from '@/lib/hooks/use-inpatient';
import type {
  DischargeTemplate,
  DischargeTemplateLayout,
  DischargeTemplateCreateData,
} from '@/lib/types/inpatient';

// =============================================================================
// Constants
// =============================================================================

const LAYOUT_OPTIONS: { value: DischargeTemplateLayout; label: string; description: string }[] = [
  { value: 'STANDARD', label: 'Standard', description: 'Narrative layout — flowing clinical sections' },
  { value: 'STRUCTURED', label: 'Structured', description: 'Labelled field grid — large hospital format' },
  { value: 'MINIMAL', label: 'Minimal', description: 'Compact single-page — dispensary / clinic' },
];

/** Sample content used for template previews. */
const SAMPLE_PREVIEW_CONTENT = `## Hospital Course

The patient was admitted with severe abdominal pain and vomiting. Investigations revealed a pseudocyst of the pancreas (K86.3). An abdominal ultrasound and serial blood work were performed. An ascitic drainage tube was inserted on day 6. The patient responded well to conservative management and was discharged in a stable condition.

## Physical Findings

On admission: alert, oriented, mildly dehydrated. Abdomen — distended with epigastric tenderness. Vitals stable. At discharge: clinically stable, abdomen soft, drain removed.

## Investigations Done

| Test | Date | Result |
|------|------|--------|
| Abdominal U/S | 06/11/2025 | Pseudocyst identified |
| CRP | 05/11/2025 | Elevated |
| Amylase | 05/11/2025 | 340 U/L (High) |
| Total Blood Count | 05/11/2025 | WBC 12.4 |
| Urea & Creatinine | 05/11/2025 | Normal |

## Management

Ascitic drainage tube insertion. IV fluids, analgesics, and antibiotics per protocol.

## Discharge Medications

1. Esomeprazole 40mg — Once daily for 5 days
2. Paracetamol 1g — Three times daily for 3 days

## Follow-up / TCA

Review at SOPC in 1 week. Bring all investigation results.`;

// =============================================================================
// Template Form
// =============================================================================

interface TemplateFormData {
  name: string;
  layout: DischargeTemplateLayout;
  header_title: string;
  header_subtitle: string;
  show_signature_lines: boolean;
  show_qr_code: boolean;
  is_default: boolean;
}

const EMPTY_FORM: TemplateFormData = {
  name: '',
  layout: 'STANDARD',
  header_title: '',
  header_subtitle: '',
  show_signature_lines: true,
  show_qr_code: true,
  is_default: false,
};

function TemplateForm({
  initial,
  onSubmit,
  onCancel,
  onPreview,
  isSubmitting,
  submitLabel,
}: {
  initial: TemplateFormData;
  onSubmit: (data: TemplateFormData) => void;
  onCancel: () => void;
  onPreview: (layout: DischargeTemplateLayout, headerTitle: string, showSig: boolean, showQr: boolean) => void;
  isSubmitting: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState<TemplateFormData>(initial);

  return (
    <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tpl-name">Template Name *</Label>
          <Input
            id="tpl-name"
            placeholder="e.g. General Discharge"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tpl-layout">Layout</Label>
          <Select value={form.layout} onValueChange={(v) => setForm({ ...form, layout: v as DischargeTemplateLayout })}>
            <SelectTrigger id="tpl-layout">
              <SelectValue>
                {LAYOUT_OPTIONS.find((o) => o.value === form.layout)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {LAYOUT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div>
                    <span>{opt.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{opt.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tpl-header-title">
            Custom Header Title
            <HelpPopover content="Override the document title printed on the page. Leave blank to use 'Discharge Summary'." />
          </Label>
          <Input
            id="tpl-header-title"
            placeholder="Discharge Summary"
            value={form.header_title}
            onChange={(e) => setForm({ ...form, header_title: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tpl-header-subtitle">Header Subtitle</Label>
          <Input
            id="tpl-header-subtitle"
            placeholder="e.g. Clinical Department"
            value={form.header_subtitle}
            onChange={(e) => setForm({ ...form, header_subtitle: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch
            checked={form.show_signature_lines}
            onCheckedChange={(v) => setForm({ ...form, show_signature_lines: v })}
          />
          <Label className="text-sm">Signature Lines</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={form.show_qr_code}
            onCheckedChange={(v) => setForm({ ...form, show_qr_code: v })}
          />
          <Label className="text-sm">QR Code</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={form.is_default}
            onCheckedChange={(v) => setForm({ ...form, is_default: v })}
          />
          <Label className="text-sm font-medium">Set as Default</Label>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          <X className="mr-1.5 h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPreview(form.layout, form.header_title, form.show_signature_lines, form.show_qr_code)}
        >
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          Preview
        </Button>
        <Button size="sm" onClick={() => onSubmit(form)} disabled={isSubmitting || !form.name.trim()}>
          {isSubmitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Template Row
// =============================================================================

function TemplateRow({
  template,
  onEdit,
  onDelete,
  onPreview,
  isDeleting,
}: {
  template: DischargeTemplate;
  onEdit: (t: DischargeTemplate) => void;
  onDelete: (id: number) => void;
  onPreview: (t: DischargeTemplate) => void;
  isDeleting: boolean;
}) {
  const layoutInfo = LAYOUT_OPTIONS.find((l) => l.value === template.layout);

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm truncate">{template.name}</span>
          {template.is_default && (
            <Badge variant="default" className="shrink-0 gap-1 text-[10px]">
              <Star className="h-3 w-3" />
              Default
            </Badge>
          )}
          {!template.is_active && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">Inactive</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {layoutInfo?.label} — {layoutInfo?.description}
          {template.header_title ? ` • "${template.header_title}"` : ''}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button variant="ghost" size="sm" onClick={() => onPreview(template)} className="gap-1.5 text-xs">
          <Eye className="h-3.5 w-3.5" />
          Preview
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onEdit(template)} className="gap-1.5 text-xs">
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive" disabled={isDeleting}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Template</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &ldquo;{template.name}&rdquo;? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(template.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function DischargeTemplateSettings() {
  const { data: templateList, isLoading } = useDischargeTemplates({ is_active: undefined });
  const createMutation = useCreateDischargeTemplate();
  const updateMutation = useUpdateDischargeTemplate();
  const deleteMutation = useDeleteDischargeTemplate();
  const { facility, facilityDetail } = useFacility();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DischargeTemplate | null>(null);

  const templates = templateList?.results || [];

  /** Open a print preview window with sample data using the selected template's layout. */
  const handlePreview = (template: DischargeTemplate) => {
    printDischargeDocument({
      documentTitle: template.header_title || 'Discharge Summary',
      content: SAMPLE_PREVIEW_CONTENT,
      patientName: 'Jane Wanjiku Mwangi',
      patientMRN: 'MRN-20260407-0001',
      patientAge: '34 Years',
      patientSex: 'Female',
      wardName: 'Medical Ward',
      departmentName: 'General Medicine',
      admissionNumber: 'ADM-2026-00042',
      admissionDate: '2026-03-28T10:30:00Z',
      dischargeDate: new Date().toISOString(),
      admittingDiagnosis: 'Pseudocyst of Pancreas (K86.3)',
      consultantName: 'Dr. Amina Ochieng',
      facilityName: facility?.name || 'Sample Health Facility',
      facilityMflCode: facility?.mfl_code,
      facilityLocation: facilityDetail
        ? `${facilityDetail.sub_county_name}, ${facilityDetail.county_name}`
        : 'Nairobi',
      facilityLogoUrl: facilityDetail?.effective_logo_url,
      layout: template.layout,
      showSignatureLines: template.show_signature_lines,
      showQrCode: template.show_qr_code,
    });
  };

  const handleCreate = (data: TemplateFormData) => {
    const payload: DischargeTemplateCreateData = {
      name: data.name.trim(),
      layout: data.layout,
      header_title: data.header_title.trim(),
      header_subtitle: data.header_subtitle.trim(),
      show_signature_lines: data.show_signature_lines,
      show_qr_code: data.show_qr_code,
      is_default: data.is_default,
    };
    createMutation.mutate(payload, {
      onSuccess: () => {
        toast.success('Discharge template created');
        setShowCreateForm(false);
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to create template';
        toast.error(msg);
      },
    });
  };

  const handleUpdate = (data: TemplateFormData) => {
    if (!editingTemplate) return;
    updateMutation.mutate(
      {
        id: editingTemplate.id,
        data: {
          name: data.name.trim(),
          layout: data.layout,
          header_title: data.header_title.trim(),
          header_subtitle: data.header_subtitle.trim(),
          show_signature_lines: data.show_signature_lines,
          show_qr_code: data.show_qr_code,
          is_default: data.is_default,
        },
      },
      {
        onSuccess: () => {
          toast.success('Template updated');
          setEditingTemplate(null);
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Failed to update template';
          toast.error(msg);
        },
      },
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success('Template deleted'),
      onError: () => toast.error('Failed to delete template'),
    });
  };

  /** Preview from the create/edit form — uses the form's current values. */
  const handlePreviewFromForm = (
    layout: DischargeTemplateLayout,
    headerTitle: string,
    showSig: boolean,
    showQr: boolean,
  ) => {
    printDischargeDocument({
      documentTitle: headerTitle || 'Discharge Summary',
      content: SAMPLE_PREVIEW_CONTENT,
      patientName: 'Jane Wanjiku Mwangi',
      patientMRN: 'MRN-20260407-0001',
      patientAge: '34 Years',
      patientSex: 'Female',
      wardName: 'Medical Ward',
      departmentName: 'General Medicine',
      admissionNumber: 'ADM-2026-00042',
      admissionDate: '2026-03-28T10:30:00Z',
      dischargeDate: new Date().toISOString(),
      admittingDiagnosis: 'Pseudocyst of Pancreas (K86.3)',
      consultantName: 'Dr. Amina Ochieng',
      facilityName: facility?.name || 'Sample Health Facility',
      facilityMflCode: facility?.mfl_code,
      facilityLocation: facilityDetail
        ? `${facilityDetail.sub_county_name}, ${facilityDetail.county_name}`
        : 'Nairobi',
      facilityLogoUrl: facilityDetail?.effective_logo_url,
      layout,
      showSignatureLines: showSig,
      showQrCode: showQr,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base sm:text-lg">Discharge Templates</CardTitle>
            <HelpPopover content="Configure how discharge summaries are printed. Each template controls the print layout, header, and whether to include signatures and QR codes. Mark one as 'Default' for automatic use." />
          </div>
          {!showCreateForm && !editingTemplate && (
            <Button size="sm" variant="outline" onClick={() => setShowCreateForm(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New Template
            </Button>
          )}
        </div>
        <CardDescription>
          Control how discharge summaries print for this facility.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Create Form */}
        {showCreateForm && (
          <TemplateForm
            initial={EMPTY_FORM}
            onSubmit={handleCreate}
            onCancel={() => setShowCreateForm(false)}
            onPreview={handlePreviewFromForm}
            isSubmitting={createMutation.isPending}
            submitLabel="Create Template"
          />
        )}

        {/* Edit Form */}
        {editingTemplate && (
          <TemplateForm
            initial={{
              name: editingTemplate.name,
              layout: editingTemplate.layout,
              header_title: editingTemplate.header_title,
              header_subtitle: editingTemplate.header_subtitle,
              show_signature_lines: editingTemplate.show_signature_lines,
              show_qr_code: editingTemplate.show_qr_code,
              is_default: editingTemplate.is_default,
            }}
            onSubmit={handleUpdate}
            onCancel={() => setEditingTemplate(null)}
            onPreview={handlePreviewFromForm}
            isSubmitting={updateMutation.isPending}
            submitLabel="Save Changes"
          />
        )}

        {/* Separator between form and list */}
        {(showCreateForm || editingTemplate) && templates.length > 0 && <Separator />}

        {/* Template List */}
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading templates…
          </div>
        ) : templates.length === 0 && !showCreateForm ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            <FileText className="mx-auto h-8 w-8 mb-2 opacity-40" />
            <p>No discharge templates configured.</p>
            <p className="mt-1">Create one to customise how discharge summaries print.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((tpl) => (
              <TemplateRow
                key={tpl.id}
                template={tpl}
                onEdit={(t) => {
                  setShowCreateForm(false);
                  setEditingTemplate(t);
                }}
                onDelete={handleDelete}
                onPreview={handlePreview}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
