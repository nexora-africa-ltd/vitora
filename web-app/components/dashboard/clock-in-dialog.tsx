'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DoorOpen, LogIn, MapPin, Stethoscope, Users } from 'lucide-react';
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
import { resourcesApi } from '@/lib/api/scheduling';
import { useMyStaffProfile } from '@/lib/hooks/use-rbac';
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

  // Fetch user's staff profile (for department fallback)
  const { data: staffProfile } = useMyStaffProfile();

  // Fetch user's clinic assignments
  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['my-clinic-assignments'],
    queryFn: () => clinicsApi.myAssignments(),
    enabled: open,
  });

  const activeClinicAssignments = assignments?.filter((a) => a.is_active) ?? [];
  const hasClinicAssignments = activeClinicAssignments.length > 0;

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

  // Fetch department rooms (always — covers rooms not linked to any clinic)
  const deptId = staffProfile?.primary_department;
  const { data: deptRooms, isLoading: deptRoomsLoading } = useQuery({
    queryKey: ['dept-rooms', deptId],
    queryFn: () => resourcesApi.list({ resource_type: 'PLACE', department: deptId!, is_active: true, page_size: 100 }),
    enabled: open && !!deptId,
  });

  // Auto-select default room (clinic default, or single available room)
  useEffect(() => {
    if (selectedRoomId) return;

    // 1. Try clinic default room
    if (rooms && rooms.length > 0) {
      const defaultRoom = rooms.find((r) => r.is_default);
      if (defaultRoom) {
        setSelectedRoomId(String(defaultRoom.room));
        return;
      }
    }

    // 2. If only one room total (clinic + dept), auto-select it
    const clinicRoomIdSet = new Set((rooms ?? []).map((r: ClinicRoom) => r.room));
    const extra = (deptRooms?.results ?? []).filter((r) => !clinicRoomIdSet.has(r.id));
    const allRooms = [
      ...(rooms ?? []).map((r) => String(r.room)),
      ...extra.map((r) => String(r.id)),
    ];
    if (allRooms.length === 1 && allRooms[0]) {
      setSelectedRoomId(allRooms[0]);
    }
  }, [rooms, deptRooms, selectedRoomId]);

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

  const deptRoomResults = deptRooms?.results ?? [];

  // Build merged room list: clinic rooms + department rooms not already linked
  const clinicRoomIds = new Set((rooms ?? []).map((r: ClinicRoom) => r.room));
  const extraDeptRooms = deptRoomResults.filter((r) => !clinicRoomIds.has(r.id));
  const hasAnyRooms = (rooms && rooms.length > 0) || extraDeptRooms.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg overflow-visible">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="h-5 w-5" />
            Clock In
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {assignmentsLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : hasClinicAssignments ? (
            <>
              {/* Clinic Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Stethoscope className="h-4 w-4 text-muted-foreground" />
                  Clinic
                </label>
                <Select value={selectedClinicId} onValueChange={handleClinicChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select clinic" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeClinicAssignments.map((assignment) => (
                      <SelectItem
                        key={assignment.clinic}
                        value={String(assignment.clinic)}
                        textValue={assignment.clinic_name}
                      >
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
              </div>

              {/* Room Selection (clinic rooms + department rooms) */}
              {selectedClinicId && (
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    Room
                    <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                  </label>
                  {(roomsLoading || deptRoomsLoading) ? (
                    <Skeleton className="h-10 w-full" />
                  ) : !hasAnyRooms ? (
                    <p className="text-sm text-muted-foreground">
                      No rooms available. You can still clock in without selecting a room.
                    </p>
                  ) : (
                    <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select room (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {rooms && rooms.length > 0 && rooms.map((room: ClinicRoom) => (
                          <SelectItem
                            key={`clinic-${room.room}`}
                            value={String(room.room)}
                            textValue={room.room_name}
                          >
                            <span className="flex items-center gap-2">
                              <span>{room.room_name}</span>
                              {room.active_clinicians.length > 0 && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 gap-0.5">
                                  <Users className="h-3 w-3" />
                                  {room.active_clinicians.length}
                                </Badge>
                              )}
                              {room.is_default && (
                                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                  Default
                                </Badge>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                        {extraDeptRooms.length > 0 && rooms && rooms.length > 0 && (
                          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-t mt-1 pt-1.5">
                            {staffProfile?.primary_department_name ?? 'Department'} Rooms
                          </div>
                        )}
                        {extraDeptRooms.map((resource) => (
                          <SelectItem
                            key={`dept-${resource.id}`}
                            value={String(resource.id)}
                            textValue={resource.name}
                          >
                            <span className="flex items-center gap-2">
                              <DoorOpen className="h-3.5 w-3.5 text-muted-foreground" />
                              {resource.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Department Room Selection (no clinic assignments) */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <DoorOpen className="h-4 w-4 text-muted-foreground" />
                  {staffProfile?.primary_department_name
                    ? `Room in ${staffProfile.primary_department_name}`
                    : 'Room'}
                  <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                </label>
                {deptRoomsLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : deptRoomResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {deptId
                      ? 'No rooms found for your department.'
                      : 'No clinic or department assigned.'}
                    {' '}You can still clock in without selecting a room.
                  </p>
                ) : (
                  <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select room (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {deptRoomResults.map((resource) => (
                        <SelectItem
                          key={resource.id}
                          value={String(resource.id)}
                          textValue={resource.name}
                        >
                          {resource.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </>
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
