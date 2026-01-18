'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PatientTimeline } from '@/components/patients/patient-timeline';
import { usePatient } from '@/lib/hooks/use-patients-enhanced';

export default function PatientHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = Number(params.id);

  const { data: patient, isLoading: patientLoading, error } = usePatient(patientId);

  if (patientLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      </div>
    );
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

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between print:block">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="print:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Patient History</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link
                href={`/patients/${patient.id}`}
                className="flex items-center gap-1 hover:text-primary"
              >
                <User className="h-4 w-4" />
                {patient.first_name} {patient.last_name}
              </Link>
              <span>•</span>
              <span className="font-mono">{patient.mrn}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 print:hidden">
          <Button variant="outline" asChild>
            <Link href={`/patients/${patient.id}`}>View Profile</Link>
          </Button>
          <Button asChild>
            <Link href={`/encounters/new?patient=${patient.id}`}>New Encounter</Link>
          </Button>
        </div>
      </div>

      {/* Timeline */}
      <PatientTimeline patientId={patientId} />
    </div>
  );
}
