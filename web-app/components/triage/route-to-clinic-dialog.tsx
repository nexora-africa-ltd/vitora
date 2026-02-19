/**
 * Route to Clinic Dialog
 *
 * Dialog for routing a triaged patient to a specific clinic.
 * Displays available clinics and allows selection with optional notes.
 */
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ArrowRight, Loader2, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useClinics } from '@/lib/hooks/use-clinics';
import { useRouteToClinic } from '@/lib/hooks/use-triage';
import { toast } from '@/lib/hooks/use-toast';
import { CheckinSuccessModal, type CheckinSuccessData } from '@/components/patients/checkin-success-modal';
import type { TriageAssessment } from '@/lib/types/triage';
import type { ClinicListItem } from '@/lib/types/clinic';
import { cn } from '@/lib/utils/cn';

interface RouteToClinicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assessment: TriageAssessment | null;
  onSuccess?: () => void;
}

const CLINIC_TYPE_LABELS: Record<string, string> = {
  GENERAL_OPD: 'General OPD',
  ANC: 'Antenatal',
  PNC: 'Postnatal',
  CWC: 'Child Welfare',
  IMMUNIZATION: 'Immunization',
  FP: 'Family Planning',
  EYE: 'Eye Clinic',
  DENTAL: 'Dental',
  CCC: 'CCC (HIV)',
  TB: 'TB Clinic',
  DIABETIC: 'Diabetic',
  HYPERTENSION: 'Hypertension',
  MENTAL_HEALTH: 'Mental Health',
  SURGICAL: 'Surgical',
};

export function RouteToClinicDialog({
  open,
  onOpenChange,
  assessment,
  onSuccess,
}: RouteToClinicDialogProps) {
  const router = useRouter();
  const [selectedClinic, setSelectedClinic] = useState<ClinicListItem | null>(null);
  const [notes, setNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState<CheckinSuccessData | null>(null);

  // Fetch active clinics
  const { data: clinicsData, isLoading: clinicsLoading } = useClinics({
    status: 'ACTIVE',
  });

  const clinics = useMemo(() => clinicsData?.results ?? [], [clinicsData?.results]);

  // Filter clinics by search query
  const filteredClinics = useMemo(() => {
    if (!searchQuery.trim()) return clinics;
    const query = searchQuery.toLowerCase();
    return clinics.filter(
      (clinic) =>
        clinic.name.toLowerCase().includes(query) ||
        clinic.clinic_type_display.toLowerCase().includes(query) ||
        clinic.code.toLowerCase().includes(query)
    );
  }, [clinics, searchQuery]);

  // Group clinics by type
  const clinicsByType = useMemo(() => {
    const grouped: Record<string, ClinicListItem[]> = {};
    filteredClinics.forEach((clinic) => {
      const type = clinic.clinic_type_display;
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(clinic);
    });
    return grouped;
  }, [filteredClinics]);

  // Route to clinic mutation
  const { mutateAsync: routeToClinic, isPending: isRouting } = useRouteToClinic();

  const handleRoute = async () => {
    if (!assessment || !selectedClinic) return;

    try {
      const result = await routeToClinic({
        assessmentId: assessment.id,
        clinicId: selectedClinic.id,
        notes: notes.trim() || undefined,
      });

      // Store result and show success modal
      setSuccessData({
        patientName: result.patient_name,
        patientMrn: result.patient_mrn,
        destination: 'clinic',
        destinationName: result.clinic_name,
        destinationUrl: `/clinics/${selectedClinic.id}/queue`,
        queuePosition: result.queue_number,
      });

      // Reset route dialog state
      setSelectedClinic(null);
      setNotes('');
      setSearchQuery('');
      onOpenChange(false);

      // Show success modal
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Failed to route to clinic:', error);
      toast({
        title: 'Error',
        description: 'Failed to route patient to clinic. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    setSelectedClinic(null);
    setNotes('');
    setSearchQuery('');
    onOpenChange(false);
  };

  const handleSuccessModalDismiss = () => {
    setSuccessData(null);
    onSuccess?.();
  };

  if (!assessment) return null;

  return (
  <>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Route to Clinic
          </DialogTitle>
          <DialogDescription>
            Route <strong>{assessment.patient_name}</strong> to a clinic queue after triage
            assessment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Patient & Triage Info */}
          <div className="rounded-lg border bg-muted/50 p-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Patient:</span>{' '}
                <span className="font-medium">{assessment.patient_name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">MRN:</span>{' '}
                <span className="font-medium">{assessment.encounter_mrn}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Triage Category:</span>{' '}
                <Badge
                  variant="outline"
                  className={cn(
                    'ml-1',
                    assessment.triage_category === 'RED' && 'bg-red-100 text-red-800 border-red-300',
                    assessment.triage_category === 'ORANGE' && 'bg-orange-100 text-orange-800 border-orange-300',
                    assessment.triage_category === 'YELLOW' && 'bg-yellow-100 text-yellow-800 border-yellow-300',
                    assessment.triage_category === 'GREEN' && 'bg-green-100 text-green-800 border-green-300',
                    assessment.triage_category === 'BLUE' && 'bg-blue-100 text-blue-800 border-blue-300'
                  )}
                >
                  {assessment.triage_category}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Chief Complaint:</span>{' '}
                <span className="font-medium">{assessment.chief_complaint_category}</span>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search clinics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Clinic Selection */}
          <div className="space-y-2">
            <Label>Select Clinic</Label>
            <ScrollArea className="h-[240px] rounded-md border">
              {clinicsLoading ? (
                <div className="space-y-2 p-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredClinics.length === 0 ? (
                <div className="flex h-full items-center justify-center p-4 text-muted-foreground">
                  {searchQuery ? 'No clinics match your search' : 'No active clinics available'}
                </div>
              ) : (
                <div className="p-2 space-y-3">
                  {Object.entries(clinicsByType).map(([type, typeClinic]) => (
                    <div key={type}>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 px-2">
                        {type}
                      </div>
                      <div className="space-y-1">
                        {typeClinic.map((clinic) => (
                          <button
                            key={clinic.id}
                            onClick={() => setSelectedClinic(clinic)}
                            className={cn(
                              'w-full flex items-center justify-between rounded-md p-2 text-sm transition-colors',
                              'hover:bg-accent hover:text-accent-foreground',
                              selectedClinic?.id === clinic.id && 'bg-primary text-primary-foreground'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 shrink-0" />
                              <div className="text-left">
                                <div className="font-medium">{clinic.name}</div>
                                {clinic.location && (
                                  <div className="text-xs opacity-70">{clinic.location}</div>
                                )}
                              </div>
                            </div>
                            {clinic.is_open_today && (
                              <Badge variant="secondary" className="shrink-0 text-xs">
                                Open
                              </Badge>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="route-notes">Notes (optional)</Label>
            <Textarea
              id="route-notes"
              placeholder="Add any routing notes or special instructions..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isRouting}>
            Cancel
          </Button>
          <Button onClick={handleRoute} disabled={!selectedClinic || isRouting}>
            {isRouting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Routing...
              </>
            ) : (
              <>
                <ArrowRight className="mr-2 h-4 w-4" />
                Route to {selectedClinic?.name ?? 'Clinic'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Success Modal with navigation options */}
    <CheckinSuccessModal
      open={showSuccessModal}
      onOpenChange={setShowSuccessModal}
      checkInResult={successData}
      onDismiss={handleSuccessModalDismiss}
    />
  </>
  );
}
