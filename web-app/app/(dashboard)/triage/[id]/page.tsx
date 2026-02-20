/**
 * Triage Module - View/Edit Assessment Page
 *
 * View details of an existing triage assessment or edit it.
 *
 * Route: /triage/[id]
 */
'use client';

import { useCallback, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Edit2,
  Building2,
  User,
  Clock,
  MapPin,
  Activity,
  Thermometer,
  Heart,
  Wind,
  Droplets,
  Stethoscope,
  AlertCircle,
  PersonStanding,
  Ambulance,
  Siren,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  TriageCategoryBadge,
  VitalAlertsPanel,
  RouteToClinicDialog,
  RouteToEmergencyDialog,
  TriageAssessmentEditForm,
} from '@/components/triage';
import type { TriageEditPermissions } from '@/components/triage';
import {
  useTriageAssessment,
  useUpdateTriageAssessment,
} from '@/lib/hooks/use-triage';
import { useEncounter } from '@/lib/hooks/use-encounters';
import { useAuth } from '@/lib/auth';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { toast } from '@/lib/hooks/use-toast';
import type { TriageAssessment } from '@/lib/types/triage';
import type { TriageAssessmentUpdateData } from '@/lib/api/triage';
import {
  ASSIGNED_AREA_CONFIG,
  ARRIVAL_MODE_CONFIG,
  AVPU_CONFIG,
  MOBILITY_CONFIG,
} from '@/lib/types/triage';
import { cn } from '@/lib/utils/cn';
import Link from 'next/link';

// =============================================================================
// VITALS DISPLAY
// =============================================================================

interface VitalCardProps {
  label: string;
  value: number | string | null | undefined;
  unit?: string;
  icon: React.ReactNode;
  normalRange?: string;
  isAbnormal?: boolean;
  isCritical?: boolean;
}

function VitalCard({ label, value, unit, icon, normalRange, isAbnormal, isCritical }: VitalCardProps) {
  return (
    <div
      className={cn(
        'p-3 rounded-lg border transition-colors',
        isCritical && value != null && 'border-destructive bg-destructive/5',
        isAbnormal && !isCritical && value != null && 'border-amber-500 bg-amber-500/5',
        !isAbnormal && !isCritical && 'border-border'
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            'text-xl font-semibold',
            isCritical && value != null && 'text-destructive',
            isAbnormal && !isCritical && value != null && 'text-amber-600'
          )}
        >
          {value ?? '—'}
        </span>
        {value != null && unit && (
          <span className="text-xs text-muted-foreground">{unit}</span>
        )}
      </div>
      {normalRange && (
        <p className="text-xs text-muted-foreground mt-1">Normal: {normalRange}</p>
      )}
    </div>
  );
}

// =============================================================================
// MAIN PAGE COMPONENT
// =============================================================================

