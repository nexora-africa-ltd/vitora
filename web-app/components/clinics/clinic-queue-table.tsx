/**
 * Clinic Queue Table Component
 *
 * Displays the clinic queue with patient information, priority badges,
 * wait times, and action buttons for calling/starting consultation.
 */
'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Phone,
  Play,
  CheckCircle,
  MoreHorizontal,
  Clock,
  User,
  AlertCircle,
  XCircle,
  ArrowRight,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { ClinicPriorityBadge } from './clinic-priority-badge';
import { ReferPatientDialog } from './refer-patient-dialog';
import {
  useCallPatient,
  useStartConsultation,
  useCompleteVisit,
  useMarkNoShow,
  useCancelVisit,
} from '@/lib/hooks/use-clinics';
import { toast } from '@/lib/hooks/use-toast';
import type { ClinicVisit } from '@/lib/types/clinic';
import { cn } from '@/lib/utils/cn';

interface ClinicQueueTableProps {
  visits: ClinicVisit[];
  clinicId: number;
  onRefresh: () => void;
  showActions?: boolean;
}

function formatWaitTime(minutes: number | undefined): string {
  if (!minutes || minutes < 1) return 'Just arrived';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

export function ClinicQueueTable({
  visits,
  clinicId,
  onRefresh,
  showActions = true,
}: ClinicQueueTableProps) {
  const router = useRouter();
  const [selectedVisit, setSelectedVisit] = useState<ClinicVisit | null>(null);
  const [noShowDialogOpen, setNoShowDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [referDialogOpen, setReferDialogOpen] = useState(false);

  // Mutations
  const { mutateAsync: callPatient, isPending: callingPatient } = useCallPatient();
  const { mutateAsync: startConsultation, isPending: startingConsultation } = useStartConsultation();
  const { mutateAsync: completeVisit, isPending: completingVisit } = useCompleteVisit();
  const { mutateAsync: markNoShow, isPending: markingNoShow } = useMarkNoShow();
  const { mutateAsync: cancelVisit, isPending: cancellingVisit } = useCancelVisit();

  const handleCallPatient = useCallback(
    async (visit: ClinicVisit) => {
      try {
        await callPatient(visit.id);
        toast({ title: 'Patient Called', description: `${visit.patient.full_name} has been called.` });
        onRefresh();
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to call patient. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [callPatient, onRefresh]
  );

  const handleStartConsultation = useCallback(
    async (visit: ClinicVisit) => {
      try {
        const result = await startConsultation(visit.id);
        toast({
          title: 'Consultation Started',
          description: `Starting consultation for ${visit.patient.full_name}.`,
        });
        onRefresh();
        // Navigate to encounter if created
        if (result.encounter) {
          router.push(`/encounters/${result.encounter}`);
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to start consultation. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [startConsultation, onRefresh, router]
  );

  const handleNoShow = useCallback(async () => {
    if (!selectedVisit) return;
    try {
      await markNoShow(selectedVisit.id);
      toast({
        title: 'Marked as No-Show',
        description: `${selectedVisit.patient.full_name} has been marked as a no-show.`,
      });
      onRefresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to mark as no-show. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setNoShowDialogOpen(false);
      setSelectedVisit(null);
    }
  }, [selectedVisit, markNoShow, onRefresh]);

  const handleCancel = useCallback(async () => {
    if (!selectedVisit) return;
    try {
      await cancelVisit({ visitId: selectedVisit.id });
      toast({
        title: 'Visit Cancelled',
        description: `Visit for ${selectedVisit.patient.full_name} has been cancelled.`,
      });
      onRefresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to cancel visit. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setCancelDialogOpen(false);
      setSelectedVisit(null);
    }
  }, [selectedVisit, cancelVisit, onRefresh]);

  const isPending = callingPatient || startingConsultation || completingVisit || markingNoShow || cancellingVisit;

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">#</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Wait Time</TableHead>
              <TableHead>Chief Complaint</TableHead>
              <TableHead>Status</TableHead>
              {showActions && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visits.map((visit) => (
              <TableRow
                key={visit.id}
                className={cn(
                  visit.status === 'CALLED' && 'bg-blue-50 dark:bg-blue-950/20',
                  visit.priority === 'EMERGENCY' && 'bg-red-50 dark:bg-red-950/20'
                )}
              >
                <TableCell className="font-medium">{visit.queue_number}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{visit.patient.full_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {visit.patient.mrn} • {visit.patient.age ? `${visit.patient.age}y` : ''}{' '}
                      {visit.patient.gender}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <ClinicPriorityBadge priority={visit.priority} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{formatWaitTime(visit.wait_time_minutes)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="max-w-[200px] truncate block">
                    {visit.chief_complaint || visit.notes || '--'}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={visit.status === 'CALLED' ? 'default' : 'secondary'}
                    className={cn(visit.status === 'CALLED' && 'bg-blue-500')}
                  >
                    {visit.status_display}
                  </Badge>
                </TableCell>
                {showActions && (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {(visit.status === 'REGISTERED' || visit.status === 'WAITING') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCallPatient(visit)}
                          disabled={isPending}
                        >
                          <Phone className="h-3 w-3 mr-1" />
                          Call
                        </Button>
                      )}
                      {visit.status === 'CALLED' && (
                        <Button
                          size="sm"
                          onClick={() => handleStartConsultation(visit)}
                          disabled={isPending}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Start
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => router.push(`/patients/${visit.patient.id}`)}
                          >
                            <User className="h-4 w-4 mr-2" />
                            View Patient
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedVisit(visit);
                              setReferDialogOpen(true);
                            }}
                          >
                            <ArrowRight className="h-4 w-4 mr-2" />
                            Refer to Clinic
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedVisit(visit);
                              setNoShowDialogOpen(true);
                            }}
                            className="text-orange-600"
                          >
                            <AlertCircle className="h-4 w-4 mr-2" />
                            Mark No-Show
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedVisit(visit);
                              setCancelDialogOpen(true);
                            }}
                            className="text-destructive"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Cancel Visit
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* No-Show Confirmation Dialog */}
      <AlertDialog open={noShowDialogOpen} onOpenChange={setNoShowDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as No-Show?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark {selectedVisit?.patient.full_name} as a no-show. They will be removed
              from the queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleNoShow} disabled={markingNoShow}>
              Mark No-Show
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Visit?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the visit for {selectedVisit?.patient.full_name}. They will be
              removed from the queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Visit</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancellingVisit}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel Visit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Refer Patient Dialog */}
      {selectedVisit && (
        <ReferPatientDialog
          open={referDialogOpen}
          onOpenChange={setReferDialogOpen}
          visit={selectedVisit}
          onSuccess={() => {
            onRefresh();
            setReferDialogOpen(false);
            setSelectedVisit(null);
          }}
        />
      )}
    </>
  );
}
