'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Clock, CheckCircle, AlertCircle, User } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useShiftHandovers, useInpatientWards, useAcknowledgeShiftHandover } from '@/lib/hooks/use-inpatient';
import { useToast } from '@/lib/hooks/use-toast';
import type { ShiftHandover, ShiftEndingType } from '@/lib/types/inpatient';

const SHIFT_OPTIONS: { value: ShiftEndingType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All Shifts' },
  { value: 'DAY', label: 'Day Shift' },
  { value: 'EVENING', label: 'Evening Shift' },
  { value: 'NIGHT', label: 'Night Shift' },
];

export default function HandoverListPage() {
  const { toast } = useToast();
  const [wardFilter, setWardFilter] = useState<string>('all');
  const [shiftFilter, setShiftFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('pending');

  const { data: wards } = useInpatientWards();
  const { data: handovers, isLoading } = useShiftHandovers({
    ward: wardFilter !== 'all' ? Number(wardFilter) : undefined,
    shift_ending: shiftFilter !== 'ALL' ? (shiftFilter as ShiftEndingType) : undefined,
  });
  const acknowledgeHandover = useAcknowledgeShiftHandover();

  // Filter by status (pending = not acknowledged, acknowledged = acknowledged)
  const filteredHandovers = handovers?.results?.filter((h) => {
    if (statusFilter === 'pending') return !h.is_acknowledged;
    if (statusFilter === 'acknowledged') return h.is_acknowledged;
    return true;
  }) || [];

  const pendingCount = handovers?.results?.filter((h) => !h.is_acknowledged).length || 0;

  const handleAcknowledge = async (handoverId: number) => {
    try {
      await acknowledgeHandover.mutateAsync(handoverId);
      toast({
        title: 'Success',
        description: 'Handover acknowledged successfully',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to acknowledge handover',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return <HandoverListSkeleton />;
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Shift Handovers"
          description="View and acknowledge shift handover reports"
        />
        <Button asChild>
          <Link href="/admissions/handover/new">
            <Plus className="h-4 w-4 mr-2" />
            New Handover
          </Link>
        </Button>
      </div>

      {/* Pending Handovers Alert */}
      {pendingCount > 0 && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Pending Handovers: {pendingCount} handover{pendingCount > 1 ? 's' : ''} awaiting acknowledgment
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="w-48">
          <Select value={wardFilter} onValueChange={setWardFilter}>
            <SelectTrigger aria-label="Ward">
              <SelectValue placeholder="Filter by ward" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Wards</SelectItem>
              {wards?.results?.map((ward) => (
                <SelectItem key={ward.id} value={String(ward.id)}>
                  {ward.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Select value={shiftFilter} onValueChange={setShiftFilter}>
            <SelectTrigger aria-label="Shift">
              <SelectValue placeholder="Filter by shift" />
            </SelectTrigger>
            <SelectContent>
              {SHIFT_OPTIONS.map((shift) => (
                <SelectItem key={shift.value} value={shift.value}>
                  {shift.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Handover List */}
      {filteredHandovers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No handovers found</h3>
            <p className="text-muted-foreground mt-2">
              {statusFilter === 'pending'
                ? 'No pending handovers awaiting acknowledgment.'
                : 'No handovers match your filters.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredHandovers.map((handover) => (
            <HandoverCard
              key={handover.id}
              handover={handover}
              onAcknowledge={() => handleAcknowledge(handover.id)}
              isAcknowledging={acknowledgeHandover.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HandoverCard({
  handover,
  onAcknowledge,
  isAcknowledging,
}: {
  handover: ShiftHandover;
  onAcknowledge: () => void;
  isAcknowledging: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              {handover.ward_name || `Ward ${handover.ward}`}
              <Badge variant={handover.is_acknowledged ? 'default' : 'secondary'}>
                {handover.is_acknowledged ? 'Acknowledged' : 'Pending'}
              </Badge>
            </CardTitle>
            <CardDescription>
              {handover.shift_ending_display || handover.shift_ending} Shift - {new Date(handover.shift_date).toLocaleDateString()}
            </CardDescription>
          </div>
          {!handover.is_acknowledged && (
            <Button
              size="sm"
              onClick={onAcknowledge}
              disabled={isAcknowledging}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Acknowledge
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-4 text-sm">
          <div>
            <p className="text-muted-foreground">Total Patients</p>
            <p className="font-medium">{handover.total_patients}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Critical</p>
            <p className="font-medium text-red-600">{handover.critical_patients || 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">New Admissions</p>
            <p className="font-medium">{handover.new_admissions || 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Discharges Pending</p>
            <p className="font-medium">{handover.discharges_pending || 0}</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">From:</span>
            <span className="font-medium">{handover.outgoing_nurse_username || `Nurse ${handover.outgoing_nurse}`}</span>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">To:</span>
            <span className="font-medium">{handover.incoming_nurse_username || `Nurse ${handover.incoming_nurse}`}</span>
          </div>
        </div>
        {handover.general_notes && (
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Summary</p>
            <p className="text-sm">{handover.general_notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HandoverListSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-48" />
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    </div>
  );
}
