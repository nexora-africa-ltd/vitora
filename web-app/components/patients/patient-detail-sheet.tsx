'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Shield,
  AlertTriangle,
  Heart,
  ExternalLink,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { patientsApi } from '@/lib/api/patients';
import { formatDate } from '@/lib/utils/format';
import type { Patient } from '@/lib/types/patient';

interface PatientDetailSheetProps {
  patientId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function PatientDetailSheet({ patientId, open, onOpenChange }: PatientDetailSheetProps) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open || !patientId) {
      setPatient(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    patientsApi
      .getPatient(patientId)
      .then((data) => {
        if (!cancelled) setPatient(data);
      })
      .catch(() => {
        // Silently fail — user can navigate to full page instead
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, patientId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Patient Details
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="mt-4 space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : patient ? (
          <div className="mt-4 space-y-4">
            {/* Name & MRN */}
            <div>
              <h3 className="text-lg font-semibold">
                {patient.full_name ||
                  `${patient.first_name} ${patient.middle_name ? patient.middle_name + ' ' : ''}${patient.last_name}`}
              </h3>
              <p className="font-mono text-sm text-muted-foreground">{patient.mrn}</p>
            </div>

            {/* Key Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Age / DOB</p>
                  <p>
                    {calculateAge(patient.date_of_birth)}y &middot;{' '}
                    {formatDate(patient.date_of_birth)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Gender</p>
                  <p>
                    {patient.gender === 'M' ? 'Male' : patient.gender === 'F' ? 'Female' : 'Other'}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Contact */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Contact</h4>
              {patient.phone_number && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{patient.phone_number}</span>
                </div>
              )}
              {patient.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{patient.email}</span>
                </div>
              )}
              {(patient.county_name || patient.sub_county_name) && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    {[patient.ward_name, patient.sub_county_name, patient.county_name]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </div>
              )}
            </div>

            <Separator />

            {/* Clinical Alerts */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Clinical Summary</h4>
              {patient.allergy_summary && patient.allergy_summary.length > 0 && (
                <div className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div>
                    <p className="text-xs text-muted-foreground">Allergies</p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {patient.allergy_summary.map((a) => (
                        <Badge key={a} variant="destructive" className="text-xs">
                          {a}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {patient.chronic_conditions_summary && (
                <div className="flex items-start gap-2 text-sm">
                  <Heart className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Chronic Conditions</p>
                    <p className="mt-0.5">{patient.chronic_conditions_summary}</p>
                  </div>
                </div>
              )}
              {(!patient.allergy_summary || patient.allergy_summary.length === 0) &&
                !patient.chronic_conditions_summary && (
                  <p className="text-sm text-muted-foreground">
                    No allergies or chronic conditions recorded.
                  </p>
                )}
            </div>

            {/* Flags */}
            {(patient.is_sensitive || patient.sha_number) && (
              <>
                <Separator />
                <div className="flex flex-wrap gap-2">
                  {patient.is_sensitive && (
                    <Badge variant="destructive" className="gap-1">
                      <Shield className="h-3 w-3" />
                      Sensitive
                    </Badge>
                  )}
                  {patient.sha_number && (
                    <Badge variant="outline" className="gap-1">
                      SHA: {patient.sha_number}
                    </Badge>
                  )}
                </div>
              </>
            )}

            {/* Emergency Contact */}
            {patient.emergency_contact_name && (
              <>
                <Separator />
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">Emergency Contact</h4>
                  <p className="text-sm">{patient.emergency_contact_name}</p>
                  {patient.emergency_contact_phone && (
                    <p className="text-sm text-muted-foreground">
                      {patient.emergency_contact_phone}
                    </p>
                  )}
                  {patient.emergency_contact_relationship && (
                    <p className="text-xs text-muted-foreground">
                      ({patient.emergency_contact_relationship})
                    </p>
                  )}
                </div>
              </>
            )}

            <Separator />

            {/* Full Profile Link */}
            <Button asChild variant="outline" className="w-full">
              <Link href={`/patients/${patient.id}`}>
                <ExternalLink className="mr-2 h-4 w-4" />
                View Full Profile
              </Link>
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Unable to load patient details.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
