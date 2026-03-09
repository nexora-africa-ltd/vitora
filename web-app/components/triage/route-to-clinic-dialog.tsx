/**
 * Route to Clinic Dialog
 *
 * Dialog for routing a triaged patient to a specific clinic.
 * Displays available clinics and allows selection with optional notes.
 */
'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
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
import { useAddToQueue, useInfiniteClinics } from '@/lib/hooks/use-clinics';
import { useRouteToClinic } from '@/lib/hooks/use-triage';
import { toast } from '@/lib/hooks/use-toast';
import { getApiErrorMessage } from '@/lib/api/client';
import { CheckinSuccessModal, type CheckinSuccessData } from '@/components/patients/checkin-success-modal';
import type { TriageAssessment } from '@/lib/types/triage';
import type { ClinicListItem, ClinicVisitSource } from '@/lib/types/clinic';
import type { Patient } from '@/lib/types/patient';
import { cn } from '@/lib/utils/cn';
import { useDebounce } from '@/lib/hooks/use-debounce';

export interface DirectRouteToClinicPayload {
  clinic: ClinicListItem;
  notes?: string;
}

interface RouteToClinicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assessment?: TriageAssessment | null;
  patient?: Pick<Patient, 'id' | 'first_name' | 'last_name' | 'mrn'> | null;
  onSuccess?: () => void;
  onDirectRoute?: (payload: DirectRouteToClinicPayload) => Promise<CheckinSuccessData | null | void>;
}

