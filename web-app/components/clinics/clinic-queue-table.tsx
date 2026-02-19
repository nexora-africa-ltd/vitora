/**
 * Clinic Queue Table Component
 *
 * Displays the clinic queue with patient information, priority badges,
 * wait times, and action buttons for calling/starting consultation.
 * Uses ResponsiveTable for automatic mobile card layouts.
 */
'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Phone,
  Play,
  MoreHorizontal,
  Clock,
  User,
  AlertCircle,
  XCircle,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { ClinicPriorityBadge } from './clinic-priority-badge';
import { ClinicVisitStatusBadge } from './clinic-visit-status-badge';
import { ClinicQueueMobileCard } from './clinic-queue-mobile-card';
import { ReferPatientDialog } from './refer-patient-dialog';
import {
  useClinicQueueActions,
  type QueueDialogType,
} from '@/lib/hooks/use-clinic-queue-actions';
import type { ClinicVisit } from '@/lib/types/clinic';
import { cn } from '@/lib/utils/cn';

// =============================================================================
// TYPES
// =============================================================================

interface ClinicQueueTableProps {
  visits: ClinicVisit[];
  clinicId: number;
  onRefresh: () => void;
  showActions?: boolean;
}

// =============================================================================
// UTILS
// =============================================================================

function formatWaitTime(minutes: number | undefined): string {
  if (!minutes || minutes < 1) return 'Just arrived';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface QueueRowActionsProps {
  visit: ClinicVisit;
  isPending: boolean;
  onCall: (visit: ClinicVisit) => void;
  onStart: (visit: ClinicVisit) => void;
  onViewPatient: (visit: ClinicVisit) => void;
  onRefer: (visit: ClinicVisit) => void;
  onNoShow: (visit: ClinicVisit) => void;
  onCancel: (visit: ClinicVisit) => void;
}

function QueueRowActions({
  visit,
  isPending,
  onCall,
  onStart,
  onViewPatient,
  onRefer,
  onNoShow,
  onCancel,
}: QueueRowActionsProps) {
  const canCall = visit.status === 'REGISTERED' || visit.status === 'WAITING';
  const canStart = visit.status === 'CALLED';

  return (
    <div className="flex items-center justify-end gap-2">
      {canCall && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onCall(visit)}
          disabled={isPending}
        >
          <Phone className="h-3 w-3 mr-1" />
          Call
        </Button>
      )}
      {canStart && (
        <Button
          size="sm"
          onClick={() => onStart(visit)}
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
          <DropdownMenuItem onClick={() => onViewPatient(visit)}>
            <User className="h-4 w-4 mr-2" />
            View Patient
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onRefer(visit)}>
            <ArrowRight className="h-4 w-4 mr-2" />
            Refer to Clinic
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onNoShow(visit)} className="text-orange-600">
            <AlertCircle className="h-4 w-4 mr-2" />
            Mark No-Show
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onCancel(visit)} className="text-destructive">
            <XCircle className="h-4 w-4 mr-2" />
            Cancel Visit
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// =============================================================================
// DIALOGS
// =============================================================================

interface ConfirmationDialogsProps {
  activeDialog: QueueDialogType;
  selectedVisit: ClinicVisit | null;
  isMarkingNoShow: boolean;
  isCancellingVisit: boolean;
  onNoShowConfirm: () => void;
  onCancelConfirm: () => void;
  onClose: () => void;
}

