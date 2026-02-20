'use client';

import { CheckCircle2, ArrowRight, X, BedDouble, Calendar } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { AdmissionRecommendation, AdmissionRecommendationUrgency, InpatientWardType } from '@/lib/types/inpatient';

/**
 * Data for the admission success modal
 */
export interface AdmissionSuccessData {
  patientName: string;
  patientMrn: string;
  urgency: AdmissionRecommendationUrgency;
  preferredWardType: InpatientWardType;
  provisionalDiagnosis: string;
  expiresAt?: string;
}

/**
 * Create AdmissionSuccessData from AdmissionRecommendation response + patient context
 */
export function fromAdmissionRecommendation(
  recommendation: AdmissionRecommendation,
  patientName: string,
  patientMrn: string
): AdmissionSuccessData {
  return {
    patientName,
    patientMrn,
    urgency: recommendation.urgency,
    preferredWardType: recommendation.preferred_ward_type,
    provisionalDiagnosis: recommendation.provisional_diagnosis_text,
    expiresAt: recommendation.expires_at,
  };
}

const urgencyColors: Record<AdmissionRecommendationUrgency, string> = {
  ROUTINE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  URGENT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  EMERGENCY: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const wardTypeLabels: Record<InpatientWardType, string> = {
  MEDICAL: 'Medical Ward',
  SURGICAL: 'Surgical Ward',
  PEDIATRIC: 'Pediatric Ward',
  MATERNITY: 'Maternity Ward',
  ICU: 'Intensive Care Unit',
  ISOLATION: 'Isolation Ward',
};

interface AdmissionSuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Admission success data - can be constructed from API response */
  admissionData: AdmissionSuccessData | null;
  /** Optional: Custom destination URL (defaults to /admissions) */
  destinationUrl?: string;
  /** Optional callback when modal is dismissed */
  onDismiss?: () => void;
}

/**
 * Modal shown after successful admission recommendation.
 * Provides navigation options to go to the admissions queue or stay on the current page.
 */
export function AdmissionSuccessModal({
  open,
  onOpenChange,
  admissionData,
  destinationUrl = '/admissions',
  onDismiss,
}: AdmissionSuccessModalProps) {
  const router = useRouter();

  if (!admissionData) return null;

  const handleGoToAdmissions = () => {
    onOpenChange(false);
    router.push(destinationUrl);
  };

  const handleDismiss = () => {
    onOpenChange(false);
    onDismiss?.();
  };

  const formatExpiryDate = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-6 w-6 text-success" />
          </div>
          <DialogTitle className="text-center">Admission Recommended</DialogTitle>
          <DialogDescription className="text-center">
            {admissionData.patientName} ({admissionData.patientMrn}) has been recommended for admission.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Recommendation Info */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Urgency</span>
              <Badge className={urgencyColors[admissionData.urgency]}>
                {admissionData.urgency}
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Preferred Ward</span>
              <div className="flex items-center gap-2">
                <BedDouble className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">
                  {wardTypeLabels[admissionData.preferredWardType]}
                </span>
              </div>
            </div>

            <div className="flex items-start justify-between gap-2">
              <span className="text-sm text-muted-foreground shrink-0">Diagnosis</span>
              <span className="text-sm font-medium text-right">
                {admissionData.provisionalDiagnosis}
              </span>
            </div>

            {admissionData.expiresAt && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Valid Until</span>
                <div className="flex items-center gap-1.5 text-sm">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{formatExpiryDate(admissionData.expiresAt)}</span>
                </div>
              </div>
            )}
          </div>

          <p className="text-sm text-muted-foreground text-center">
            The admissions team will be notified to process this request.
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={handleDismiss} className="w-full sm:w-auto">
            <X className="mr-2 h-4 w-4" />
            Stay Here
          </Button>
          <Button onClick={handleGoToAdmissions} className="w-full sm:w-auto">
            <ArrowRight className="mr-2 h-4 w-4" />
            View Admissions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
