'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useFacility } from '@/lib/context/facility-context';
import { shiftsApi, shiftSwapsApi } from '@/lib/api/scheduling';
import type { ShiftSwapCreateData, ShiftListItem } from '@/lib/types/scheduling';
import { toast } from 'sonner';
import { format, parseISO, addDays } from 'date-fns';

export default function NewShiftSwapPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { facility: activeFacility } = useFacility();

  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [targetShiftId, setTargetShiftId] = useState<string>('');
  const [isPartial, setIsPartial] = useState(false);
  const [partialStartTime, setPartialStartTime] = useState('');
  const [partialEndTime, setPartialEndTime] = useState('');
  const [reason, setReason] = useState('');

  // Fetch current user's upcoming scheduled shifts
  const { data: myShiftsData } = useQuery({
    queryKey: ['scheduling-shifts', 'my-upcoming', activeFacility?.id],
    queryFn: () =>
      shiftsApi.list({
        status: 'SCHEDULED',
        from_date: new Date().toISOString().split('T')[0],
        to_date: addDays(new Date(), 30).toISOString().split('T')[0],
      }),
    enabled: !!activeFacility,
  });

  const myShifts = myShiftsData?.results ?? [];

  // Fetch all SCHEDULED shifts in the facility for target selection
  const { data: allShiftsData } = useQuery({
    queryKey: ['scheduling-shifts', 'all-upcoming', activeFacility?.id],
    queryFn: () =>
      shiftsApi.list({
        status: 'SCHEDULED',
        from_date: new Date().toISOString().split('T')[0],
        to_date: addDays(new Date(), 30).toISOString().split('T')[0],
        page_size: 200,
      }),
    enabled: !!activeFacility,
  });

  // Filter out the requester's own shifts and the selected shift
  const selectedShift = myShifts.find((s) => String(s.id) === selectedShiftId);
  const targetShifts = (allShiftsData?.results ?? []).filter((s) => {
    if (!selectedShift) return false;
    // Exclude shifts belonging to the same staff resource
    return s.staff_resource !== selectedShift.staff_resource;
  });

  const createMutation = useMutation({
    mutationFn: (data: ShiftSwapCreateData) => shiftSwapsApi.create(data),
    onSuccess: () => {
      toast.success('Swap request created');
      queryClient.invalidateQueries({ queryKey: ['shift-swaps'] });
      queryClient.invalidateQueries({ queryKey: ['shift-swaps-my'] });
      queryClient.invalidateQueries({ queryKey: ['shift-swaps-available'] });
      router.push('/scheduling/shift-swaps');
    },
    onError: (err: Error & { response?: { data?: Record<string, string[]> } }) => {
      const detail = err.response?.data;
      if (detail && typeof detail === 'object') {
        const messages = Object.values(detail).flat().join(', ');
        toast.error(messages || 'Failed to create swap request');
      } else {
        toast.error('Failed to create swap request');
      }
    },
  });

  const handleSubmit = () => {
    if (!selectedShiftId) {
      toast.error('Please select a shift to swap');
      return;
    }

    const data: ShiftSwapCreateData = {
      requesting_shift: Number(selectedShiftId),
    };

    if (targetShiftId) {
      data.target_shift = Number(targetShiftId);
    }

    if (isPartial) {
      data.is_partial = true;
      if (partialStartTime) data.partial_start_time = partialStartTime;
      if (partialEndTime) data.partial_end_time = partialEndTime;
    }

    if (reason.trim()) {
      data.reason = reason.trim();
    }

    createMutation.mutate(data);
  };

  const formatShiftLabel = (shift: ShiftListItem) =>
    `${format(parseISO(shift.shift_date), 'MMM d')} — ${shift.shift_type_display} (${shift.start_time}–${shift.end_time})`;

  const formatTargetShiftLabel = (shift: ShiftListItem) =>
    `${shift.staff_resource_name} — ${format(parseISO(shift.shift_date), 'MMM d')} ${shift.shift_type_display} (${shift.start_time}–${shift.end_time})`;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title="New Swap Request"
        helpContent="Request to swap one of your upcoming shifts. You can target a specific colleague or post an open swap for anyone to accept."
      />

      {/* Shift Selection */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Your Shift</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shift-select">Select shift to swap *</Label>
            <Select value={selectedShiftId} onValueChange={(val) => { setSelectedShiftId(val); setTargetShiftId(''); }}>
              <SelectTrigger id="shift-select">
                <SelectValue placeholder="Choose a scheduled shift..." />
              </SelectTrigger>
              <SelectContent>
                {myShifts.length === 0 ? (
                  <SelectItem value="_none">
                    No upcoming scheduled shifts
                  </SelectItem>
                ) : (
                  myShifts.map((shift) => (
                    <SelectItem key={shift.id} value={String(shift.id)}>
                      {formatShiftLabel(shift)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Target (Optional) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Target Shift (Optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Leave empty to post an open swap request that any colleague can accept.
          </p>
          <div className="space-y-2">
            <Label htmlFor="target-shift">Colleague&apos;s shift</Label>
            <Select
              value={targetShiftId}
              onValueChange={(val) => setTargetShiftId(val === '_clear' ? '' : val)}
              disabled={!selectedShiftId}
            >
              <SelectTrigger id="target-shift">
                <SelectValue placeholder={selectedShiftId ? 'Open swap (anyone can accept)' : 'Select your shift first'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_clear">
                  <span className="text-muted-foreground italic">Open swap (anyone)</span>
                </SelectItem>
                {targetShifts.map((shift) => (
                  <SelectItem key={shift.id} value={String(shift.id)}>
                    {formatTargetShiftLabel(shift)}
                  </SelectItem>
                ))}
                {targetShifts.length === 0 && selectedShiftId && (
                  <SelectItem value="_no_results">
                    No other scheduled shifts found
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Partial Swap */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Partial Swap</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 w-fit cursor-default">
                  <Switch checked={isPartial} onCheckedChange={setIsPartial} />
                  <span className="text-sm font-medium">
                    {isPartial ? 'Partial Swap' : 'Full Swap'}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Switch to {isPartial ? 'full swap' : 'partial swap (specific hours only)'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {isPartial && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="partial-start">Start Time</Label>
                <Input
                  id="partial-start"
                  type="time"
                  value={partialStartTime}
                  onChange={(e) => setPartialStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partial-end">End Time</Label>
                <Input
                  id="partial-end"
                  type="time"
                  value={partialEndTime}
                  onChange={(e) => setPartialEndTime(e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reason */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Reason</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Briefly explain why you need to swap this shift..."
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={() => router.push('/scheduling/shift-swaps')}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!selectedShiftId || createMutation.isPending}
        >
          <ArrowLeftRight className="h-4 w-4 mr-2" />
          Submit Swap Request
        </Button>
      </div>
    </div>
  );
}
