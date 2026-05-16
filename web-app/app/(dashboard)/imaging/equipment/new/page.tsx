/**
 * Create New Imaging Equipment Page
 * RBAC-gated: only imaging.manage_equipment roles can access.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
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
import { imagingApi } from '@/lib/api/imaging';
import { MODALITY_LABELS } from '@/lib/types/imaging';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { toast } from '@/lib/hooks';

interface EquipmentForm {
  name: string;
  modality: string;
  ae_title: string;
  station_name: string;
  manufacturer: string;
  model_name: string;
  serial_number: string;
  software_versions: string;
  room: string;
  installed_date: string;
  last_calibration_date: string;
  next_calibration_due: string;
  notes: string;
}

const INITIAL_FORM: EquipmentForm = {
  name: '',
  modality: '',
  ae_title: '',
  station_name: '',
  manufacturer: '',
  model_name: '',
  serial_number: '',
  software_versions: '',
  room: '',
  installed_date: '',
  last_calibration_date: '',
  next_calibration_due: '',
  notes: '',
};

export default function NewEquipmentPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { canPerformAction } = usePermissions();
  const canManage = canPerformAction('imaging.manage_equipment');

  const [form, setForm] = useState<EquipmentForm>(INITIAL_FORM);

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      imagingApi.createEquipment(data),
    onSuccess: (result) => {
      toast({ title: 'Equipment created' });
      queryClient.invalidateQueries({ queryKey: ['imaging-equipment'] });
      router.push(`/imaging/equipment/${result.id}`);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create equipment.', variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.modality) {
      toast({ title: 'Validation', description: 'Name and modality are required.', variant: 'destructive' });
      return;
    }
    // Build payload, omitting empty strings
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(form)) {
      if (value !== '') {
        payload[key] = value;
      }
    }
    createMutation.mutate(payload);
  };

  if (!canManage) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        You do not have permission to create equipment.
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Add Equipment"
        helpContent="Register new imaging equipment manually. Fields like AE Title and station name are used to match incoming DICOM studies to this equipment record."
      />

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Equipment Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="e.g. GE Discovery CT750 HD"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modality">Modality *</Label>
              <Select
                value={form.modality}
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
                placeholder="e.g. CT_SCANNER_1"
                value={form.ae_title}
                onChange={(e) => setForm((f) => ({ ...f, ae_title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="station_name">Station Name</Label>
              <Input
                id="station_name"
                placeholder="e.g. CT_ROOM_A"
                value={form.station_name}
                onChange={(e) => setForm((f) => ({ ...f, station_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manufacturer">Manufacturer</Label>
              <Input
                id="manufacturer"
                placeholder="e.g. GE Healthcare"
                value={form.manufacturer}
                onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model_name">Model</Label>
              <Input
                id="model_name"
                placeholder="e.g. Discovery CT750 HD"
                value={form.model_name}
                onChange={(e) => setForm((f) => ({ ...f, model_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serial_number">Serial Number</Label>
              <Input
                id="serial_number"
                placeholder="e.g. SN-2024-12345"
                value={form.serial_number}
                onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="software_versions">Software Versions</Label>
              <Input
                id="software_versions"
                placeholder="e.g. v4.1.2"
                value={form.software_versions}
                onChange={(e) => setForm((f) => ({ ...f, software_versions: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="room">Room / Location</Label>
              <Input
                id="room"
                placeholder="e.g. Radiology Room 3"
                value={form.room}
                onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="installed_date">Installed Date</Label>
              <Input
                id="installed_date"
                type="date"
                value={form.installed_date}
                onChange={(e) => setForm((f) => ({ ...f, installed_date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_calibration_date">Last Calibration</Label>
              <Input
                id="last_calibration_date"
                type="date"
                value={form.last_calibration_date}
                onChange={(e) => setForm((f) => ({ ...f, last_calibration_date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next_calibration_due">Next Calibration Due</Label>
              <Input
                id="next_calibration_due"
                type="date"
                value={form.next_calibration_due}
                onChange={(e) => setForm((f) => ({ ...f, next_calibration_due: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any additional notes about this equipment..."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/imaging/equipment')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Equipment'}
          </Button>
        </div>
      </form>
    </div>
  );
}
