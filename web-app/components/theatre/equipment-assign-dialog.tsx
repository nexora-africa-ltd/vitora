'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HelpPopover } from '@/components/shared/help-popover';
import { theatreApi } from '@/lib/api/theatre';
import type { CaseEquipmentCreateData } from '@/lib/types/theatre';

interface EquipmentAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStartTime: string;
  defaultEndTime: string;
  onSubmit: (data: CaseEquipmentCreateData) => void;
  submitting: boolean;
}

export function EquipmentAssignDialog({
  open,
  onOpenChange,
  defaultStartTime,
  defaultEndTime,
  onSubmit,
  submitting,
}: EquipmentAssignDialogProps) {
  const [mode, setMode] = useState<'type' | 'resource'>('type');
  const [equipmentTypeId, setEquipmentTypeId] = useState<string>('');
  const [reservedFrom, setReservedFrom] = useState(defaultStartTime);
  const [reservedUntil, setReservedUntil] = useState(defaultEndTime);
  const [notes, setNotes] = useState('');

  const equipmentTypesQuery = useQuery({
    queryKey: ['theatre-equipment-types-select'],
    queryFn: () => theatreApi.listEquipmentTypes({ page_size: 200, is_active: true }),
    enabled: open,
  });

  const equipmentTypes = equipmentTypesQuery.data?.results ?? [];

  function handleSubmit() {
    const data: CaseEquipmentCreateData = {
      reserved_from: reservedFrom,
      reserved_until: reservedUntil,
      notes: notes || undefined,
    };
    if (mode === 'type' && equipmentTypeId) {
      data.equipment_type = parseInt(equipmentTypeId);
    }
    onSubmit(data);
  }

  function handleOpenChange(value: boolean) {
    if (!value) {
      setEquipmentTypeId('');
      setNotes('');
      setReservedFrom(defaultStartTime);
      setReservedUntil(defaultEndTime);
    }
    onOpenChange(value);
  }

  const canSubmit = equipmentTypeId && reservedFrom && reservedUntil;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Add Equipment Requirement</DialogTitle>
            <HelpPopover content="Assign equipment to this surgery case. Select an equipment type and specify the time window the equipment is needed." />
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Equipment Type</Label>
            <Select value={equipmentTypeId} onValueChange={setEquipmentTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select equipment type..." />
              </SelectTrigger>
              <SelectContent>
                {equipmentTypes.map((eq) => (
                  <SelectItem key={eq.id} value={String(eq.id)}>
                    {eq.name} ({eq.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="eq-from">From</Label>
              <Input
                id="eq-from"
                type="time"
                value={reservedFrom}
                onChange={(e) => setReservedFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eq-until">Until</Label>
              <Input
                id="eq-until"
                type="time"
                value={reservedUntil}
                onChange={(e) => setReservedUntil(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-notes">Notes</Label>
            <Input
              id="eq-notes"
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => handleOpenChange(false)} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !canSubmit} className="w-full sm:w-auto">
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Equipment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
