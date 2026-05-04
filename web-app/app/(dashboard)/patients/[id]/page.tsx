'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import {
  Edit,
  Trash2,
  Phone,
  Mail,
  MapPin,
  User,
  Calendar,
  AlertTriangle,
  FileText,
  TestTube2,
  History,
  Shield,
  ScanLine,
  Users,
  Pill,
  Clipboard,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Activity,
  HeartPulse,
  Heart,
  Scissors,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useQuery } from '@tanstack/react-query';
import { usePatientEmergencyContacts } from '@/lib/hooks/use-patients';
import { usePatientPrescriptions } from '@/lib/hooks/use-pharmacy';
import { usePatientLabOrders } from '@/lib/hooks/use-laboratory';
import { usePatientProcedureOrders } from '@/lib/hooks/use-procedures';
import { usePatientContext } from '@/lib/context/patient-context';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { calculateAge, formatDate, formatPhoneNumber } from '@/lib/utils/format';
import { PatientEncounters } from '@/components/patients/patient-encounters';
import { EmergencyContactsList } from '@/components/patients/emergency-contacts-list';
import { QuickCheckinDialog } from '@/components/patients/quick-checkin-dialog';
import { PatientQRCode } from '@/components/patients/patient-qr-code';
import { PatientImagingSection } from '@/components/patients/patient-imaging-section';
import { PatientAllergiesTab } from '@/components/patients/allergies';
import { PatientSocialHistoryTab } from '@/components/patients/social-history';
import { PatientChronicConditionsTab } from '@/components/patients/chronic-conditions';
import { PatientCurrentMedicationsTab } from '@/components/patients/current-medications';
import { PatientPastSurgeriesTab } from '@/components/patients/past-surgeries';
import { PatientFamilyHistoryTab } from '@/components/patients/family-history';
import { PatientAlliedHealthTab } from '@/components/patients/allied-health';
import { PatientAuditTrail } from '@/components/patients/patient-audit-trail';
import { EligibilityBanner, DependentsView, BenefitsPanel } from '@/components/billing/sha';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { PendingSyncBadge, isPendingSync } from '@/components/shared/pending-sync-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { VitalsTrendChart } from '@/components/shared/vitals-trend-chart';
import { usePatientVitalsHistory } from '@/lib/hooks/use-patients';
import { shaApi } from '@/lib/api/sha';
import { cn } from '@/lib/utils';
import type { PaginatedResponse } from '@/lib/types';
import type { Prescription, PrescriptionStatus } from '@/lib/types/pharmacy';
import type { LabOrder, LabOrderStatus } from '@/lib/types/laboratory';
import {
  PROCEDURE_STATUS_COLORS,
  PROCEDURE_STATUS_LABELS,
  type ProcedureOrderListItem,
} from '@/lib/types/procedure';