function ConfirmationDialogs({
  activeDialog,
  selectedVisit,
  isMarkingNoShow,
  isCancellingVisit,
  onNoShowConfirm,
  onCancelConfirm,
  onClose,
}: ConfirmationDialogsProps) {
  return (
    <>
      {/* No-Show Confirmation Dialog */}
      <AlertDialog open={activeDialog === 'no-show'} onOpenChange={(open) => !open && onClose()}>
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
            <AlertDialogAction onClick={onNoShowConfirm} disabled={isMarkingNoShow}>
              Mark No-Show
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={activeDialog === 'cancel'} onOpenChange={(open) => !open && onClose()}>
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
              onClick={onCancelConfirm}
              disabled={isCancellingVisit}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel Visit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ClinicQueueTable({
  visits,
  clinicId,
  onRefresh,
  showActions = true,
}: ClinicQueueTableProps) {
  const router = useRouter();

  // Mobile actions sheet state
  const [mobileActionsVisit, setMobileActionsVisit] = useState<ClinicVisit | null>(null);

  // Queue actions hook
  const {
    selectedVisit,
    setSelectedVisit,
    activeDialog,
    openDialog,
    closeDialog,
    handleCallPatient,
    handleStartConsultation,
    handleNoShow,
    handleCancel,
    isMarkingNoShow,
    isCancellingVisit,
    isPending,
  } = useClinicQueueActions({ onSuccess: onRefresh });

  // Navigation handlers
  const handleViewPatient = useCallback(
    (visit: ClinicVisit) => router.push(`/patients/${visit.patient.id}`),
    [router]
  );

  const handleOpenRefer = useCallback(
    (visit: ClinicVisit) => openDialog('refer', visit),
    [openDialog]
  );

  const handleOpenNoShow = useCallback(
    (visit: ClinicVisit) => openDialog('no-show', visit),
    [openDialog]
  );

  const handleOpenCancel = useCallback(
    (visit: ClinicVisit) => openDialog('cancel', visit),
    [openDialog]
  );

  // Table columns configuration
  const columns = useMemo(
    () => [
      {
        key: 'queue_number',
        header: '#',
        className: 'w-[60px]',
        cell: (visit: ClinicVisit) => (
          <span className="font-medium">{visit.queue_number}</span>
        ),
      },
      {
        key: 'patient',
        header: 'Patient',
        cell: (visit: ClinicVisit) => (
          <div className="flex flex-col">
            <span className="font-medium">{visit.patient.full_name}</span>
            <span className="text-xs text-muted-foreground">
              {visit.patient.mrn} • {visit.patient.age ? `${visit.patient.age}y` : ''}{' '}
              {visit.patient.gender}
            </span>
          </div>
        ),
      },
      {
        key: 'priority',
        header: 'Priority',
        hideOnMobile: true,
        cell: (visit: ClinicVisit) => <ClinicPriorityBadge priority={visit.priority} />,
      },
      {
        key: 'wait_time',
        header: 'Wait Time',
        hideOnMobile: true,
        cell: (visit: ClinicVisit) => (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{formatWaitTime(visit.wait_time_minutes)}</span>
          </div>
        ),
      },
      {
        key: 'chief_complaint',
        header: 'Chief Complaint',
        hideOnMobile: true,
        cell: (visit: ClinicVisit) => (
          <span className="max-w-[200px] truncate block">
            {visit.chief_complaint || visit.notes || '--'}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        hideOnMobile: true,
        cell: (visit: ClinicVisit) => (
          <ClinicVisitStatusBadge status={visit.status} statusDisplay={visit.status_display} />
        ),
      },
      ...(showActions
        ? [
            {
              key: 'actions',
              header: 'Actions',
              className: 'text-right',
              hideOnMobile: true,
              cell: (visit: ClinicVisit) => (
                <QueueRowActions
                  visit={visit}
                  isPending={isPending}
                  onCall={handleCallPatient}
                  onStart={handleStartConsultation}
                  onViewPatient={handleViewPatient}
                  onRefer={handleOpenRefer}
                  onNoShow={handleOpenNoShow}
                  onCancel={handleOpenCancel}
                />
              ),
            },
          ]
        : []),
    ],
    [
      showActions,
      isPending,
      handleCallPatient,
      handleStartConsultation,
      handleViewPatient,
      handleOpenRefer,
      handleOpenNoShow,
      handleOpenCancel,
    ]
  );

  // Row styling based on status/priority
  const getRowClassName = useCallback(
    (visit: ClinicVisit) =>
      cn(
        visit.status === 'CALLED' && 'bg-blue-50 dark:bg-blue-950/20',
        visit.priority === 'EMERGENCY' && 'bg-red-50 dark:bg-red-950/20'
      ),
    []
  );

  // Mobile card renderer
  const renderMobileCard = useCallback(
    (visit: ClinicVisit) => (
      <ClinicQueueMobileCard
        visit={visit}
        waitTime={formatWaitTime(visit.wait_time_minutes)}
        showActions={showActions}
        isPending={isPending}
        onCall={handleCallPatient}
        onStart={handleStartConsultation}
        onMenuOpen={setMobileActionsVisit}
      />
    ),
    [showActions, isPending, handleCallPatient, handleStartConsultation]
  );

  return (
    <>
      <div className="rounded-md border">
        <ResponsiveTable<ClinicVisit>
          data={visits}
          columns={columns}
          keyExtractor={(visit) => visit.id}
          rowClassName={getRowClassName}
          mobileCard={renderMobileCard}
          emptyMessage="No patients in queue"
        />
      </div>

      {/* Mobile Actions Sheet */}
      <Sheet
        open={!!mobileActionsVisit}
        onOpenChange={(open) => !open && setMobileActionsVisit(null)}
      >
        <SheetContent side="bottom" className="pb-safe">
          <SheetHeader>
            <SheetTitle>
              {mobileActionsVisit?.patient.full_name}
            </SheetTitle>
          </SheetHeader>
          <div className="grid gap-2 py-4">
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => {
                if (mobileActionsVisit) handleViewPatient(mobileActionsVisit);
                setMobileActionsVisit(null);
              }}
            >
              <User className="h-4 w-4 mr-2" />
              View Patient
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => {
                if (mobileActionsVisit) handleOpenRefer(mobileActionsVisit);
                setMobileActionsVisit(null);
              }}
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              Refer to Clinic
            </Button>
            <Button
              variant="outline"
              className="justify-start text-orange-600"
              onClick={() => {
                if (mobileActionsVisit) handleOpenNoShow(mobileActionsVisit);
                setMobileActionsVisit(null);
              }}
            >
              <AlertCircle className="h-4 w-4 mr-2" />
              Mark No-Show
            </Button>
            <Button
              variant="outline"
              className="justify-start text-destructive"
              onClick={() => {
                if (mobileActionsVisit) handleOpenCancel(mobileActionsVisit);
                setMobileActionsVisit(null);
              }}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancel Visit
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirmation Dialogs */}
      <ConfirmationDialogs
        activeDialog={activeDialog}
        selectedVisit={selectedVisit}
        isMarkingNoShow={isMarkingNoShow}
        isCancellingVisit={isCancellingVisit}
        onNoShowConfirm={handleNoShow}
        onCancelConfirm={handleCancel}
        onClose={closeDialog}
      />

      {/* Refer Patient Dialog */}
      {selectedVisit && activeDialog === 'refer' && (
        <ReferPatientDialog
          open={true}
          onOpenChange={(open) => !open && closeDialog()}
          visit={selectedVisit}
          onSuccess={() => {
            onRefresh();
            closeDialog();
          }}
        />
      )}
    </>
  );
}
