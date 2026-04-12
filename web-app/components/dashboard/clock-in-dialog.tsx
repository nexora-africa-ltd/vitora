'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LogIn, MapPin, Stethoscope, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { clinicsApi } from '@/lib/api/clinics';
import type { ClinicRoom } from '@/lib/types/clinic';

interface ClockInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: { clinic_id?: number; room_id?: number }) => void;
  isPending: boolean;
}

export function ClockInDialog({ open, onOpenChange, onConfirm, isPending }: ClockInDialogProps) {
  const [selectedClinicId, setSelectedClinicId] = useState<string>('');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');

  // Fetch user's clinic assignments
  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['my-clinic-assignments'],
    queryFn: () => clinicsApi.myAssignments(),
    enabled: open,
  });

  // Auto-select primary clinic
  useEffect(() => {
    if (assignments && assignments.length > 0 && !selectedClinicId) {
      const primary = assignments.find((a) => a.is_primary);
      const target = primary ?? assignments[0];
      if (target) {
        setSelectedClinicId(String(target.clinic));
      }
    }
  }, [assignments, selectedClinicId]);

  // Fetch rooms for selected clinic
  const { data: rooms, isLoading: roomsLoading } = useQuery({
    queryKey: ['clinic-rooms', selectedClinicId],
    queryFn: () => clinicsApi.listRooms(Number(selectedClinicId)),
    enabled: !!selectedClinicId,
  });

  // Auto-select default room
  useEffect(() => {
    if (rooms && rooms.length > 0 && !selectedRoomId) {
      const defaultRoom = rooms.find((r) => r.is_default);
      if (defaultRoom) {
        setSelectedRoomId(String(defaultRoom.room));
      }
    }
  }, [rooms, selectedRoomId]);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setSelectedClinicId('');
      setSelectedRoomId('');
    }
  }, [open]);

  const handleClinicChange = (value: string) => {
    setSelectedClinicId(value);
    setSelectedRoomId(''); // Reset room when clinic changes
  };

  const handleConfirm = () => {
    const payload: { clinic_id?: number; room_id?: number } = {};
    if (selectedClinicId) payload.clinic_id = Number(selectedClinicId);
    if (selectedRoomId) payload.room_id = Number(selectedRoomId);
    onConfirm(payload);
  };

  const activeClinicAssignments = assignments?.filter((a) => a.is_active) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="h-5 w-5" />
            Clock In
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Clinic Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
              Clinic
            </label>
            {assignmentsLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : activeClinicAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No clinic assignments found. You can still clock in without selecting a clinic.
              </p>
            ) : (
              <Select value={selectedClinicId} onValueChange={handleClinicChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select clinic" />
                </SelectTrigger>
                <SelectContent>
                  {activeClinicAssignments.map((assignment) => (
                    <SelectItem key={assignment.clinic} value={String(assignment.clinic)}>
                      <span className="flex items-center gap-2">
                        {assignment.clinic_name}
                        {assignment.is_primary && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            Primary
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Room Selection */}
          {selectedClinicId && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Room
                <span className="text-xs text-muted-foreground font-normal">(optional)</span>
              </label>
              {roomsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : !rooms || rooms.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No rooms configured for this clinic.
                </p>
              ) : (
                <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select room (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms.map((room: ClinicRoom) => (
                      <SelectItem key={room.room} value={String(room.room)}>
                        <RoomOption room={room} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? 'Clocking in…' : 'Clock In'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoomOption({ room }: { room: ClinicRoom }) {
  const occupantCount = room.active_clinicians.length;
  return (
    <span className="flex items-center gap-2">
      <span>{room.room_name}</span>
      {room.room_code && (
        <span className="text-xs text-muted-foreground">({room.room_code})</span>
      )}
      {occupantCount > 0 && (
        <Badge variant="outline" className="text-[10px] px-1 py-0 gap-0.5">
          <Users className="h-3 w-3" />
          {occupantCount}
        </Badge>
      )}
      {room.is_default && (
        <Badge variant="secondary" className="text-[10px] px-1 py-0">
          Default
        </Badge>
      )}
    </span>
  );
}
