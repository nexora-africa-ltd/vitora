/**
 * Clinic Schedule Management Page
 *
 * Manage operating hours, session schedules, and capacity limits
 * for the clinic on each day of the week.
 *
 * Route: /clinics/[clinicId]/schedule
 */
'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Plus,
  Edit,
  Trash2,
  MoreHorizontal,
  AlertCircle,
  RefreshCw,
  CheckCircle,
  XCircle,
  Users,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useClinic,
  useClinicSchedule,
  useAddSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
} from '@/lib/hooks/use-clinics';
import { ClinicNavigation } from '@/components/clinics/clinic-navigation';
import { toast } from '@/lib/hooks/use-toast';
import type { ClinicSchedule, ClinicScheduleCreateData } from '@/lib/types/clinic';
import { cn } from '@/lib/utils/cn';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Monday', short: 'Mon' },
  { value: 1, label: 'Tuesday', short: 'Tue' },
  { value: 2, label: 'Wednesday', short: 'Wed' },
  { value: 3, label: 'Thursday', short: 'Thu' },
  { value: 4, label: 'Friday', short: 'Fri' },
  { value: 5, label: 'Saturday', short: 'Sat' },
  { value: 6, label: 'Sunday', short: 'Sun' },
];

function formatTime(time: string): string {
  const parts = time.split(':');
  const hours = parts[0] ?? '0';
  const minutes = parts[1] ?? '00';
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

function calculateDuration(startTime: string, endTime: string): string {
  const startParts = startTime.split(':').map(Number);
  const endParts = endTime.split(':').map(Number);
  const startHours = startParts[0] ?? 0;
  const startMinutes = startParts[1] ?? 0;
  const endHours = endParts[0] ?? 0;
  const endMinutes = endParts[1] ?? 0;

  const startTotal = startHours * 60 + startMinutes;
  const endTotal = endHours * 60 + endMinutes;
  const duration = endTotal - startTotal;

  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

const defaultScheduleData: ClinicScheduleCreateData = {
  day_of_week: 0,
  start_time: '08:00',
  end_time: '17:00',
  max_patients: 50,
  is_active: true,
  notes: '',
};

export default function ClinicSchedulePage() {
  const params = useParams();
  const clinicId = Number(params.clinicId);

  // UI State
  const [addScheduleOpen, setAddScheduleOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<ClinicSchedule | null>(null);
  const [deleteScheduleId, setDeleteScheduleId] = useState<number | null>(null);
  const [scheduleData, setScheduleData] = useState<ClinicScheduleCreateData>(defaultScheduleData);

  // Fetch data
  const { data: clinic, isLoading: clinicLoading } = useClinic(clinicId);
  const { data: schedule, isLoading: scheduleLoading, refetch: refetchSchedule } = useClinicSchedule(clinicId);

  // Mutations
  const { mutateAsync: addSchedule, isPending: addingSchedule } = useAddSchedule();
  const { mutateAsync: updateSchedule, isPending: updatingSchedule } = useUpdateSchedule();
  const { mutateAsync: deleteSchedule, isPending: deletingSchedule } = useDeleteSchedule();

  // Sort schedule by day of week
  const sortedSchedule = [...(schedule ?? [])].sort((a, b) => a.day_of_week - b.day_of_week);

  // Get days that already have schedules
  const scheduledDays = new Set(sortedSchedule.map((s) => s.day_of_week));

  // Calculate total weekly hours and capacity
  const weeklyStats = sortedSchedule.reduce(
    (acc, s) => {
      if (s.is_active) {
        const startParts = s.start_time.split(':').map(Number);
        const endParts = s.end_time.split(':').map(Number);
        const startHours = startParts[0] ?? 0;
        const startMinutes = startParts[1] ?? 0;
        const endHours = endParts[0] ?? 0;
        const endMinutes = endParts[1] ?? 0;
        const duration = (endHours * 60 + endMinutes - (startHours * 60 + startMinutes)) / 60;
        acc.totalHours += duration;
        acc.totalCapacity += s.max_patients;
        acc.activeDays += 1;
      }
      return acc;
    },
    { totalHours: 0, totalCapacity: 0, activeDays: 0 }
  );

  const handleAddSchedule = useCallback(async () => {
    try {
      await addSchedule({ clinicId, data: scheduleData });
      toast({
        title: 'Schedule Added',
        description: 'The schedule entry has been added.',
      });
      setAddScheduleOpen(false);
      setScheduleData(defaultScheduleData);
      refetchSchedule();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add schedule. Please try again.',
        variant: 'destructive',
      });
    }
  }, [clinicId, scheduleData, addSchedule, refetchSchedule]);

  const handleUpdateSchedule = useCallback(async () => {
    if (!editSchedule) return;

    try {
      await updateSchedule({
        clinicId,
        scheduleId: editSchedule.id,
        data: scheduleData,
      });
      toast({
        title: 'Schedule Updated',
        description: 'The schedule entry has been updated.',
      });
      setEditSchedule(null);
      setScheduleData(defaultScheduleData);
      refetchSchedule();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update schedule. Please try again.',
        variant: 'destructive',
      });
    }
  }, [clinicId, editSchedule, scheduleData, updateSchedule, refetchSchedule]);

  const handleDeleteSchedule = useCallback(async () => {
    if (!deleteScheduleId) return;

    try {
      await deleteSchedule({ clinicId, scheduleId: deleteScheduleId });
      toast({
        title: 'Schedule Deleted',
        description: 'The schedule entry has been deleted.',
      });
      setDeleteScheduleId(null);
      refetchSchedule();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete schedule. Please try again.',
        variant: 'destructive',
      });
    }
  }, [clinicId, deleteScheduleId, deleteSchedule, refetchSchedule]);

  const openEditDialog = (scheduleItem: ClinicSchedule) => {
    setEditSchedule(scheduleItem);
    setScheduleData({
      day_of_week: scheduleItem.day_of_week,
      start_time: scheduleItem.start_time,
      end_time: scheduleItem.end_time,
      max_patients: scheduleItem.max_patients,
      is_active: scheduleItem.is_active,
      notes: scheduleItem.notes,
    });
  };

  const closeDialog = () => {
    setAddScheduleOpen(false);
    setEditSchedule(null);
    setScheduleData(defaultScheduleData);
  };

  if (clinicLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Clinic not found</h3>
        <Button asChild>
          <Link href="/clinics">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Clinics
          </Link>
        </Button>
      </div>
    );
  }

  const isDialogOpen = addScheduleOpen || !!editSchedule;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/clinics/${clinicId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              {clinic.name} - Schedule
            </h1>
            <p className="text-muted-foreground">
              Manage operating hours and session capacity for each day
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-stretch sm:flex-row sm:flex-wrap sm:items-center">
          <Button variant="outline" size="sm" onClick={() => refetchSchedule()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setAddScheduleOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Schedule
          </Button>
        </div>
      </div>
      {/* Navigation */}
      <ClinicNavigation clinicId={clinicId} />
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Days</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{weeklyStats.activeDays}</div>
            <p className="text-xs text-muted-foreground">Days per week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Weekly Hours</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {weeklyStats.totalHours.toFixed(1)}h
            </div>
            <p className="text-xs text-muted-foreground">Total operating hours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Weekly Capacity</CardTitle>
            <Users className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{weeklyStats.totalCapacity}</div>
            <p className="text-xs text-muted-foreground">Max patients per week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Per Day</CardTitle>
            <Users className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {weeklyStats.activeDays > 0
                ? Math.round(weeklyStats.totalCapacity / weeklyStats.activeDays)
                : 0}
            </div>
            <p className="text-xs text-muted-foreground">Patients per active day</p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Schedule Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly Overview</CardTitle>
          <CardDescription>Quick view of operating hours for each day</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {DAYS_OF_WEEK.map((day) => {
              const scheduleItem = sortedSchedule.find((s) => s.day_of_week === day.value);
              const isActive = scheduleItem?.is_active ?? false;

              return (
                <div
                  key={day.value}
                  className={cn(
                    'rounded-lg border p-3 text-center',
                    scheduleItem
                      ? isActive
                        ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900'
                        : 'bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-800'
                      : 'bg-muted/50 border-dashed'
                  )}
                >
                  <p className="text-xs font-medium text-muted-foreground">{day.short}</p>
                  {scheduleItem ? (
                    <>
                      <p className={cn('text-sm font-semibold', !isActive && 'text-muted-foreground')}>
                        {formatTime(scheduleItem.start_time).split(' ')[0]}
                      </p>
                      <p className="text-xs text-muted-foreground">to</p>
                      <p className={cn('text-sm font-semibold', !isActive && 'text-muted-foreground')}>
                        {formatTime(scheduleItem.end_time).split(' ')[0]}
                      </p>
                      {!isActive && (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          Inactive
                        </Badge>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground py-3">Closed</p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Schedule Table */}
      <Card>
        <CardHeader>
          <CardTitle>Schedule Details</CardTitle>
          <CardDescription>Detailed schedule configuration for each operating day</CardDescription>
        </CardHeader>
        <CardContent>
          {scheduleLoading ? (
            <Skeleton className="h-96" />
          ) : sortedSchedule.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No schedule configured</h3>
              <p className="text-muted-foreground text-center mb-4">
                Add operating hours for each day the clinic is open.
              </p>
              <Button onClick={() => setAddScheduleOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Schedule
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Start Time</TableHead>
                    <TableHead>End Time</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="text-right">Max Patients</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSchedule.map((scheduleItem) => (
                    <TableRow key={scheduleItem.id}>
                      <TableCell>
                        <span className="font-medium">{scheduleItem.day_of_week_display}</span>
                      </TableCell>
                      <TableCell>
                        {scheduleItem.is_active ? (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-500 border-gray-500">
                            <XCircle className="h-3 w-3 mr-1" />
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatTime(scheduleItem.start_time)}</TableCell>
                      <TableCell>{formatTime(scheduleItem.end_time)}</TableCell>
                      <TableCell>
                        {calculateDuration(scheduleItem.start_time, scheduleItem.end_time)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {scheduleItem.max_patients}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {scheduleItem.notes || '--'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(scheduleItem)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => setDeleteScheduleId(scheduleItem.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Schedule Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editSchedule ? 'Edit Schedule' : 'Add Schedule'}</DialogTitle>
            <DialogDescription>
              {editSchedule
                ? `Update the schedule for ${editSchedule.day_of_week_display}`
                : 'Add operating hours for a day of the week'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!editSchedule && (
              <div className="space-y-2">
                <Label htmlFor="day_of_week">Day of Week</Label>
                <Select
                  value={String(scheduleData.day_of_week)}
                  onValueChange={(v) =>
                    setScheduleData((prev) => ({ ...prev, day_of_week: Number(v) }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.filter((day) => !scheduledDays.has(day.value)).map((day) => (
                      <SelectItem
                        key={day.value}
                        value={String(day.value)}
                      >
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_time">Start Time</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={scheduleData.start_time}
                  onChange={(e) =>
                    setScheduleData((prev) => ({ ...prev, start_time: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_time">End Time</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={scheduleData.end_time}
                  onChange={(e) =>
                    setScheduleData((prev) => ({ ...prev, end_time: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_patients">Maximum Patients</Label>
              <Input
                id="max_patients"
                type="number"
                min="1"
                value={scheduleData.max_patients}
                onChange={(e) =>
                  setScheduleData((prev) => ({ ...prev, max_patients: Number(e.target.value) }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of patients that can be scheduled for this day
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="is_active">Active</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive schedules won&apos;t accept new patients
                </p>
              </div>
              <Switch
                id="is_active"
                checked={scheduleData.is_active}
                onCheckedChange={(checked) =>
                  setScheduleData((prev) => ({ ...prev, is_active: checked }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                placeholder="Optional notes..."
                value={scheduleData.notes}
                onChange={(e) => setScheduleData((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={editSchedule ? handleUpdateSchedule : handleAddSchedule}
              disabled={addingSchedule || updatingSchedule}
            >
              <Save className="h-4 w-4 mr-2" />
              {editSchedule
                ? updatingSchedule
                  ? 'Saving...'
                  : 'Save Changes'
                : addingSchedule
                  ? 'Adding...'
                  : 'Add Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteScheduleId} onOpenChange={() => setDeleteScheduleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this schedule entry. The clinic will be marked as closed
              for this day.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSchedule}
              disabled={deletingSchedule}
              className="bg-red-600 hover:bg-red-700"
            >
              {deletingSchedule ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
