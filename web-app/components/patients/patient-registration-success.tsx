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

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
  Search,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/page-header';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/cn';
import { useCheckInPatient } from '@/lib/hooks/use-triage';
import { useClinics, useAddToQueue } from '@/lib/hooks/use-clinics';
import { useToast } from '@/lib/hooks/use-toast';
import { CheckinSuccessModal, type CheckinSuccessData } from './checkin-success-modal';
import type { Patient } from '@/lib/types/patient';
import type { ClinicListItem, ClinicVisitSource } from '@/lib/types/clinic';

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
  const addToQueue = useAddToQueue();

  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [showClinicSelector, setShowClinicSelector] = useState(false);
  const [clinicSearch, setClinicSearch] = useState('');
  const [isRoutingToClinic, setIsRoutingToClinic] = useState(false);

  // Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState<CheckinSuccessData | null>(null);

  // Fetch active clinics
  const { data: clinicsData, isLoading: clinicsLoading } = useClinics({
    is_open_today: true,
  });

  // Filter clinics by search
  const filteredClinics = useMemo(() => {
    const clinics = clinicsData?.results ?? [];
    if (!clinicSearch.trim()) return clinics;
    const search = clinicSearch.toLowerCase();
    return clinics.filter(
      (clinic) =>
        clinic.name.toLowerCase().includes(search) ||
        clinic.clinic_type_display?.toLowerCase().includes(search)
    );
  }, [clinicsData?.results, clinicSearch]);

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

  const handleRouteToClinic = async (clinic: ClinicListItem) => {
    setIsRoutingToClinic(true);
    try {
      const visit = await addToQueue.mutateAsync({
        clinicId: clinic.id,
        data: {
          patient_id: patient.id,
          priority: 'STANDARD',
          visit_type: 'NEW',
          source: 'DIRECT' as ClinicVisitSource,
          chief_complaint: '',
          notes: `Direct registration - routed to ${clinic.name}`,
        },
      });

      // Show success modal with navigation option
      setSuccessData({
        patientName: `${patient.first_name} ${patient.last_name}`,
        patientMrn: patient.mrn,
        destination: 'clinic',
        destinationName: clinic.name,
        destinationUrl: `/clinics/${clinic.id}/queue`,
        queuePosition: visit.queue_number,
        skippedTriage: true,
      });
      setShowSuccessModal(true);
      setShowClinicSelector(false);
    } catch (error) {
      toast({
        title: 'Failed to Route Patient',
        description: error instanceof Error ? error.message : 'Failed to add patient to clinic queue',
        variant: 'destructive',
      });
    } finally {
      setIsRoutingToClinic(false);
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
                    disabled={isCheckingIn || isRoutingToClinic}
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
                    variant={showClinicSelector ? 'default' : 'outline'}
                    className="w-full sm:w-auto xl:flex-1"
                    size="lg"
                    onClick={() => setShowClinicSelector(!showClinicSelector)}
                    disabled={isCheckingIn || isRoutingToClinic}
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
                  <Link href={`/patients/${patient.id}`} className="w-full sm:w-auto">
                    <Button
                      variant="ghost"
                      className="h-11 w-full sm:w-11"
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
                    className="h-11 w-full sm:w-11"
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
                  <Link href="/patients" className="w-full sm:w-auto">
                    <Button
                      variant="ghost"
                      className="h-11 w-full sm:w-11"
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

            {/* Clinic Selector (shown when "Route to Clinic" is clicked) */}
            {showClinicSelector && (
              <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Select Clinic</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowClinicSelector(false);
                      setClinicSearch('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>

                {/* Clinic Search */}
                <div className="relative">
                  <Input
                    placeholder="Search clinics..."
                    value={clinicSearch}
                    onChange={(e) => setClinicSearch(e.target.value)}
                    disabled={isRoutingToClinic}
                    className="pl-8"
                  />
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>

                {/* Clinic List */}
                <div className="max-h-48 overflow-y-auto border border-border rounded-lg bg-card">
                  {clinicsLoading ? (
                    <div className="p-4 text-center text-muted-foreground">
                      Loading clinics...
                    </div>
                  ) : filteredClinics.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      {clinicSearch ? 'No clinics match your search' : 'No active clinics available'}
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {filteredClinics.map((clinic) => (
                        <button
                          key={clinic.id}
                          type="button"
                          onClick={() => handleRouteToClinic(clinic)}
                          disabled={isRoutingToClinic}
                          className={cn(
                            'w-full p-3 text-left transition-colors',
                            'hover:bg-accent hover:text-accent-foreground focus:outline-none focus:bg-accent focus:text-accent-foreground',
                            isRoutingToClinic && 'opacity-50 cursor-not-allowed'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-sm">{clinic.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {clinic.clinic_type_display}
                              </div>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {isRoutingToClinic && (
                  <div className="text-center text-sm text-muted-foreground">
                    Adding patient to clinic queue...
                  </div>
                )}
              </div>
            )}
          </TooltipProvider>
        </CardContent>
      </Card>

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
