'use client';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import {
  AlertCircle,
  Calendar,
  Heart,
  MapPin,
  Phone,
  Shield,
  User,
} from 'lucide-react';
import { usePatient } from '@/lib/hooks/use-patients';
import { usePatientAllergies } from '@/lib/hooks/use-allergies';
import { calculateAge, formatDate } from '@/lib/utils/format';

interface PatientPeekContentProps {
  patientId: number;
}

const GENDER_LABELS: Record<string, string> = {
  M: 'Male',
  F: 'Female',
  O: 'Other',
};

export function PatientPeekContent({ patientId }: PatientPeekContentProps) {
  const { data: patient, isLoading, error } = usePatient(patientId);
  const { data: allergies } = usePatientAllergies(patientId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error || !patient) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Could not load patient"
        description="The patient details could not be retrieved."
      />
    );
  }

  const age = patient.date_of_birth ? calculateAge(patient.date_of_birth) : null;
  const gender = patient.gender ? GENDER_LABELS[patient.gender] ?? patient.gender : null;
  const location = [patient.county_name, patient.sub_county_name, patient.ward_name]
    .filter(Boolean)
    .join(' → ');

  return (
    <div className="space-y-4">
      {/* Header: MRN + Demographics */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="font-mono text-xs">{patient.mrn}</Badge>
        {age !== null && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {age}y • {gender}
          </span>
        )}
        {patient.is_sensitive && (
          <Badge variant="destructive" className="text-[10px]">
            <Shield className="h-3 w-3 mr-0.5" />
            Sensitive
          </Badge>
        )}
      </div>

      {/* Name & IDs */}
      <section>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
          <User className="h-3 w-3" /> Personal Info
        </h4>
        <div className="space-y-1 text-sm">
          <p className="font-medium">
            {[patient.title, patient.first_name, patient.middle_name, patient.last_name]
              .filter(Boolean)
              .join(' ')}
          </p>
          <p className="text-xs text-muted-foreground">
            DOB: {formatDate(patient.date_of_birth)}
          </p>
          {patient.identification_number && (
            <p className="text-xs text-muted-foreground">
              ID: {patient.identification_number}
            </p>
          )}
          {patient.sha_number && (
            <p className="text-xs text-muted-foreground">
              SHA: {patient.sha_number}
            </p>
          )}
        </div>
      </section>

      {/* Contact */}
      {(patient.phone_number || patient.email) && (
        <>
          <Separator />
          <section>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Phone className="h-3 w-3" /> Contact
            </h4>
            <div className="space-y-1 text-sm text-muted-foreground">
              {patient.phone_number && <p>{patient.phone_number}</p>}
              {patient.email && <p>{patient.email}</p>}
            </div>
          </section>
        </>
      )}

      {/* Location */}
      {location && (
        <>
          <Separator />
          <section>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <MapPin className="h-3 w-3" /> Location
            </h4>
            <p className="text-sm text-muted-foreground">{location}</p>
            {patient.village && (
              <p className="text-xs text-muted-foreground mt-0.5">Village: {patient.village}</p>
            )}
          </section>
        </>
      )}

      {/* Allergies */}
      {allergies && allergies.length > 0 && (
        <>
          <Separator />
          <section>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Heart className="h-3 w-3" /> Allergies ({allergies.length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {allergies.map((a) => (
                <Badge
                  key={a.id}
                  variant="outline"
                  className={
                    a.severity === 'severe' || a.severity === 'life_threatening'
                      ? 'border-destructive/50 text-destructive'
                      : a.severity === 'moderate'
                        ? 'border-amber-500/50 text-amber-700 dark:text-amber-400'
                        : ''
                  }
                >
                  {a.substance}
                </Badge>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Chronic conditions */}
      {patient.chronic_conditions_summary && (
        <>
          <Separator />
          <section>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Chronic Conditions
            </h4>
            <p className="text-sm text-muted-foreground">{patient.chronic_conditions_summary}</p>
          </section>
        </>
      )}

      {/* Emergency Contact */}
      {patient.emergency_contact_name && (
        <>
          <Separator />
          <section>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Emergency Contact
            </h4>
            <p className="text-sm">
              {patient.emergency_contact_name}
              {patient.emergency_contact_relationship && (
                <span className="text-muted-foreground"> ({patient.emergency_contact_relationship})</span>
              )}
            </p>
            {patient.emergency_contact_phone && (
              <p className="text-xs text-muted-foreground">{patient.emergency_contact_phone}</p>
            )}
          </section>
        </>
      )}

      {/* Consent & Registration */}
      <Separator />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Consent: {patient.consent_given ? 'Given' : 'Pending'}</span>
        {patient.registered_by_username && (
          <span>Registered by {patient.registered_by_username}</span>
        )}
        <span>Created {formatDate(patient.created_at)}</span>
      </div>
    </div>
  );
}
