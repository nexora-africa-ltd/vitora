/**
 * Clinic Queue Actions Hook
 *
 * Encapsulates all queue action logic for calling patients, starting consultations,
 * marking no-shows, cancelling visits, etc. Provides unified handlers with toast
 * notifications and error handling.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useCallPatient,
  useStartConsultation,
  useCompleteVisit,
  useMarkNoShow,
  useCancelVisit,
} from './use-clinics';
import { toast } from './use-toast';
import type { ClinicVisit } from '@/lib/types/clinic';

export type QueueDialogType = 'no-show' | 'cancel' | 'refer' | null;

interface UseClinicQueueActionsOptions {
  onSuccess?: () => void;
}

interface UseClinicQueueActionsReturn {
  // Selected visit for dialogs
  selectedVisit: ClinicVisit | null;
  setSelectedVisit: (visit: ClinicVisit | null) => void;

  // Dialog state
  activeDialog: QueueDialogType;
  openDialog: (type: Exclude<QueueDialogType, null>, visit: ClinicVisit) => void;
  closeDialog: () => void;

  // Actions
  handleCallPatient: (visit: ClinicVisit) => Promise<void>;
  handleStartConsultation: (visit: ClinicVisit) => Promise<void>;
  handleNoShow: () => Promise<void>;
  handleCancel: () => Promise<void>;

  // Loading states
  isCallingPatient: boolean;
  isStartingConsultation: boolean;
  isMarkingNoShow: boolean;
  isCancellingVisit: boolean;
  isPending: boolean;
}

export function useClinicQueueActions(
  options: UseClinicQueueActionsOptions = {}
): UseClinicQueueActionsReturn {
  const { onSuccess } = options;
  const router = useRouter();

  // State
  const [selectedVisit, setSelectedVisit] = useState<ClinicVisit | null>(null);
  const [activeDialog, setActiveDialog] = useState<QueueDialogType>(null);

  // Mutations
  const { mutateAsync: callPatient, isPending: isCallingPatient } = useCallPatient();
  const { mutateAsync: startConsultation, isPending: isStartingConsultation } = useStartConsultation();
  const { mutateAsync: markNoShow, isPending: isMarkingNoShow } = useMarkNoShow();
  const { mutateAsync: cancelVisit, isPending: isCancellingVisit } = useCancelVisit();

  const isPending = isCallingPatient || isStartingConsultation || isMarkingNoShow || isCancellingVisit;

  // Dialog management
  const openDialog = useCallback((type: Exclude<QueueDialogType, null>, visit: ClinicVisit) => {
    setSelectedVisit(visit);
    setActiveDialog(type);
  }, []);

  const closeDialog = useCallback(() => {
    setActiveDialog(null);
    setSelectedVisit(null);
  }, []);

  // Action handlers
  const handleCallPatient = useCallback(
    async (visit: ClinicVisit) => {
      try {
        await callPatient(visit.id);
        toast({
          title: 'Patient Called',
          description: `${visit.patient.full_name} has been called.`,
        });
        onSuccess?.();
      } catch {
        toast({
          title: 'Error',
          description: 'Failed to call patient. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [callPatient, onSuccess]
  );

  const handleStartConsultation = useCallback(
    async (visit: ClinicVisit) => {
      try {
        const result = await startConsultation(visit.id);
        toast({
          title: 'Consultation Started',
          description: `Starting consultation for ${visit.patient.full_name}.`,
        });
        onSuccess?.();
        // Navigate to encounter if created
        if (result.encounter) {
          router.push(`/encounters/${result.encounter}`);
        }
      } catch {
        toast({
          title: 'Error',
          description: 'Failed to start consultation. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [startConsultation, onSuccess, router]
  );

  const handleNoShow = useCallback(async () => {
    if (!selectedVisit) return;
    try {
      await markNoShow(selectedVisit.id);
      toast({
        title: 'Marked as No-Show',
        description: `${selectedVisit.patient.full_name} has been marked as a no-show.`,
      });
      onSuccess?.();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to mark as no-show. Please try again.',
        variant: 'destructive',
      });
    } finally {
      closeDialog();
    }
  }, [selectedVisit, markNoShow, onSuccess, closeDialog]);

  const handleCancel = useCallback(async () => {
    if (!selectedVisit) return;
    try {
      await cancelVisit({ visitId: selectedVisit.id });
      toast({
        title: 'Visit Cancelled',
        description: `Visit for ${selectedVisit.patient.full_name} has been cancelled.`,
      });
      onSuccess?.();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to cancel visit. Please try again.',
        variant: 'destructive',
      });
    } finally {
      closeDialog();
    }
  }, [selectedVisit, cancelVisit, onSuccess, closeDialog]);

  return {
    selectedVisit,
    setSelectedVisit,
    activeDialog,
    openDialog,
    closeDialog,
    handleCallPatient,
    handleStartConsultation,
    handleNoShow,
    handleCancel,
    isCallingPatient,
    isStartingConsultation,
    isMarkingNoShow,
    isCancellingVisit,
    isPending,
  };
}
