/**
 * Scheduling calendar component for imaging department.
 * Displays resource availability with time slots for a given date.
 */
'use client';

import { useState, useMemo, useId } from 'react';
import { format, addDays, subDays, parseISO, isToday } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  User,
  CheckCircle2,
  XCircle,
  CalendarIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useImagingCalendar } from '@/lib/hooks/use-imaging';
import {
  ImagingModality,
  ImagingCalendarSlot,
  ImagingResourceAvailability,
  MODALITY_LABELS,
} from '@/lib/types/imaging';
import { ModalityBadge } from './modality-badge';

interface SchedulingCalendarProps {
  /**
   * Callback when a slot is selected.
   * Can be used for scheduling new orders.
   */
  onSlotSelect?: (resourceId: number, slot: ImagingCalendarSlot) => void;
  /**
   * Show only available slots (hide booked ones).
   */
  showOnlyAvailable?: boolean;
  /**
   * Enable compact mode for smaller displays.
   */
  compact?: boolean;
}

const MODALITIES: ImagingModality[] = ['XR', 'US', 'CT', 'MRI', 'NM', 'MG', 'FL', 'OTHER'];

export function SchedulingCalendar({
  onSlotSelect,
  showOnlyAvailable = false,
  compact = false,
}: SchedulingCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [modalityFilter, setModalityFilter] = useState<ImagingModality | ''>('');
  const [calendarOpen, setCalendarOpen] = useState(false);

  const dateString = format(selectedDate, 'yyyy-MM-dd');

  const {
    data: calendarData,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useImagingCalendar({
    date: dateString,
    modality: modalityFilter || undefined,
  });

  // Memoize resources to prevent useMemo dependency warnings
  const resources = useMemo(() => calendarData?.resources || [], [calendarData?.resources]);

  // Filter resources based on modality if specified
  const filteredResources = useMemo(() => {
    if (!modalityFilter) return resources;
    return resources.filter((r) => {
      const modalities = r.resource.metadata?.modalities || [];
      return modalities.includes(modalityFilter);
    });
  }, [resources, modalityFilter]);

  // Get unique time slots across all resources
  const timeSlots = useMemo(() => {
    const slotsSet = new Set<string>();
    filteredResources.forEach((r) => {
      r.slots.forEach((slot) => {
        slotsSet.add(slot.start_time);
      });
    });
    return Array.from(slotsSet).sort();
  }, [filteredResources]);

  // Calculate stats
  const stats = useMemo(() => {
    let totalSlots = 0;
    let availableSlots = 0;
    let bookedSlots = 0;

    filteredResources.forEach((r) => {
      totalSlots += r.total_slots;
      availableSlots += r.available_slots;
      bookedSlots += r.booked_slots;
    });

    return { totalSlots, availableSlots, bookedSlots };
  }, [filteredResources]);

  const handlePreviousDay = () => {
    setSelectedDate((prev) => subDays(prev, 1));
  };

  const handleNextDay = () => {
    setSelectedDate((prev) => addDays(prev, 1));
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  const handleSlotClick = (resourceId: number, slot: ImagingCalendarSlot) => {
    if (onSlotSelect) {
      onSlotSelect(resourceId, slot);
    }
  };

  const formatTime = (timeString: string) => {
    // Parse HH:MM:SS format
    const parts = timeString.split(':');
    const hours = parts[0] ?? '00';
    const minutes = parts[1] ?? '00';
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    const description =
      errorMessage === 'Failed to load calendar' ? 'Please try again.' : errorMessage;
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <XCircle className="mb-4 h-12 w-12 text-destructive" />
            <h3 className="text-lg font-semibold">Failed to load calendar</h3>
            <p className="mb-4 text-muted-foreground">{description}</p>
            <Button onClick={() => refetch()} variant="outline">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3 sm:pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
              Imaging Schedule
            </CardTitle>
            <CardDescription className="mt-1 text-xs sm:text-sm">
              View and manage imaging resource availability
            </CardDescription>
          </div>

          {/* Stats Pills */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <Badge variant="outline" className="bg-background text-xs">
              <span className="mr-1 text-muted-foreground">Total:</span>
              {stats.totalSlots}
            </Badge>
            <Badge variant="success" className="border border-emerald-500/20 text-xs">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {stats.availableSlots}
            </Badge>
            <Badge
              variant="destructive"
              className="border-destructive/30 bg-destructive/10 text-xs text-destructive"
            >
              <Clock className="mr-1 h-3 w-3" />
              {stats.bookedSlots}
            </Badge>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-3 flex flex-col gap-3 sm:mt-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Date Navigation */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePreviousDay}
              aria-label="Previous day"
              className="h-8 w-8 sm:h-9 sm:w-9"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'flex-1 justify-start text-left text-sm font-normal sm:w-[200px] sm:flex-none',
                    !selectedDate && 'text-muted-foreground'
                  )}
                  size="sm"
                >
                  <CalendarIcon className="mr-1.5 h-4 w-4 sm:mr-2" />
                  <span className="truncate">{format(selectedDate, 'EEE, MMM d, yyyy')}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);
                      setCalendarOpen(false);
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Button
              variant="outline"
              size="icon"
              onClick={handleNextDay}
              aria-label="Next day"
              className="h-8 w-8 sm:h-9 sm:w-9"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            {!isToday(selectedDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToday}
                className="text-xs sm:text-sm"
              >
                Today
              </Button>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <Select
              value={modalityFilter}
              onValueChange={(value) => setModalityFilter(value as ImagingModality | '')}
            >
              <SelectTrigger className="flex-1 text-sm sm:w-[140px] sm:flex-none">
                <SelectValue placeholder="All Modalities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Modalities</SelectItem>
                {MODALITIES.map((modality) => (
                  <SelectItem key={modality} value={modality}>
                    {MODALITY_LABELS[modality]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-3 sm:px-6">
        {isLoading ? (
          <CalendarSkeleton />
        ) : filteredResources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center sm:py-12">
            <Calendar className="mb-3 h-10 w-10 text-muted-foreground sm:mb-4 sm:h-12 sm:w-12" />
            <h3 className="text-base font-semibold sm:text-lg">No resources found</h3>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {modalityFilter
                ? `No imaging resources available for ${MODALITY_LABELS[modalityFilter]}`
                : 'No imaging resources configured yet'}
            </p>
          </div>
        ) : (
          <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
            <TooltipProvider delayDuration={0}>
              <table className="w-full min-w-[600px] border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 min-w-[140px] border-b bg-muted/50 p-1.5 text-left text-xs sm:min-w-[180px] sm:p-2 sm:text-sm">
                      Resource
                    </th>
                    {timeSlots.map((time) => (
                      <th
                        key={time}
                        className="min-w-[60px] border-b bg-muted/50 p-1 text-center text-[10px] font-medium sm:min-w-[80px] sm:p-2 sm:text-xs"
                      >
                        {formatTime(time)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredResources.map((resource) => (
                    <ResourceRow
                      key={resource.resource.id}
                      resource={resource}
                      timeSlots={timeSlots}
                      showOnlyAvailable={showOnlyAvailable}
                      onSlotClick={handleSlotClick}
                      compact={compact}
                    />
                  ))}
                </tbody>
              </table>
            </TooltipProvider>
          </div>
        )}

        {/* Legend */}
        {filteredResources.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground sm:mt-4 sm:gap-4 sm:pt-4 sm:text-sm">
            <span className="flex items-center gap-1">
              <div className="h-3 w-3 rounded border border-emerald-500/30 bg-emerald-500/15 dark:border-emerald-500/40 dark:bg-emerald-500/20 sm:h-4 sm:w-4" />
              Available
            </span>
            <span className="flex items-center gap-1">
              <div className="h-3 w-3 rounded border border-destructive/30 bg-destructive/10 sm:h-4 sm:w-4" />
              Booked
            </span>
            {onSlotSelect && (
              <span className="text-[10px] sm:ml-auto sm:text-xs">
                Click on an available slot to schedule
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ResourceRowProps {
  resource: ImagingResourceAvailability;
  timeSlots: string[];
  showOnlyAvailable: boolean;
  onSlotClick?: (resourceId: number, slot: ImagingCalendarSlot) => void;
  compact: boolean;
}

function ResourceRow({
  resource,
  timeSlots,
  showOnlyAvailable,
  onSlotClick,
  compact,
}: ResourceRowProps) {
  const modalities = resource.resource.metadata?.modalities || [];

  // Map time slots to slots for quick lookup
  const slotMap = useMemo(() => {
    const map = new Map<string, ImagingCalendarSlot>();
    resource.slots.forEach((slot) => {
      map.set(slot.start_time, slot);
    });
    return map;
  }, [resource.slots]);

  return (
    <tr className="transition-colors hover:bg-muted/30">
      <td className="sticky left-0 border-b bg-background p-1.5 sm:p-2">
        <div className="flex flex-col gap-0.5 sm:gap-1">
          <div className="text-xs font-medium sm:text-sm">{resource.resource.name}</div>
          <div className="flex flex-wrap items-center gap-0.5 sm:gap-1">
            {modalities.slice(0, 3).map((mod) => (
              <ModalityBadge key={mod} modality={mod} size="sm" />
            ))}
            {modalities.length > 3 && (
              <Badge variant="outline" className="text-[10px] sm:text-xs">
                +{modalities.length - 3}
              </Badge>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground sm:text-xs">
            {resource.available_slots}/{resource.total_slots} available
          </div>
        </div>
      </td>
      {timeSlots.map((time) => {
        const slot = slotMap.get(time);
        if (!slot) {
          return (
            <td key={time} className="border-b p-1">
              <div className="h-12 rounded bg-muted/20" />
            </td>
          );
        }

        if (showOnlyAvailable && !slot.is_available) {
          return (
            <td key={time} className="border-b p-1">
              <div className="h-12 rounded bg-muted/50 opacity-30" />
            </td>
          );
        }

        return (
          <td key={time} className="border-b p-1">
            <SlotCell
              slot={slot}
              resourceId={resource.resource.id}
              onSlotClick={onSlotClick}
              compact={compact}
            />
          </td>
        );
      })}
    </tr>
  );
}

interface SlotCellProps {
  slot: ImagingCalendarSlot;
  resourceId: number;
  onSlotClick?: (resourceId: number, slot: ImagingCalendarSlot) => void;
  compact: boolean;
}

function SlotCell({ slot, resourceId, onSlotClick, compact }: SlotCellProps) {
  const isAvailable = slot.is_available;
  const canClick = isAvailable && onSlotClick;
  const appointmentId = useId();

  const content = (
    <button
      type="button"
      onClick={() => canClick && onSlotClick(resourceId, slot)}
      aria-describedby={slot.appointment ? appointmentId : undefined}
      disabled={!canClick}
      className={cn(
        'flex h-12 w-full items-center justify-center rounded border text-xs transition-all',
        isAvailable
          ? 'border-emerald-500/25 bg-emerald-500/10 hover:border-emerald-500/35 hover:bg-emerald-500/15 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/25'
          : 'cursor-default border-destructive/30 bg-destructive/10',
        canClick && 'cursor-pointer hover:shadow-sm',
        !canClick && isAvailable && 'cursor-default'
      )}
      aria-label={
        isAvailable ? `Available slot at ${slot.start_time}` : `Booked slot at ${slot.start_time}`
      }
    >
      {isAvailable ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
      ) : (
        <User className="h-4 w-4 text-destructive" />
      )}
      {slot.appointment && (
        <span id={appointmentId} className="sr-only">
          <span>{slot.appointment.patient_name || 'Unknown Patient'}</span>
          <span>{slot.appointment.appointment_number}</span>
        </span>
      )}
    </button>
  );

  if (slot.appointment) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px]">
          <div className="space-y-1">
            <p className="font-medium">{slot.appointment.patient_name || 'Unknown Patient'}</p>
            <p className="text-xs text-muted-foreground">{slot.appointment.appointment_number}</p>
            <Badge variant="outline" className="text-xs">
              {slot.appointment.status}
            </Badge>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (isAvailable && onSlotClick) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="top">
          <p>Click to schedule</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

function CalendarSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex gap-2">
        <Skeleton className="h-12 w-[180px]" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-[80px]" />
        ))}
      </div>
      {/* Resource rows */}
      {Array.from({ length: 4 }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-2">
          <Skeleton className="h-16 w-[180px]" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-[80px]" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default SchedulingCalendar;
