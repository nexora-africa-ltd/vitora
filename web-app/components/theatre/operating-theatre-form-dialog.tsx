'use client';

import { CalendarDays, Clock3, Loader2, Settings, Wrench } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { THEATRE_TYPES } from '@/lib/schemas/theatre.schema';
import type { OperatingTheatreCreateData, TheatreType } from '@/lib/types/theatre';
import { THEATRE_TYPE_LABELS } from '@/components/theatre/theatre-display';

interface OperatingTheatreFormDialogProps {
  open: boolean;
  editingId: number | null;
  form: OperatingTheatreCreateData;
  formErrors: Record<string, string>;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onFieldChange: (
    field: keyof OperatingTheatreCreateData,
    value: OperatingTheatreCreateData[keyof OperatingTheatreCreateData]
  ) => void;
  onSubmit: () => void;
}

export function OperatingTheatreFormDialog({
  open,
  editingId,
  form,
  formErrors,
  isPending,
  onOpenChange,
  onFieldChange,
  onSubmit,
}: OperatingTheatreFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingId ? 'Edit Operating Theatre' : 'Create Operating Theatre'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="theatre-code">Code</Label>
            <Input id="theatre-code" value={form.code} onChange={(event) => onFieldChange('code', event.target.value)} placeholder="OT-01" />
            {formErrors.code && <p className="text-sm text-destructive">{formErrors.code}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="theatre-name">Name</Label>
            <Input id="theatre-name" value={form.name} onChange={(event) => onFieldChange('name', event.target.value)} placeholder="Operating Theatre 1" />
            {formErrors.name && <p className="text-sm text-destructive">{formErrors.name}</p>}
          </div>
          <div className="space-y-2">
            <Label>Theatre Type</Label>
            <Select value={form.theatre_type} onValueChange={(value) => onFieldChange('theatre_type', value as TheatreType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THEATRE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{THEATRE_TYPE_LABELS[type]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="theatre-location">Location</Label>
            <Input id="theatre-location" value={form.location || ''} onChange={(event) => onFieldChange('location', event.target.value)} placeholder="Block A, 2nd Floor" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hours-start">Operating Hours Start</Label>
            <Input id="hours-start" type="time" value={form.operating_hours_start || '08:00'} onChange={(event) => onFieldChange('operating_hours_start', event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hours-end">Operating Hours End</Label>
            <Input id="hours-end" type="time" value={form.operating_hours_end || '18:00'} onChange={(event) => onFieldChange('operating_hours_end', event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slot-duration">Slot Duration (Minutes)</Label>
            <Input
              id="slot-duration"
              type="number"
              min={5}
              step={5}
              value={form.slot_duration_minutes ?? 30}
              onChange={(event) => onFieldChange('slot_duration_minutes', Number(event.target.value) || 30)}
            />
          </div>
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Inactive theatres keep their scheduling resource but are excluded from active use.</p>
              </div>
              <Switch checked={form.is_active ?? true} onCheckedChange={(checked) => onFieldChange('is_active', checked)} />
            </div>
          </div>
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Laminar Flow</p>
                <p className="text-xs text-muted-foreground">Mark this if the theatre is equipped for laminar-flow procedures.</p>
              </div>
              <Switch checked={form.has_laminar_flow ?? false} onCheckedChange={(checked) => onFieldChange('has_laminar_flow', checked)} />
            </div>
          </div>
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Cath Lab</p>
                <p className="text-xs text-muted-foreground">Use this for hybrid or interventional rooms with cath-lab capability.</p>
              </div>
              <Switch checked={form.has_cath_lab ?? false} onCheckedChange={(checked) => onFieldChange('has_cath_lab', checked)} />
            </div>
          </div>
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Image Intensifier</p>
                <p className="text-xs text-muted-foreground">Enable for theatres that support intra-operative fluoroscopy or C-arm workflows.</p>
              </div>
              <Switch checked={form.has_image_intensifier ?? false} onCheckedChange={(checked) => onFieldChange('has_image_intensifier', checked)} />
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="equipment-notes">Equipment Notes</Label>
            <Textarea id="equipment-notes" rows={3} value={form.equipment_notes || ''} onChange={(event) => onFieldChange('equipment_notes', event.target.value)} placeholder="Microscope, arthroscopy tower, anesthesia workstation..." />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="maintenance-notes">Maintenance Notes</Label>
            <Textarea id="maintenance-notes" rows={3} value={form.maintenance_notes || ''} onChange={(event) => onFieldChange('maintenance_notes', event.target.value)} placeholder="Recent service window, known limitations, preventive maintenance notes..." />
          </div>
        </div>

        <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Resource Sync</p>
              <p className="text-xs text-muted-foreground">Saving updates the linked scheduling PLACE resource automatically.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Recurring Schedules</p>
              <p className="text-xs text-muted-foreground">Working hours are mirrored to recurring scheduling slots for all seven days.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Wrench className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Availability Source</p>
              <p className="text-xs text-muted-foreground">Theatre booking uses the scheduling resource once the sync is in place.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={isPending || !form.code.trim() || !form.name.trim()} onClick={onSubmit}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Settings className="mr-2 h-4 w-4" />}
            {editingId ? 'Save Changes' : 'Create Theatre'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
