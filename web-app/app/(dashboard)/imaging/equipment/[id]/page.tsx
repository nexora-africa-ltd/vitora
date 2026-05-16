/**
 * Imaging Equipment Detail Page
 * Shows equipment info, allows inline editing and deletion (RBAC-gated).
 */
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Skeleton } from '@/components/ui/skeleton';
import { ModalityBadge } from '@/components/imaging';
import { imagingApi } from '@/lib/api/imaging';
import { ImagingEquipment, ImagingModality, MODALITY_LABELS } from '@/lib/types/imaging';
import { formatDate } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { toast } from '@/lib/hooks';
import {
  Pencil,
  Trash2,
  AlertTriangle,
  Bot,
  Cpu,
  CalendarClock,
  X,
  Save,
} from 'lucide-react';

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { canPerformAction } = usePermissions();
  const canManage = canPerformAction('imaging.manage_equipment');

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<ImagingEquipment>>({});

  const equipmentId = Number(id);

  const { data: equipment, isLoading, refetch } = useQuery({
    queryKey: ['imaging-equipment', equipmentId],
    queryFn: () => imagingApi.getEquipment(equipmentId),
    enabled: !isNaN(equipmentId),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<ImagingEquipment>) =>
      imagingApi.updateEquipment(equipmentId, data),
    onSuccess: () => {
      toast({ title: 'Equipment updated' });
      setEditing(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['imaging-equipment'] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update equipment.', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => imagingApi.deleteEquipment(equipmentId),
    onSuccess: () => {
      toast({ title: 'Equipment removed' });
      queryClient.invalidateQueries({ queryKey: ['imaging-equipment'] });
      router.push('/imaging/equipment');
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete equipment.', variant: 'destructive' });
    },
  });

  const startEditing = () => {
    if (!equipment) return;
    setForm({
      name: equipment.name,
      modality: equipment.modality,
      ae_title: equipment.ae_title,
      station_name: equipment.station_name,
      manufacturer: equipment.manufacturer,
      model_name: equipment.model_name,
      serial_number: equipment.serial_number,
      software_versions: equipment.software_versions,
      room: equipment.room,
      is_active: equipment.is_active,
      installed_date: equipment.installed_date,
      last_calibration_date: equipment.last_calibration_date,
      next_calibration_due: equipment.next_calibration_due,
      notes: equipment.notes,
    });
    setEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate(form);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!equipment) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Equipment not found.
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={equipment.name}
        helpContent="View and manage imaging equipment details, calibration dates, and configuration."
        actions={
          canManage ? (
            <div className="flex items-center gap-2">
              {!editing && (
                <Button variant="outline" size="sm" onClick={startEditing}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Equipment</AlertDialogTitle>
                    <AlertDialogDescription>
                      {equipment.studies_count > 0
                        ? 'This equipment has associated studies and will be deactivated (soft-deleted) instead of permanently removed.'
                        : 'This will permanently delete this equipment record. This action cannot be undone.'}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {equipment.studies_count > 0 ? 'Deactivate' : 'Delete'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : undefined
        }
      />

      {/* Summary bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex items-center gap-3 min-w-0">
          <Cpu className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {equipment.manufacturer && equipment.model_name
                ? `${equipment.manufacturer} ${equipment.model_name}`
                : equipment.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {equipment.serial_number && `S/N: ${equipment.serial_number}`}
              {equipment.ae_title && ` • AET: ${equipment.ae_title}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {equipment.auto_registered && (
            <Badge variant="secondary" className="gap-1">
              <Bot className="h-3 w-3" />
              Auto-registered
            </Badge>
          )}
          <ModalityBadge modality={equipment.modality as ImagingModality} />
          <Badge variant={equipment.is_active ? 'default' : 'secondary'}>
            {equipment.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </div>

      {/* Edit form or detail view */}
      {editing ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Edit Equipment</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
                disabled={updateMutation.isPending}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                <Save className="h-4 w-4 mr-1" />
                {updateMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name || ''}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modality">Modality</Label>
              <Select
                value={form.modality || ''}
                onValueChange={(v) => setForm((f) => ({ ...f, modality: v }))}
              >
                <SelectTrigger id="modality">
                  <SelectValue placeholder="Select modality" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MODALITY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ae_title">AE Title</Label>
              <Input
                id="ae_title"
                value={form.ae_title || ''}
                onChange={(e) => setForm((f) => ({ ...f, ae_title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="station_name">Station Name</Label>
              <Input
                id="station_name"
                value={form.station_name || ''}
                onChange={(e) => setForm((f) => ({ ...f, station_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manufacturer">Manufacturer</Label>
              <Input
                id="manufacturer"
                value={form.manufacturer || ''}
                onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model_name">Model</Label>
              <Input
                id="model_name"
                value={form.model_name || ''}
                onChange={(e) => setForm((f) => ({ ...f, model_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serial_number">Serial Number</Label>
              <Input
                id="serial_number"
                value={form.serial_number || ''}
                onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="software_versions">Software Versions</Label>
              <Input
                id="software_versions"
                value={form.software_versions || ''}
                onChange={(e) => setForm((f) => ({ ...f, software_versions: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="room">Room / Location</Label>
              <Input
                id="room"
                value={form.room || ''}
                onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="is_active">Status</Label>
              <Select
                value={form.is_active ? 'true' : 'false'}
                onValueChange={(v) => setForm((f) => ({ ...f, is_active: v === 'true' }))}
              >
                <SelectTrigger id="is_active">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="installed_date">Installed Date</Label>
              <Input
                id="installed_date"
                type="date"
                value={form.installed_date || ''}
                onChange={(e) => setForm((f) => ({ ...f, installed_date: e.target.value || null }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_calibration_date">Last Calibration</Label>
              <Input
                id="last_calibration_date"
                type="date"
                value={form.last_calibration_date || ''}
                onChange={(e) => setForm((f) => ({ ...f, last_calibration_date: e.target.value || null }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next_calibration_due">Next Calibration Due</Label>
              <Input
                id="next_calibration_due"
                type="date"
                value={form.next_calibration_due || ''}
                onChange={(e) => setForm((f) => ({ ...f, next_calibration_due: e.target.value || null }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes || ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Identity Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <DetailRow label="Name" value={equipment.name} />
              <DetailRow label="Modality" value={equipment.modality_display || MODALITY_LABELS[equipment.modality as ImagingModality] || equipment.modality} />
              <DetailRow label="AE Title" value={equipment.ae_title} />
              <DetailRow label="Station Name" value={equipment.station_name} />
              <DetailRow label="Serial Number" value={equipment.serial_number} />
              <DetailRow label="Room" value={equipment.room} />
            </CardContent>
          </Card>

          {/* Manufacturer Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Manufacturer Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <DetailRow label="Manufacturer" value={equipment.manufacturer} />
              <DetailRow label="Model" value={equipment.model_name} />
              <DetailRow label="Software" value={equipment.software_versions} />
              <DetailRow label="Installed" value={equipment.installed_date ? formatDate(equipment.installed_date) : null} />
              <DetailRow label="Studies" value={String(equipment.studies_count)} />
            </CardContent>
          </Card>

          {/* Calibration Card */}
          <Card className="sm:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="h-4 w-4" />
                Calibration & Maintenance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Last Calibration</p>
                  <p className="font-medium">
                    {equipment.last_calibration_date ? formatDate(equipment.last_calibration_date) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Next Due</p>
                  <p className="font-medium flex items-center gap-1">
                    {equipment.next_calibration_due ? formatDate(equipment.next_calibration_due) : '—'}
                    {equipment.is_calibration_overdue && (
                      <Badge variant="destructive" className="gap-1 ml-1">
                        <AlertTriangle className="h-3 w-3" />
                        Overdue
                      </Badge>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <p className="font-medium">
                    {equipment.is_active ? 'Active' : 'Inactive'}
                  </p>
                </div>
              </div>
              {equipment.notes && (
                <div className="mt-4 pt-3 border-t">
                  <p className="text-muted-foreground text-xs mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{equipment.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value || '—'}</span>
    </div>
  );
}
