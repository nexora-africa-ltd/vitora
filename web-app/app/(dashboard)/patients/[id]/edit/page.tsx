'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PatientForm } from '@/components/patients/patient-form';
import { usePatient, useUpdatePatient } from '@/lib/hooks/use-patients-enhanced';
import { useToast } from '@/lib/hooks/use-toast';
import type { PatientCreateData } from '@/lib/types/patient';
import { parseISO } from 'date-fns';

export default function EditPatientPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const patientId = Number(params.id);

  const { data: patient, isLoading, error } = usePatient(patientId);
  const updatePatient = useUpdatePatient();

  const handleSubmit = async (data: PatientCreateData) => {
    try {
      await updatePatient.mutateAsync({ id: patientId, data });
      toast({
        title: 'Patient updated',
        description: `Successfully updated ${data.first_name} ${data.last_name}`,
      });
      router.push(`/patients/${patientId}`);
    } catch (error) {
      toast({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Failed to update patient',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="container mx-auto py-12 text-center">
        <h2 className="text-xl font-semibold">Patient not found</h2>
        <p className="text-muted-foreground mt-2">
          The patient you&apos;re looking for doesn&apos;t exist.
        </p>
        <Button onClick={() => router.push('/patients')} className="mt-4">
          Back to Patients
        </Button>
      </div>
    );
  }

  // Convert patient data to form default values
  const defaultValues = {
    // Client Registry / SHA
    cr_number: patient.cr_number || '',
    sha_number: patient.sha_number || '',
    // Identification
    identification_type: patient.identification_type || 'national_id',
    identification_number: patient.identification_number || patient.national_id || '',
    // Personal Information
    first_name: patient.first_name,
    middle_name: patient.middle_name || '',
    last_name: patient.last_name,
    title: (patient.title || '') as '' | 'Mr' | 'Mrs' | 'Miss' | 'Ms' | 'Dr' | 'Prof' | 'Hon' | 'Rev',
    date_of_birth: patient.date_of_birth ? parseISO(patient.date_of_birth) : undefined,
    place_of_birth: patient.place_of_birth || '',
    gender: patient.gender as 'M' | 'F' | 'O',
    nationality: patient.citizenship || 'Kenyan',
    is_person_with_disability: patient.is_person_with_disability || false,
    // Contact
    phone_number: patient.phone_number || '',
    email: patient.email || '',
    address: patient.address || '',
    // Location
    county: patient.county,
    sub_county: patient.sub_county,
    ward: patient.ward || undefined,
    village: patient.village || '',
    // Emergency Contact
    emergency_contact_name: patient.emergency_contact_name || '',
    emergency_contact_phone: patient.emergency_contact_phone || '',
    emergency_contact_relationship: patient.emergency_contact_relationship || '',
    // Other
    referral_source: (patient.referral_source as 'self' | 'clinic' | 'other_facility') || 'self',
    consent_given: patient.consent_given || false,
    consent_deferred: patient.consent_deferred || false,
    national_id: patient.national_id || '', // Legacy
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Edit Patient</h1>
          <p className="text-muted-foreground">
            {patient.first_name} {patient.last_name} - {patient.mrn}
          </p>
        </div>
      </div>

      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle>Patient Information</CardTitle>
          <CardDescription>
            Update patient details. Fields marked with * are required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PatientForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isLoading={updatePatient.isPending}
            defaultValues={defaultValues}
            isEditing
          />
        </CardContent>
      </Card>
    </div>
  );
}