export function RouteToClinicDialog({
  open,
  onOpenChange,
  assessment,
  patient,
  onSuccess,
  onDirectRoute,
}: RouteToClinicDialogProps) {
  const [selectedClinic, setSelectedClinic] = useState<ClinicListItem | null>(null);
  const [notes, setNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState<CheckinSuccessData | null>(null);
  const [isDirectRoutingCustom, setIsDirectRoutingCustom] = useState(false);
  const clinicScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const {
    data: clinicPages,
    isLoading: clinicsLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteClinics({
    status: 'ACTIVE',
    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
  });

  const clinics = useMemo(
    () => clinicPages?.pages.flatMap((page) => page.results) ?? [],
    [clinicPages]
  );

  useEffect(() => {
    const viewport = clinicScrollAreaRef.current?.querySelector('[data-slot="scroll-area-viewport"]');
    const sentinel = loadMoreRef.current;

    if (!viewport || !sentinel || !hasNextPage) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      {
        root: viewport,
        rootMargin: '120px 0px',
      }
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, clinics.length]);

  // Group clinics by type (filtering is now server-side via search param)
  const clinicsByType = useMemo(() => {
    const grouped: Record<string, ClinicListItem[]> = {};
    clinics.forEach((clinic) => {
      const type = clinic.clinic_type_display;
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(clinic);
    });
    return grouped;
  }, [clinics]);

  // Eagerly fetch remaining pages when search narrows results
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && debouncedSearch.trim()) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, debouncedSearch, fetchNextPage, clinics.length]);

  // Route to clinic mutation
  const { mutateAsync: routeToClinic, isPending: isRoutingTriage } = useRouteToClinic();
  const addToQueue = useAddToQueue();
  const isRouting = isRoutingTriage || addToQueue.isPending || isDirectRoutingCustom;

  const patientName = assessment
    ? assessment.patient_name
    : patient
      ? `${patient.first_name} ${patient.last_name}`.trim()
      : '';

  const patientMrn = assessment?.encounter_mrn ?? patient?.mrn ?? '';
  const isDirectRoute = !assessment && !!patient;

  const handleRoute = async () => {
    if (!selectedClinic || (!assessment && !patient)) return;

    try {
      let nextSuccessData: CheckinSuccessData | null = null;

      if (assessment) {
        const result = await routeToClinic({
          assessmentId: assessment.id,
          clinicId: selectedClinic.id,
          notes: notes.trim() || undefined,
        });

        nextSuccessData = {
          patientName: result.patient_name,
          patientMrn: result.patient_mrn,
          destination: 'clinic',
          destinationName: result.clinic_name,
          destinationUrl: `/clinics/${selectedClinic.id}/queue`,
          queuePosition: result.queue_number,
        };
      } else if (patient) {
        if (onDirectRoute) {
          setIsDirectRoutingCustom(true);
          nextSuccessData = (await onDirectRoute({
            clinic: selectedClinic,
            notes: notes.trim() || undefined,
          })) ?? null;
          setIsDirectRoutingCustom(false);
        } else {
          const directPatientName = `${patient.first_name} ${patient.last_name}`.trim();

          const visit = await addToQueue.mutateAsync({
            clinicId: selectedClinic.id,
            data: {
              patient_id: patient.id,
              priority: 'STANDARD',
              visit_type: 'NEW',
              source: 'DIRECT' as ClinicVisitSource,
              chief_complaint: '',
              notes: notes.trim() || `Direct registration - routed to ${selectedClinic.name}`,
            },
          });

          nextSuccessData = {
            patientName: directPatientName,
            patientMrn: patient.mrn,
            destination: 'clinic',
            destinationName: selectedClinic.name,
            destinationUrl: `/clinics/${selectedClinic.id}/queue`,
            queuePosition: visit.queue_number,
            skippedTriage: true,
          };
        }
      }

      // Reset route dialog state
      setSelectedClinic(null);
      setNotes('');
      setSearchQuery('');
      onOpenChange(false);

      // Show success modal
      if (nextSuccessData) {
        setSuccessData(nextSuccessData);
        setShowSuccessModal(true);
      }
    } catch (error) {
      setIsDirectRoutingCustom(false);
      console.error('Failed to route to clinic:', error);
      toast({
        title: 'Error',
        description: getApiErrorMessage(error),
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

  if (!assessment && !patient) return null;

  return (
  <>
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleClose();
        }
      }}
    >
      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-[600px] flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="px-4 pt-5 pb-3 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Route to Clinic
          </DialogTitle>
          <DialogDescription className="text-sm">
            {isDirectRoute ? (
              <>
                Route <strong>{patientName}</strong> directly to an open clinic queue and skip triage.
              </>
            ) : (
              <>
                Route <strong>{patientName}</strong> to a clinic queue after triage assessment.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-4 pb-3 sm:px-6 sm:pb-4">
            {/* Patient Context */}
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Patient:</span>{' '}
                  <span className="font-medium break-words">{patientName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">MRN:</span>{' '}
                  <span className="font-medium break-words">{patientMrn}</span>
                </div>
                {assessment ? (
                  <>
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
                      <span className="font-medium break-words">{assessment.chief_complaint_category}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="text-muted-foreground">Flow:</span>{' '}
                      <Badge variant="outline" className="ml-1">Direct Registration</Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Triage:</span>{' '}
                      <span className="font-medium">Will be skipped</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search clinics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>

            {/* Clinic Selection */}
            <div className="space-y-2">
              <Label className="text-sm">Select Clinic</Label>
              <ScrollArea ref={clinicScrollAreaRef} className="h-[180px] sm:h-[200px] rounded-md border">
                {clinicsLoading ? (
                  <div className="space-y-2 p-3">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : clinics.length === 0 ? (
                  <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
                    {debouncedSearch ? 'No clinics match your search' : 'No active clinics available'}
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
                              <div className="flex min-w-0 items-center gap-2">
                                <Building2 className="h-4 w-4 shrink-0" />
                                <div className="text-left min-w-0">
                                  <div className="font-medium break-words">{clinic.name}</div>
                                  {clinic.location && (
                                    <div className="text-xs opacity-70 break-words">{clinic.location}</div>
                                  )}
                                </div>
                              </div>
                              {clinic.is_open_today && (
                                <Badge variant="secondary" className="ml-2 shrink-0 text-xs">
                                  Open
                                </Badge>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div ref={loadMoreRef} className="flex justify-center py-2">
                      {isFetchingNextPage ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Loading more clinics...
                        </div>
                      ) : hasNextPage ? (
                        <span className="text-xs text-muted-foreground">Scroll to load more</span>
                      ) : clinics.length > 0 ? (
                        <span className="text-xs text-muted-foreground">All clinics loaded</span>
                      ) : null}
                    </div>
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="route-notes" className="text-sm">Notes (optional)</Label>
              <Textarea
                id="route-notes"
                placeholder={isDirectRoute
                  ? 'Add routing notes or direct registration instructions...'
                  : 'Add any routing notes or special instructions...'}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>
        </div>

        <div className="border-t px-4 py-3 sm:px-6">
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" size="sm" onClick={handleClose} disabled={isRouting} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button size="sm" onClick={handleRoute} disabled={!selectedClinic || isRouting} className="w-full sm:w-auto">
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
        </div>
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
