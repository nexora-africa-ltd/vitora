'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, Plus, Trash2, Loader2, Star, Users } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ClinicNavigation } from '@/components/clinics/clinic-navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { clinicsApi } from '@/lib/api/clinics';
import { resourcesApi } from '@/lib/api/scheduling';
import type { ClinicRoom } from '@/lib/types/clinic';

export default function ClinicRoomsPage() {
  const params = useParams();
  const clinicId = Number(params.clinicId);
  const queryClient = useQueryClient();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomCode, setNewRoomCode] = useState('');
  const [newRoomCapacity, setNewRoomCapacity] = useState('1');

  // Fetch linked rooms
  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ['clinic-rooms', clinicId],
    queryFn: () => clinicsApi.listRooms(clinicId),
  });

  // Fetch PLACE resources that are NOT auto-created clinic resources
  const { data: allPlaceResources } = useQuery({
    queryKey: ['resources', 'PLACE', 'rooms-only'],
    queryFn: () =>
      resourcesApi.list({
        resource_type: 'PLACE',
        exclude_clinic_resources: true,
        page_size: 200,
      }),
    enabled: linkDialogOpen,
  });

  // Filter out already-linked rooms
  const linkedRoomIds = new Set(rooms.map((r: ClinicRoom) => r.room));
  const availableToLink = (allPlaceResources?.results ?? []).filter(
    (r) => !linkedRoomIds.has(r.id),
  );

  const resetDialog = () => {
    setSelectedRoomId('');
    setNewRoomName('');
    setNewRoomCode('');
    setNewRoomCapacity('1');
  };

  // Link existing room
  const linkMutation = useMutation({
    mutationFn: (roomId: number) => clinicsApi.addRoom(clinicId, { room: roomId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinic-rooms', clinicId] });
      toast.success('Room linked to clinic');
      setLinkDialogOpen(false);
      resetDialog();
    },
    onError: () => toast.error('Failed to link room'),
  });

  // Create new room then link it
  const createAndLinkMutation = useMutation({
    mutationFn: async () => {
      const resource = await resourcesApi.create({
        name: newRoomName.trim(),
        resource_type: 'PLACE',
        code: newRoomCode.trim(),
        capacity: Number(newRoomCapacity) || 1,
      });
      await clinicsApi.addRoom(clinicId, { room: resource.id });
      return resource;
    },
    onSuccess: (resource) => {
      queryClient.invalidateQueries({ queryKey: ['clinic-rooms', clinicId] });
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      toast.success(`Created "${resource.name}" and linked to clinic`);
      setLinkDialogOpen(false);
      resetDialog();
    },
    onError: () => toast.error('Failed to create room'),
  });

  const unlinkMutation = useMutation({
    mutationFn: (clinicRoomId: number) => clinicsApi.removeRoom(clinicId, clinicRoomId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinic-rooms', clinicId] });
      toast.success('Room unlinked from clinic');
    },
    onError: () => toast.error('Failed to unlink room'),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rooms"
        helpContent="Manage rooms linked to this clinic. Linked rooms appear in the clock-in room picker and automatically get assigned when clinicians call patients."
        actions={
          <Dialog open={linkDialogOpen} onOpenChange={(open) => { setLinkDialogOpen(open); if (!open) resetDialog(); }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Room
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Room</DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="create" className="mt-2">
                <TabsList className="w-full">
                  <TabsTrigger value="create" className="flex-1">Create New</TabsTrigger>
                  <TabsTrigger value="link" className="flex-1">Link Existing</TabsTrigger>
                </TabsList>

                {/* Create new room */}
                <TabsContent value="create" className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="room-name">Room Name</Label>
                    <Input
                      id="room-name"
                      placeholder="e.g. Consultation Room 1"
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="room-code">Code</Label>
                    <Input
                      id="room-code"
                      placeholder="e.g. ROOM-101"
                      value={newRoomCode}
                      onChange={(e) => setNewRoomCode(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="room-capacity">Capacity</Label>
                    <Input
                      id="room-capacity"
                      type="number"
                      min={1}
                      value={newRoomCapacity}
                      onChange={(e) => setNewRoomCapacity(e.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full"
                    disabled={!newRoomName.trim() || !newRoomCode.trim() || createAndLinkMutation.isPending}
                    onClick={() => createAndLinkMutation.mutate()}
                  >
                    {createAndLinkMutation.isPending && (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    )}
                    Create &amp; Link
                  </Button>
                </TabsContent>

                {/* Link existing room */}
                <TabsContent value="link" className="space-y-4 pt-2">
                  <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a room..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableToLink.length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          No rooms available. Create one first.
                        </div>
                      )}
                      {availableToLink.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {r.name} ({r.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    className="w-full"
                    disabled={!selectedRoomId || linkMutation.isPending}
                    onClick={() => linkMutation.mutate(Number(selectedRoomId))}
                  >
                    {linkMutation.isPending && (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    )}
                    Link Room
                  </Button>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        }
      />
      <ClinicNavigation clinicId={clinicId} />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <DoorOpen className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No rooms linked to this clinic yet.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Link rooms so clinicians can select them during clock-in.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room: ClinicRoom) => (
            <Card key={room.id} className="relative overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                aria-hidden="true"
              />
              <CardContent className="relative pt-5 pb-4 px-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{room.room_name}</h3>
                      {room.is_default && (
                        <Badge variant="outline" className="shrink-0 gap-1 text-xs">
                          <Star className="h-3 w-3" /> Default
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {room.room_code}
                      {room.room_capacity > 0 && ` • Capacity: ${room.room_capacity}`}
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Unlink {room.room_name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove the room from this clinic. Active shifts in this room will not be affected.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => unlinkMutation.mutate(room.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Unlink
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* Active clinicians */}
                {room.active_clinicians && room.active_clinicians.length > 0 ? (
                  <div className="mt-3 flex items-center gap-1.5 text-sm">
                    <Users className="h-4 w-4 text-green-500" />
                    <span className="text-green-700 dark:text-green-400">
                      {room.active_clinicians.map((c) => c.name).join(', ')}
                    </span>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>No active clinicians</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