export default function PatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = Number(params.id);
  const [showDependents, setShowDependents] = useState(false);

  // Vitals history for trend chart
  const { data: vitalsHistory, isLoading: isLoadingVitals } = usePatientVitalsHistory(patientId, 'all');

  // Use patient context instead of independent fetch
  const { patient, isLoading, error } = usePatientContext();
  const { canEditPatient } = usePermissions();
  const { data: emergencyContacts } = usePatientEmergencyContacts(patientId);

  // Pull-to-refresh support
  const { refresh, isRefreshing } = usePageRefresh();

  // Fetch prescriptions and lab orders
  const { data: prescriptionsData, isLoading: loadingPrescriptions } =
    usePatientPrescriptions(patientId);
  const { data: labOrdersData, isLoading: loadingLabOrders } = usePatientLabOrders(patientId);
  const patientProcedureOrdersQuery = usePatientProcedureOrders(patientId);
  const procedureOrdersData: PaginatedResponse<ProcedureOrderListItem> | undefined =
    patientProcedureOrdersQuery.data as PaginatedResponse<ProcedureOrderListItem> | undefined;
  const loadingProcedureOrders = patientProcedureOrdersQuery.isLoading;

  // Fetch SHA member for this patient to check if they're a principal
  const { data: shaMembersData } = useQuery({
    queryKey: ['sha-members', patientId],
    queryFn: () => shaApi.getSHAMembers({ patient: patientId }),
    enabled: !!patientId,
  });

  const shaMember = shaMembersData?.results?.[0];
  const isPrincipalMember = shaMember?.membership_type === 'PRINCIPAL';

  if (isLoading) {
    return <PatientDetailSkeleton />;
  }

  if (error || !patient) {
    return (
      <div className="container mx-auto py-12 text-center">
        <h2 className="text-xl font-semibold">Patient not found</h2>
        <p className="mt-2 text-muted-foreground">
          The patient you&apos;re looking for doesn&apos;t exist or has been removed.
        </p>
        <Button onClick={() => router.push('/patients')} className="mt-4">
          Back to Patients
        </Button>
      </div>
    );
  }

  const genderLabels: Record<string, string> = { M: 'Male', F: 'Female', O: 'Other' };
  const prescriptions = prescriptionsData ?? [];
  const labOrders = labOrdersData ?? [];
  const procedureOrders = procedureOrdersData?.results ?? [];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        {/* Page Header with Actions */}
        <PageHeader
          title={`${patient.first_name} ${patient.last_name}`}
          helpContent="View patient details, encounters, prescriptions, lab results, and imaging orders. Use Quick Check-in to create a new encounter."
          actions={
            <>
              {patient.is_sensitive && (
                <Badge variant="destructive" className="w-fit shrink-0">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Sensitive
                </Badge>
              )}
            </>
          }
        />

        {/* Patient Summary Bar */}
        <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <PatientQRCode
                patientId={patient.id}
                patientName={`${patient.first_name} ${patient.last_name}`}
                mrn={patient.mrn}
                variant="inline"
              />
              <div className="flex min-w-0 flex-col gap-1">
                <p className="truncate font-mono text-sm font-medium">
                  MRN: {isPendingSync(patient.mrn) ? <PendingSyncBadge label="MRN pending" /> : patient.mrn}
                  {patient.sha_number && (
                    <span className="text-muted-foreground"> • SHA: {patient.sha_number}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  {genderLabels[patient.gender] || patient.gender} •{' '}
                  {calculateAge(patient.date_of_birth)} years
                  {patient.phone_number && ` • ${formatPhoneNumber(patient.phone_number)}`}
                </p>
              </div>
            </div>
            <Badge
              variant={patient.consent_given ? 'default' : 'secondary'}
              className="w-fit shrink-0 self-start sm:self-auto"
            >
              {patient.consent_given ? 'Consented' : 'Consent Pending'}
            </Badge>
          </div>
        </div>

        {/* Action Buttons - Stack on mobile */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <QuickCheckinDialog
            patientId={patient.id}
            patientName={`${patient.first_name} ${patient.last_name}`}
            patientMrn={patient.mrn}
          />
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href={`/admissions/new?patient=${patient.id}`}>
              <Clipboard className="mr-2 h-4 w-4" />
              <span className="sm:hidden">Admit</span>
              <span className="hidden sm:inline">Admit Patient</span>
            </Link>
          </Button>
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href={`/patients/${patient.id}/history`}>
              <History className="mr-2 h-4 w-4" />
              History
            </Link>
          </Button>
          {canEditPatient && (
            <Button variant="outline" asChild className="w-full sm:w-auto">
              <Link href={`/patients/${patient.id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
          )}
          {canEditPatient && (
            <Button
              variant="outline"
              className="w-full text-destructive hover:bg-destructive/10 sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>

        {/* SHA Eligibility Banner */}
        <EligibilityBanner patientId={patientId} />

        {/* SHA Benefits & Interventions Panel */}
        {shaMember?.sha_number && (
          <BenefitsPanel
            crNumber={shaMember.sha_number}
            patientPk={patientId}
            shaMemberId={shaMember.id}
          />
        )}

        {/* SHA Dependents Section - Only for Principal Members */}
        {isPrincipalMember && shaMember && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="font-medium">SHA Dependents</p>
                    <p className="text-sm text-muted-foreground">
                      View dependents covered under this principal member
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="show-dependents" className="text-sm">
                    Show Dependents
                  </Label>
                  <Switch
                    id="show-dependents"
                    checked={showDependents}
                    onCheckedChange={setShowDependents}
                  />
                </div>
              </div>

              {showDependents && (
                <div className="mt-4 border-t pt-4">
                  <DependentsView
                    principalMember={shaMember}
                    onDependentClick={(dependent) => {
                      if (dependent.patient) {
                        router.push(`/patients/${dependent.patient}`);
                      }
                    }}
                    showAddButton={false}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Patient Info Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Identification */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Identification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow icon={FileText} label="CR Number" value={patient.cr_number || '—'} />
              <InfoRow icon={Shield} label="SHA Number" value={patient.sha_number || '—'} />
              <InfoRow icon={Users} label="Household Number" value={patient.household_number || '—'} />
              <InfoRow
                icon={FileText}
                label={
                  patient.identification_type === 'national_id'
                    ? 'National ID'
                    : patient.identification_type || 'ID'
                }
                value={patient.identification_number || patient.national_id || '—'}
              />
            </CardContent>
          </Card>

          {!!patient.household_members?.length && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Household Members</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {patient.household_members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="font-medium break-words">{member.full_name}</p>
                      <p className="text-xs text-muted-foreground break-words">
                        {member.mrn}
                        {member.cr_number ? ` • CR: ${member.cr_number}` : ''}
                        {member.sha_number ? ` • SHA: ${member.sha_number}` : ''}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/patients/${member.id}`}>View</Link>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow
                icon={User}
                label="Gender"
                value={genderLabels[patient.gender] || patient.gender}
              />
              <InfoRow
                icon={Calendar}
                label="Date of Birth"
                value={`${formatDate(patient.date_of_birth)} (${calculateAge(patient.date_of_birth)} years)`}
              />
              <InfoRow
                icon={Phone}
                label="Phone"
                value={formatPhoneNumber(patient.phone_number || '') || '—'}
              />
              <InfoRow icon={Mail} label="Email" value={patient.email || '—'} />
            </CardContent>
          </Card>

          {/* Address */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Address</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow icon={MapPin} label="County" value={patient.county_name || '—'} />
              <InfoRow icon={MapPin} label="Sub-County" value={patient.sub_county_name || '—'} />
              <InfoRow icon={MapPin} label="Ward" value={patient.ward_name || '—'} />
              <InfoRow icon={MapPin} label="Village" value={patient.village || '—'} />
            </CardContent>
          </Card>

          {/* Emergency Contact */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Emergency Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow icon={User} label="Name" value={patient.emergency_contact_name || '—'} />
              <InfoRow
                icon={Phone}
                label="Phone"
                value={formatPhoneNumber(patient.emergency_contact_phone || '')}
              />
              <InfoRow
                icon={User}
                label="Relationship"
                value={patient.emergency_contact_relationship || '—'}
              />
            </CardContent>
          </Card>

        </div>

        {/* Consent Status */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Consent Status</p>
                  <p className="text-sm text-muted-foreground">
                    {patient.consent_given
                      ? `Consent given on ${formatDate(patient.consent_date || '')}`
                      : 'Consent not yet recorded'}
                  </p>
                </div>
              </div>
              <Badge variant={patient.consent_given ? 'default' : 'secondary'}>
                {patient.consent_given ? 'Consented' : 'Pending'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Tabs — grouped: Encounters | Clinical | Orders | More */}
        <Tabs defaultValue="encounters" className="space-y-4">
          <TooltipProvider delayDuration={400}>
          <TabsList className="flex h-auto flex-wrap gap-1 justify-start p-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger value="encounters" className="text-xs sm:text-sm gap-1.5">
                  <Clipboard className="h-4 w-4" />
                  Encounters
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent><p>Visit history and encounter records</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger value="clinical" className="text-xs sm:text-sm gap-1.5">
                  <HeartPulse className="h-4 w-4" />
                  Clinical
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent><p>Vitals trends, allergies & emergency contacts</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger value="orders" className="text-xs sm:text-sm gap-1.5">
                  Orders ({(prescriptions?.length || 0) + (labOrders?.length || 0) + procedureOrders.length})
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent><p>Prescriptions, procedures, lab results & imaging orders</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger value="more" className="text-xs sm:text-sm gap-1.5">
                  <MoreHorizontal className="h-4 w-4" />
                  More
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent><p>Allied health services & audit trail</p></TooltipContent>
            </Tooltip>
          </TabsList>
          </TooltipProvider>

          {/* Encounters */}
          <TabsContent value="encounters">
            <PatientEncounters patientId={patientId} />
          </TabsContent>

          {/* Clinical — Vitals | Allergies | Emergency Contacts */}
          <TabsContent value="clinical">
            <Accordion type="multiple" defaultValue={['vitals', 'allergies', 'social-history', 'chronic-conditions', 'current-medications', 'past-surgeries', 'family-history', 'emergency-contacts']}>
              <AccordionItem value="vitals">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <span>Vitals Trends</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <VitalsTrendChart
                    data={vitalsHistory ?? []}
                    isLoading={isLoadingVitals}
                    title="Vitals History"
                    helpContent="All recorded vital signs across encounters, triage assessments, and inpatient observations. Select a time range to focus on a specific period."
                    defaultRange="all"
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="allergies">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span>Allergies</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <PatientAllergiesTab patientId={patientId} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="social-history">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <HeartPulse className="h-4 w-4 text-muted-foreground" />
                    <span>Social History</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <PatientSocialHistoryTab patientId={patientId} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="chronic-conditions">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Heart className="h-4 w-4 text-muted-foreground" />
                    <span>Chronic Conditions</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <PatientChronicConditionsTab patientId={patientId} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="current-medications">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Pill className="h-4 w-4 text-muted-foreground" />
                    <span>Current Medications</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <PatientCurrentMedicationsTab patientId={patientId} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="past-surgeries">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Scissors className="h-4 w-4 text-muted-foreground" />
                    <span>Past Surgeries</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <PatientPastSurgeriesTab patientId={patientId} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="family-history">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>Family History</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <PatientFamilyHistoryTab patientId={patientId} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="emergency-contacts" className="border-b-0">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>Emergency Contacts</span>
                    {(emergencyContacts?.length || 0) > 0 && (
                      <Badge variant="secondary" className="text-xs">{emergencyContacts?.length}</Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <EmergencyContactsList contacts={emergencyContacts || []} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>

          {/* Orders — Prescriptions | Procedures | Lab Results | Imaging */}
          <TabsContent value="orders">
            <Accordion type="multiple" defaultValue={['prescriptions', 'procedures', 'lab-results', 'imaging']}>
              <AccordionItem value="prescriptions">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Pill className="h-4 w-4 text-muted-foreground" />
                    <span>Prescriptions</span>
                    {(prescriptions?.length || 0) > 0 && (
                      <Badge variant="secondary" className="text-xs">{prescriptions?.length}</Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <PatientPrescriptionsSection
                    prescriptions={prescriptions}
                    isLoading={loadingPrescriptions}
                    patientId={patientId}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="procedures">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Clipboard className="h-4 w-4 text-muted-foreground" />
                    <span>Procedures</span>
                    {procedureOrders.length > 0 && (
                      <Badge variant="secondary" className="text-xs">{procedureOrders.length}</Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <PatientProceduresSection
                    procedureOrders={procedureOrders}
                    isLoading={loadingProcedureOrders}
                    patientId={patientId}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="lab-results">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <TestTube2 className="h-4 w-4 text-muted-foreground" />
                    <span>Lab Results</span>
                    {(labOrders?.length || 0) > 0 && (
                      <Badge variant="secondary" className="text-xs">{labOrders?.length}</Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <PatientLabResultsSection
                    labOrders={labOrders}
                    isLoading={loadingLabOrders}
                    patientId={patientId}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="imaging" className="border-b-0">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <ScanLine className="h-4 w-4 text-muted-foreground" />
                    <span>Imaging</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <PatientImagingSection patientId={patientId} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>

          {/* More — Allied Health | Audit Trail */}
          <TabsContent value="more">
            <Accordion type="multiple" defaultValue={['allied-health', 'audit-trail']}>
              <AccordionItem value="allied-health">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <span>Allied Health</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <PatientAlliedHealthTab patientId={patientId} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="audit-trail" className="border-b-0">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Audit Trail</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <PatientAuditTrail patientId={patientId} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>
        </Tabs>
      </div>
    </PullToRefresh>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value || '—'}</p>
      </div>
    </div>
  );
}

function PatientDetailSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 w-24" />
        ))}
      </div>
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3].map((j) => (
                <Skeleton key={j} className="h-6 w-full" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Prescriptions Section
// =============================================================================

const PRESCRIPTION_STATUS_CONFIG: Record<
  PrescriptionStatus,
  { label: string; icon: typeof Clock; className: string }
> = {
  PENDING: {
    label: 'Pending',
    icon: Clock,
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  },
  PARTIAL: { label: 'Partial', icon: Pill, className: 'bg-primary/15 text-primary' },
  DISPENSED: {
    label: 'Dispensed',
    icon: CheckCircle,
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  },
  CANCELLED: { label: 'Cancelled', icon: XCircle, className: 'bg-muted text-muted-foreground' },
  EXPIRED: { label: 'Expired', icon: XCircle, className: 'bg-destructive/15 text-destructive' },
};

function PatientPrescriptionsSection({
  prescriptions,
  isLoading,
  patientId,
}: {
  prescriptions: Prescription[];
  isLoading: boolean;
  patientId: number;
}) {
  const router = useRouter();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 py-8">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!prescriptions.length) {
    return (
      <Card>
        <CardContent className="py-12">
          <EmptyState
            icon={Pill}
            title="No prescriptions"
            description="This patient has no prescriptions yet."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base sm:text-lg">
          Prescriptions ({prescriptions.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {prescriptions.slice(0, 10).map((rx) => {
          const statusConfig =
            PRESCRIPTION_STATUS_CONFIG[rx.status] || PRESCRIPTION_STATUS_CONFIG.PENDING;
          const StatusIcon = statusConfig.icon;

          return (
            <div
              key={rx.id}
              className="flex cursor-pointer flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
              onClick={() => router.push(`/pharmacy/prescriptions/${rx.id}`)}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">Rx #{rx.prescription_number}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(rx.prescribed_date)} • {rx.items?.length || 0} item(s)
                </p>
              </div>
              <Badge
                className={cn(
                  'w-fit shrink-0 gap-1 self-start sm:self-auto',
                  statusConfig.className
                )}
              >
                <StatusIcon className="h-3 w-3" />
                {statusConfig.label}
              </Badge>
            </div>
          );
        })}
        {prescriptions.length > 10 && (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => router.push(`/pharmacy/prescriptions?patient=${patientId}`)}
          >
            View all {prescriptions.length} prescriptions
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Lab Results Section
// =============================================================================

const LAB_STATUS_CONFIG: Record<LabOrderStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  ORDERED: { label: 'Ordered', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  SPECIMEN_COLLECTED: { label: 'Collected', className: 'bg-primary/15 text-primary' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-primary/15 text-primary' },
  COMPLETED: {
    label: 'Completed',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  },
  CANCELLED: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
  REJECTED: { label: 'Rejected', className: 'bg-destructive/15 text-destructive' },
};

function PatientLabResultsSection({
  labOrders,
  isLoading,
  patientId,
}: {
  labOrders: LabOrder[];
  isLoading: boolean;
  patientId: number;
}) {
  const router = useRouter();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 py-8">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!labOrders.length) {
    return (
      <Card>
        <CardContent className="py-12">
          <EmptyState
            icon={TestTube2}
            title="No lab orders"
            description="This patient has no lab orders yet."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base sm:text-lg">Lab Orders ({labOrders.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {labOrders.slice(0, 10).map((order) => {
          const statusConfig = LAB_STATUS_CONFIG[order.status] || LAB_STATUS_CONFIG.ORDERED;
          const hasCritical = order.items?.some((item) => item.result?.is_critical_result);

          return (
            <div
              key={order.id}
              className="flex cursor-pointer flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
              onClick={() => router.push(`/laboratory/orders/${order.order_number}`)}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 truncate text-sm font-medium">
                  {order.order_number}
                  {hasCritical && (
                    <Badge variant="destructive" className="text-xs">
                      Critical
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDate(order.ordered_at)} • {order.items?.length || 0} test(s)
                </p>
              </div>
              <Badge
                className={cn('w-fit shrink-0 self-start sm:self-auto', statusConfig.className)}
              >
                {statusConfig.label}
              </Badge>
            </div>
          );
        })}
        {labOrders.length > 10 && (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => router.push(`/laboratory/orders?patient=${patientId}`)}
          >
            View all {labOrders.length} lab orders
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Procedures Section
// =============================================================================

function PatientProceduresSection({
  procedureOrders,
  isLoading,
  patientId,
}: {
  procedureOrders: ProcedureOrderListItem[];
  isLoading: boolean;
  patientId: number;
}) {
  const router = useRouter();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 py-8">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!procedureOrders.length) {
    return (
      <Card>
        <CardContent className="py-12">
          <EmptyState
            icon={Clipboard}
            title="No procedures"
            description="This patient has no procedure orders yet."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base sm:text-lg">
          Procedures ({procedureOrders.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {procedureOrders.slice(0, 10).map((order) => (
          <div
            key={order.id}
            className="flex cursor-pointer flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
            onClick={() => router.push(`/procedures/orders/${order.id}`)}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{order.procedure_name}</p>
              <p className="text-xs text-muted-foreground">
                #{order.order_number}
                {order.scheduled_date ? ` • ${formatDate(order.scheduled_date)}` : ` • Ordered ${formatDate(order.ordered_at)}`}
                {order.scheduled_clinic_name ? ` • ${order.scheduled_clinic_name}` : ''}
              </p>
            </div>
            <Badge
              className={cn(
                'w-fit shrink-0 self-start sm:self-auto',
                PROCEDURE_STATUS_COLORS[order.status]
              )}
            >
              {PROCEDURE_STATUS_LABELS[order.status]}
            </Badge>
          </div>
        ))}
        {procedureOrders.length > 10 && (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => router.push(`/procedures/orders?patient=${patientId}`)}
          >
            View all {procedureOrders.length} procedure orders
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
