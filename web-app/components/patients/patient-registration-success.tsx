/**
 * Patient Registration Success Component
 *
 * Displays success message after patient registration with next action options:
 * - Check in to triage queue (recommended flow)
 * - Route directly to a clinic (skip triage)
 * - View patient profile
 * - Register another patient
 *
 * The "Route to Clinic" option mirrors the triage assessment flow,
 * allowing staff to send patients directly to a specific clinic queue.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  UserPlus,
  UserRound,
  UserRoundPlus,
  UsersRound,
  ArrowRight,
  Clock,
  Activity,
  FileText,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCheckInPatient } from '@/lib/hooks/use-triage';
import { useToast } from '@/lib/hooks/use-toast';
import { CheckinSuccessModal, type CheckinSuccessData } from './checkin-success-modal';
import { RouteToClinicDialog } from '@/components/triage/route-to-clinic-dialog';
import type { Patient } from '@/lib/types/patient';

interface PatientRegistrationSuccessProps {
  patient: Patient;
  onRegisterAnother: () => void;
}

export function PatientRegistrationSuccess({
  patient,
  onRegisterAnother,
}: PatientRegistrationSuccessProps) {
  const { toast } = useToast();
  const checkInPatient = useCheckInPatient();

  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [showRouteDialog, setShowRouteDialog] = useState(false);

  // Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState<CheckinSuccessData | null>(null);

  const handleCheckInToQueue = async () => {
    setIsCheckingIn(true);
    try {
      const result = await checkInPatient.mutateAsync({
        patient_id: patient.id,
        reason_for_visit: '',
        create_encounter: true,
      });

      // Show success modal with navigation option
      setSuccessData({
        patientName: `${patient.first_name} ${patient.last_name}`,
        patientMrn: patient.mrn,
        destination: 'triage',
        destinationName: 'Triage Queue',
        destinationUrl: '/triage',
        patientId: patient.id,
        encounterId: (result as { encounter?: number | null }).encounter ?? null,
        // WaitingQueueEntry doesn't have queue_position, so we omit it
      });
      setShowSuccessModal(true);
    } catch (error) {
      toast({
        title: 'Check-in Failed',
        description: error instanceof Error ? error.message : 'Failed to check in patient',
        variant: 'destructive',
      });
    } finally {
      setIsCheckingIn(false);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Patient Registered"
        helpContent="Registration completed successfully. Choose your next step: check in to triage, route to a clinic, or register another patient."
      />

      {/* Success Card */}
      <Card className="border-green-200 dark:border-green-900">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-green-600">Registration Successful</CardTitle>
              <p className="text-sm text-muted-foreground">
                Patient has been registered in the system
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Patient summary */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Name</span>
              <span className="font-medium">
                {patient.first_name} {patient.last_name}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">MRN</span>
              <span className="font-mono font-medium">{patient.mrn}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Date of Birth</span>
              <span className="font-medium">{patient.date_of_birth}</span>
            </div>
          </div>

          {/* Patient Flow Indicator */}
          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium mb-3">Recommended Patient Flow</p>
            {/* Mobile: simplified view showing current + next step */}
            <div className="flex sm:hidden items-center justify-center gap-3">
              <div className="flex flex-col items-center text-center">
                <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-1">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <span className="text-xs font-medium">Registered</span>
                <Badge variant="default" className="mt-1 text-[10px]">Done</Badge>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col items-center text-center">
                <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-1">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <span className="text-xs font-medium">Triage</span>
                <Badge variant="outline" className="mt-1 text-[10px]">Next</Badge>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground">+2 more</span>
            </div>
            {/* Desktop: full flow */}
            <div className="hidden sm:flex items-center justify-between">
              <div className="flex flex-col items-center text-center">
                <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-1">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <span className="text-xs font-medium">Registered</span>
                <Badge variant="default" className="mt-1 text-[10px]">Complete</Badge>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col items-center text-center">
                <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-1">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <span className="text-xs font-medium">Awaiting Triage</span>
                <Badge variant="outline" className="mt-1 text-[10px]">Next Step</Badge>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col items-center text-center">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1">
                  <Activity className="h-5 w-5 text-muted-foreground" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">Vitals Recorded</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col items-center text-center">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">Consultation</span>
              </div>
            </div>
          </div>

          <TooltipProvider delayDuration={200}>
            {/* Action buttons */}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 xl:flex-nowrap">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="w-full sm:w-auto xl:flex-1"
                    size="lg"
                    onClick={handleCheckInToQueue}
                    disabled={isCheckingIn || showRouteDialog}
                    title="Adds the patient to the triage waiting queue so vitals/triage can begin."
                  >
                    <UserPlus className="h-5 w-5 sm:mr-2" />
                    <span className="ml-2 sm:ml-0">
                      {isCheckingIn ? 'Checking In...' : (
                        <>
                          <span className="sm:hidden">Check In</span>
                          <span className="hidden sm:inline">Check In to Triage Queue</span>
                        </>
                      )}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Adds the patient to the triage waiting queue so vitals/triage can begin.
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showRouteDialog ? 'default' : 'outline'}
                    className="w-full sm:w-auto xl:flex-1"
                    size="lg"
                    onClick={() => setShowRouteDialog(true)}
                    disabled={isCheckingIn}
                    title="Skip triage and route patient directly to a clinic queue."
                  >
                    <Building2 className="h-5 w-5 sm:mr-2" />
                    <span className="ml-2 sm:ml-0">
                      <span className="sm:hidden">To Clinic</span>
                      <span className="hidden sm:inline">Route to Clinic</span>
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Skip triage and route patient directly to a clinic queue.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href={`/patients/${patient.id}`} className="w-full lg:flex-1 xl:w-auto xl:flex-none">
                    <Button
                      variant="ghost"
                      className="h-11 w-full xl:w-11"
                      size="icon"
                      aria-label="View Profile"
                    >
                      <UserRound className="h-5 w-5" />
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent>View Profile</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-11 w-full lg:flex-1 xl:w-11 xl:flex-none"
                    size="icon"
                    onClick={onRegisterAnother}
                    aria-label="Register Another"
                  >
                    <UserRoundPlus className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Register Another</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/patients" className="w-full lg:flex-1 xl:w-auto xl:flex-none">
                    <Button
                      variant="ghost"
                      className="h-11 w-full xl:w-11"
                      size="icon"
                      aria-label="Back to Patients"
                    >
                      <UsersRound className="h-5 w-5" />
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent>Back to Patients</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      <RouteToClinicDialog
        open={showRouteDialog}
        onOpenChange={setShowRouteDialog}
        patient={{
          id: patient.id,
          first_name: patient.first_name,
          last_name: patient.last_name,
          mrn: patient.mrn,
        }}
      />

      {/* Check-in Success Modal with navigation options */}
      <CheckinSuccessModal
        open={showSuccessModal}
        onOpenChange={setShowSuccessModal}
        checkInResult={successData}
        onDismiss={() => setSuccessData(null)}
      />
    </div>
  );
}