export default function TriageAssessmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const assessmentId = params.id as string;

  const [isEditing, setIsEditing] = useState(false);
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [emergencyDialogOpen, setEmergencyDialogOpen] = useState(false);

  // Auth and permissions
  const { user } = useAuth();
  const { hasPermission, isSuperuser } = usePermissions();

  // Fetch assessment data
  const {
    data: assessment,
    isLoading,
    error,
    refetch,
  } = useTriageAssessment(parseInt(assessmentId, 10));

  // Fetch encounter data for ownership check
  const { data: encounter } = useEncounter(assessment?.encounter ?? 0);

  // Calculate edit permissions
  const editPermissions = useMemo((): TriageEditPermissions => {
    // Default: no permissions
    if (!user || !assessment) {
      return {
        canEditAssessment: false,
        canEditVitals: false,
        canEditCategory: false,
        vitalsDisabledReason: 'Loading...',
      };
    }

    // Check base triage permission
    const hasTriagePermission = hasPermission('change_triageassessment') ||
                                hasPermission('triage.change_triageassessment');
    const canEditAssessment = isSuperuser || hasTriagePermission;
    const canEditCategory = canEditAssessment;

    // For vitals editing, require ownership + permission
    // Encounter must not be CLOSED or CANCELLED
    const encounterStatus = encounter?.status;
    const isEncounterEditable = !encounterStatus ||
                                encounterStatus === 'CREATED' ||
                                encounterStatus === 'IN_PROGRESS';

    // Check ownership: user is the encounter creator or assigned clinician
    const isEncounterOwner = encounter
      ? (encounter.created_by === user.id || encounter.assigned_clinician === user.id)
      : false;

    // Superusers can always edit vitals
    // Others need: ownership + permission + editable encounter
    let canEditVitals = false;
    let vitalsDisabledReason: string | undefined;

    if (isSuperuser) {
      canEditVitals = true;
    } else if (!isEncounterEditable) {
      vitalsDisabledReason = 'Encounter is closed or cancelled';
    } else if (!isEncounterOwner) {
      vitalsDisabledReason = 'Only the encounter owner can edit vitals';
    } else if (!hasTriagePermission) {
      vitalsDisabledReason = 'Missing triage edit permission';
    } else {
      canEditVitals = true;
    }

    return {
      canEditAssessment,
      canEditVitals,
      canEditCategory,
      vitalsDisabledReason,
    };
  }, [user, assessment, encounter, hasPermission, isSuperuser]);

  // Update mutation
  const { mutateAsync: updateAssessment, isPending: isUpdating } = useUpdateTriageAssessment();

  const handleEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleSubmit = useCallback(
    async (data: TriageAssessmentUpdateData) => {
      try {
        await updateAssessment({
          id: parseInt(assessmentId, 10),
          data,
        });

        toast({
          title: 'Assessment Updated',
          description: 'Triage assessment has been updated successfully.',
        });

        setIsEditing(false);
        refetch();
      } catch (err) {
        toast({
          title: 'Error',
          description: 'Failed to update assessment. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [assessmentId, updateAssessment, refetch]
  );

  const handleRouteSuccess = useCallback(() => {
    refetch();
    toast({
      title: 'Success',
      description: 'Patient has been routed to clinic queue.',
    });
  }, [refetch]);

  const handleEmergencyRouteSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  // Format arrival time
  const formattedArrivalTime = useMemo(() => {
    if (!assessment?.arrival_time) return null;
    return new Date(assessment.arrival_time).toLocaleString();
  }, [assessment?.arrival_time]);

  // Get area/routing label
  const routingDestination = useMemo(() => {
    if (!assessment) return 'Not assigned';
    if (assessment.routing_destination) return assessment.routing_destination;
    if (assessment.assigned_clinic_name) return assessment.assigned_clinic_name;
    if (assessment.assigned_area && assessment.assigned_area in ASSIGNED_AREA_CONFIG) {
      return ASSIGNED_AREA_CONFIG[assessment.assigned_area as keyof typeof ASSIGNED_AREA_CONFIG].label;
    }
    return assessment.assigned_area || 'Not assigned';
  }, [assessment]);

  // Calculate blood pressure string if we have both values
  const bloodPressure = useMemo(() => {
    if (!assessment) return null;
    const systolic = assessment.systolic_bp;
    const diastolic = assessment.diastolic_bp;
    if (systolic != null && diastolic != null) {
      return `${systolic}/${diastolic}`;
    }
    return null;
  }, [assessment]);

  // Vital abnormality checks
  const vitalChecks = useMemo(() => {
    if (!assessment) return {};
    return {
      spo2: {
        isAbnormal: assessment.spo2 != null && assessment.spo2 < 95,
        isCritical: assessment.spo2 != null && assessment.spo2 < 90,
      },
      heartRate: {
        isAbnormal: assessment.heart_rate != null && (assessment.heart_rate < 60 || assessment.heart_rate > 100),
        isCritical: assessment.heart_rate != null && (assessment.heart_rate < 50 || assessment.heart_rate > 120),
      },
      temperature: {
        isAbnormal: assessment.temperature != null && (assessment.temperature < 36.5 || assessment.temperature > 37.5),
        isCritical: assessment.temperature != null && (assessment.temperature < 35 || assessment.temperature >= 40),
      },
      respiratoryRate: {
        isAbnormal: assessment.respiratory_rate != null && (assessment.respiratory_rate < 12 || assessment.respiratory_rate > 20),
        isCritical: assessment.respiratory_rate != null && (assessment.respiratory_rate < 8 || assessment.respiratory_rate > 30),
      },
    };
  }, [assessment]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-10 w-48 sm:w-64" />
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-64" />
            <Skeleton className="h-48" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !assessment) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Assessment Not Found"
          helpContent="The requested triage assessment could not be found in the system."
        />
        <Card className="p-8 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Triage Assessment Not Found</h3>
          <p className="text-muted-foreground mb-4">
            The assessment you&apos;re looking for may have been deleted or doesn&apos;t exist.
          </p>
          <Button asChild>
            <Link href="/triage">View Triage Queue</Link>
          </Button>
        </Card>
      </div>
    );
  }

  // Action buttons for header
  const actionButtons = (
    <div className="flex flex-col gap-2 sm:flex-row">
      {!isEditing && (
        <>
          <Button
            variant="outline"
            onClick={() => setEmergencyDialogOpen(true)}
            className="w-full sm:w-auto bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
          >
            <Siren className="h-4 w-4 mr-2" />
            <span className="sm:hidden">ER</span>
            <span className="hidden sm:inline">Send to ER</span>
          </Button>
          <Button variant="outline" onClick={() => setRouteDialogOpen(true)} className="w-full sm:w-auto">
            <Building2 className="h-4 w-4 mr-2" />
            <span className="sm:hidden">Clinic</span>
            <span className="hidden sm:inline">Route to Clinic</span>
          </Button>
          <Button onClick={handleEdit} className="w-full sm:w-auto">
            <Edit2 className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Triage Assessment"
        helpContent="View and manage triage assessment details. Route patients to appropriate clinics or edit assessment information."
        actions={actionButtons}
      />

      {/* Patient Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <User className="h-4 w-4 shrink-0" />
            <span className="truncate">{assessment.patient_name ?? 'Unknown Patient'}</span>
            <span className="text-muted-foreground">({assessment.encounter_mrn ?? 'No MRN'})</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formattedArrivalTime}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {routingDestination}
            </span>
          </div>
        </div>
        <TriageCategoryBadge category={assessment.triage_category} size="lg" />
      </div>

      {/* Critical Alerts (if any) */}
      {assessment.alerts && assessment.alerts.length > 0 && (
        <VitalAlertsPanel alerts={assessment.alerts} defaultExpanded />
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          {isEditing ? (
            <TriageAssessmentEditForm
              assessment={assessment}
              permissions={editPermissions}
              onSubmit={handleSubmit}
              onCancel={handleCancelEdit}
              isSubmitting={isUpdating}
            />
          ) : (
            <Tabs defaultValue="vitals" className="space-y-4">
              <TabsList className="flex flex-wrap h-auto gap-1 p-1 justify-start">
                <TabsTrigger value="vitals" className="text-xs sm:text-sm gap-1.5">
                  <Activity className="h-3.5 w-3.5" />
                  <span className="sm:hidden">Vitals</span>
                  <span className="hidden sm:inline">Vital Signs</span>
                </TabsTrigger>
                <TabsTrigger value="assessment" className="text-xs sm:text-sm gap-1.5">
                  <Stethoscope className="h-3.5 w-3.5" />
                  Assessment
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs sm:text-sm gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  History
                </TabsTrigger>
              </TabsList>

              {/* Vitals Tab */}
              <TabsContent value="vitals" className="space-y-4">
                <Card>
                  <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Activity className="h-4 w-4 sm:h-5 sm:w-5" />
                      Vital Signs at Triage
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6">
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                      <VitalCard
                        label="SpO2"
                        value={assessment.spo2}
                        unit="%"
                        icon={<Droplets className="h-4 w-4" />}
                        normalRange="95-100"
                        isAbnormal={vitalChecks.spo2?.isAbnormal}
                        isCritical={vitalChecks.spo2?.isCritical}
                      />
                      <VitalCard
                        label="Heart Rate"
                        value={assessment.heart_rate}
                        unit="bpm"
                        icon={<Heart className="h-4 w-4" />}
                        normalRange="60-100"
                        isAbnormal={vitalChecks.heartRate?.isAbnormal}
                        isCritical={vitalChecks.heartRate?.isCritical}
                      />
                      <VitalCard
                        label="Blood Pressure"
                        value={bloodPressure}
                        unit="mmHg"
                        icon={<Activity className="h-4 w-4" />}
                        normalRange="90/60-120/80"
                      />
                      <VitalCard
                        label="Temperature"
                        value={assessment.temperature}
                        unit="°C"
                        icon={<Thermometer className="h-4 w-4" />}
                        normalRange="36.5-37.5"
                        isAbnormal={vitalChecks.temperature?.isAbnormal}
                        isCritical={vitalChecks.temperature?.isCritical}
                      />
                      <VitalCard
                        label="Respiratory Rate"
                        value={assessment.respiratory_rate}
                        unit="/min"
                        icon={<Wind className="h-4 w-4" />}
                        normalRange="12-20"
                        isAbnormal={vitalChecks.respiratoryRate?.isAbnormal}
                        isCritical={vitalChecks.respiratoryRate?.isCritical}
                      />
                      <VitalCard
                        label="Pain Score"
                        value={assessment.pain_score}
                        unit="/10"
                        icon={<AlertCircle className="h-4 w-4" />}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Assessment Tab */}
              <TabsContent value="assessment" className="space-y-4">
                <Card>
                  <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Stethoscope className="h-4 w-4 sm:h-5 sm:w-5" />
                      Clinical Assessment
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6 space-y-4">
                    {/* Chief Complaint */}
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Chief Complaint</h4>
                      <p className="text-sm sm:text-base">{assessment.chief_complaint}</p>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                          <Ambulance className="h-3.5 w-3.5" />
                          Arrival Mode
                        </h4>
                        <p className="text-sm capitalize">
                          {ARRIVAL_MODE_CONFIG[assessment.arrival_mode]?.label ?? assessment.arrival_mode?.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Mental Status (AVPU)</h4>
                        <Badge variant="outline" className="font-medium">
                          {AVPU_CONFIG[assessment.mental_status]?.label ?? assessment.mental_status}
                        </Badge>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                          <PersonStanding className="h-3.5 w-3.5" />
                          Mobility
                        </h4>
                        <Badge
                          variant="outline"
                          className={cn(
                            'font-medium',
                            MOBILITY_CONFIG[assessment.mobility]?.colors.text
                          )}
                        >
                          {MOBILITY_CONFIG[assessment.mobility]?.label ?? assessment.mobility?.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Assigned To</h4>
                        <p className="text-sm">{routingDestination}</p>
                      </div>
                    </div>

                    {/* Category Override Reason */}
                    {assessment.category_override_reason && (
                      <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg">
                        <h4 className="text-sm font-medium text-orange-800 dark:text-orange-200 mb-1">
                          Category Override Reason
                        </h4>
                        <p className="text-sm text-orange-700 dark:text-orange-300">
                          {assessment.category_override_reason}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* History Tab */}
              <TabsContent value="history">
                <Card>
                  <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
                      Assessment Timeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6">
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Arrival Time</span>
                        <span>{formattedArrivalTime}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Triage Started</span>
                        <span>{new Date(assessment.triage_start_time).toLocaleString()}</span>
                      </div>
                      {assessment.triage_end_time && (
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-muted-foreground">Triage Completed</span>
                          <span>{new Date(assessment.triage_end_time).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Triaged By</span>
                        <span>{assessment.triaged_by_name ?? 'Staff'}</span>
                      </div>
                      {assessment.seen_by_clinician_time && (
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-muted-foreground">Seen by Clinician</span>
                          <span>{new Date(assessment.seen_by_clinician_time).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-2">
                        <span className="text-muted-foreground">Last Updated</span>
                        <span>{new Date(assessment.updated_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          {/* Triage Category Card */}
          <Card>
            <CardHeader className="pb-2 px-3 sm:px-6">
              <CardTitle className="text-base">Triage Category</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Final Category</span>
                <TriageCategoryBadge category={assessment.triage_category} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Auto-Calculated</span>
                <TriageCategoryBadge category={assessment.auto_calculated_category} />
              </div>
              {assessment.triage_category !== assessment.auto_calculated_category && (
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                  Category was manually overridden from auto-calculated value
                </p>
              )}
            </CardContent>
          </Card>

          {/* Allergies Card */}
          {assessment.allergies_noted && (
            <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
              <CardHeader className="pb-2 px-3 sm:px-6">
                <CardTitle className="text-base text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Known Allergies
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <p className="text-sm font-medium">{assessment.allergies_noted}</p>
              </CardContent>
            </Card>
          )}

          {/* Patient Info Card */}
          <Card>
            <CardHeader className="pb-2 px-3 sm:px-6">
              <CardTitle className="text-base">Patient Info</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 space-y-2 text-sm">
              {assessment.patient_age != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Age</span>
                  <span>{assessment.patient_age} years</span>
                </div>
              )}
              {assessment.patient_gender && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gender</span>
                  <span className="capitalize">{assessment.patient_gender}</span>
                </div>
              )}
              <div className="pt-2">
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href={`/encounters/${assessment.encounter}`}>
                    View Encounter
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-2 px-3 sm:px-6">
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
                onClick={() => setEmergencyDialogOpen(true)}
              >
                <Siren className="h-4 w-4 mr-2" />
                Send to Emergency
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => setRouteDialogOpen(true)}
              >
                <Building2 className="h-4 w-4 mr-2" />
                Route to Clinic
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Route to Clinic Dialog */}
      <RouteToClinicDialog
        open={routeDialogOpen}
        onOpenChange={setRouteDialogOpen}
        assessment={assessment}
        onSuccess={handleRouteSuccess}
      />

      {/* Route to Emergency Dialog */}
      <RouteToEmergencyDialog
        open={emergencyDialogOpen}
        onOpenChange={setEmergencyDialogOpen}
        assessment={assessment}
        onSuccess={handleEmergencyRouteSuccess}
      />
    </div>
  );
}
