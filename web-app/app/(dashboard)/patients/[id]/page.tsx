'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
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
  UserCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { usePatientEmergencyContacts } from '@/lib/hooks/use-patients';
import { usePatientContext } from '@/lib/context/patient-context';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { calculateAge, formatDate, formatPhoneNumber } from '@/lib/utils/format';
import { PatientEncounters } from '@/components/patients/patient-encounters';
import { EmergencyContactsList } from '@/components/patients/emergency-contacts-list';
import { QuickCheckinDialog } from '@/components/patients/quick-checkin-dialog';
import { EligibilityBanner, DependentsView } from '@/components/billing/sha';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { shaApi } from '@/lib/api/sha';
import { useState } from 'react';

export default function PatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = Number(params.id);
  const [showDependents, setShowDependents] = useState(false);

  // Use patient context instead of independent fetch
  const { patient, isLoading, error } = usePatientContext();
  const { canEditPatient } = usePermissions();
  const { data: emergencyContacts } = usePatientEmergencyContacts(patientId);

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
        <p className="text-muted-foreground mt-2">
          The patient you&apos;re looking for doesn&apos;t exist or has been removed.
        </p>
        <Button onClick={() => router.push('/patients')} className="mt-4">
          Back to Patients
        </Button>
      </div>
    );
  }

  const genderLabels: Record<string, string> = { M: 'Male', F: 'Female', O: 'Other' };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">
                {patient.first_name} {patient.last_name}
              </h1>
              {patient.is_sensitive && (
                <Badge variant="destructive">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Sensitive
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground font-mono">MRN: {patient.mrn}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <QuickCheckinDialog
            patientId={patient.id}
            patientName={`${patient.first_name} ${patient.last_name}`}
            patientMrn={patient.mrn}
          />
          <Button variant="outline" asChild>
            <Link href={`/admissions/new?patient=${patient.id}`}>
              Admit
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/patients/${patient.id}/history`}>
              <History className="h-4 w-4 mr-2" />
              History
            </Link>
          </Button>
          {canEditPatient && (
            <Button variant="outline" asChild>
              <Link href={`/patients/${patient.id}/edit`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </Button>
          )}
          {canEditPatient && (
            <Button variant="outline" className="text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* SHA Eligibility Banner */}
      <EligibilityBanner patientId={patientId} />

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
              <div className="mt-4 pt-4 border-t">
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
            <InfoRow
              icon={FileText}
              label={patient.identification_type === 'national_id' ? 'National ID' : (patient.identification_type || 'ID')}
              value={patient.identification_number || patient.national_id || '—'}
            />
          </CardContent>
        </Card>

        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow icon={User} label="Gender" value={genderLabels[patient.gender] || patient.gender} />
            <InfoRow
              icon={Calendar}
              label="Date of Birth"
              value={`${formatDate(patient.date_of_birth)} (${calculateAge(patient.date_of_birth)} years)`}
            />
            <InfoRow icon={Phone} label="Phone" value={formatPhoneNumber(patient.phone_number || '') || '—'} />
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

      {/* Tabs for encounters and more */}
      <Tabs defaultValue="encounters" className="space-y-4">
        <TabsList>
          <TabsTrigger value="encounters">Encounters</TabsTrigger>
          <TabsTrigger value="emergency-contacts">Emergency Contacts</TabsTrigger>
          <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
          <TabsTrigger value="lab-results">Lab Results</TabsTrigger>
        </TabsList>

        <TabsContent value="encounters">
          <PatientEncounters patientId={patientId} />
        </TabsContent>

        <TabsContent value="emergency-contacts">
          <EmergencyContactsList contacts={emergencyContacts || []} />
        </TabsContent>

        <TabsContent value="prescriptions">
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Prescriptions will be displayed here</p>
              <p className="text-sm text-muted-foreground mt-1">Coming in Phase 2</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lab-results">
          <Card>
            <CardContent className="py-12 text-center">
              <TestTube2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Lab results will be displayed here</p>
              <p className="text-sm text-muted-foreground mt-1">Coming in Phase 2</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
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
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value || '—'}</p>
      </div>
    </div>
  );
}

function PatientDetailSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-10 w-10" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3, 4].map((j) => (
                <Skeleton key={j} className="h-8 w-full" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
