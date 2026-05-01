/**
 * New Pre-authorization Request Wizard
 *
 * Multi-step form for creating a pre-authorization request.
 * Step 1: Select preauth type (Normal, Surgical, Elective, Oncology, Renal, Imaging, Optical)
 * Step 2: Fill in details (consent token, intervention, diagnoses, items, doctors)
 * Step 3: Attach supporting documents
 * Step 4: Review and submit
 */
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  FileCheck,
  Stethoscope,
  Loader2,
  CheckCircle2,
  Scissors,
  Eye,
  Heart,
  Scan,
  Pill,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import { useToast } from '@/lib/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

// ============================================================================
// Preauth Types
// ============================================================================

const PREAUTH_TYPES = [
  {
    id: 'normal',
    label: 'Normal',
    description: 'Standard pre-authorization for general services',
    icon: FileCheck,
    color: 'text-blue-600',
  },
  {
    id: 'surgical',
    label: 'Surgical',
    description: 'Pre-authorization for surgical procedures',
    icon: Scissors,
    color: 'text-red-600',
  },
  {
    id: 'elective',
    label: 'Elective',
    description: 'Planned elective procedures requiring doctor consent',
    icon: Stethoscope,
    color: 'text-purple-600',
  },
  {
    id: 'oncology',
    label: 'Oncology',
    description: 'Cancer treatment pre-authorization',
    icon: Pill,
    color: 'text-pink-600',
  },
  {
    id: 'renal',
    label: 'Renal',
    description: 'Kidney/dialysis treatment pre-authorization',
    icon: Heart,
    color: 'text-orange-600',
  },
  {
    id: 'imaging',
    label: 'Imaging',
    description: 'Medical imaging and investigations',
    icon: Scan,
    color: 'text-cyan-600',
  },
  {
    id: 'optical',
    label: 'Optical',
    description: 'Optical/eye care services',
    icon: Eye,
    color: 'text-green-600',
  },
] as const;

type PreauthType = (typeof PREAUTH_TYPES)[number]['id'];

// ============================================================================
// Component
// ============================================================================

export default function NewPreauthPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<PreauthType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [consentToken, setConsentToken] = useState('');
  const [interventionCode, setInterventionCode] = useState('');
  const [patientId, setPatientId] = useState('');
  const [claimId, setClaimId] = useState('');
  const [diagnoses, setDiagnoses] = useState('');
  const [doctors, setDoctors] = useState('');
  const [items, setItems] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');

  const totalSteps = 3;

  const canProceedStep1 = selectedType !== null;
  const canProceedStep2 = consentToken.trim() && interventionCode.trim();

  const handleSubmit = async () => {
    if (!canProceedStep2) return;
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        preauth_type: selectedType,
      };
      if (diagnoses.trim()) {
        payload.diagnoses = diagnoses.split(',').map((d) => d.trim()).filter(Boolean);
      }
      if (doctors.trim()) {
        payload.doctors = doctors.split(',').map((d) => d.trim()).filter(Boolean);
      }
      if (items.trim()) {
        payload.items = items.split(',').map((i) => i.trim()).filter(Boolean);
      }
      if (clinicalNotes.trim()) {
        payload.clinical_notes = clinicalNotes;
      }

      await shaApi.ilmPreauthCreate({
        consent_token: consentToken.trim(),
        intervention_code: interventionCode.trim(),
        patient_pk: patientId ? Number(patientId) : 0,
        claim_pk: claimId ? Number(claimId) : undefined,
        payload,
      });

      toast({
        title: 'Pre-authorization Submitted',
        description: `${selectedType} preauth for ${interventionCode} submitted to SHA.`,
      });
      queryClient.invalidateQueries({ queryKey: ['preauths-list'] });
      router.push('/transactions/preauths');
    } catch (err) {
      toast({
        title: 'Submission Failed',
        description: err instanceof Error ? err.message : 'Failed to submit pre-authorization',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Pre-authorization"
        helpContent="Submit a pre-authorization request to SHA. Select the type and provide required clinical information."
      />

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {Array.from({ length: totalSteps }, (_, i) => (
          <React.Fragment key={i}>
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium',
                step > i + 1
                  ? 'bg-primary text-primary-foreground'
                  : step === i + 1
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              {step > i + 1 ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            {i < totalSteps - 1 && (
              <div className={cn('h-0.5 flex-1', step > i + 1 ? 'bg-primary' : 'bg-muted')} />
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Type</span>
        <span>Details</span>
        <span>Review</span>
      </div>

      {/* Step 1: Select Type */}
      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Select Pre-authorization Type</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PREAUTH_TYPES.map((type) => {
              const Icon = type.icon;
              return (
                <Card
                  key={type.id}
                  className={cn(
                    'cursor-pointer transition-colors hover:border-primary/50',
                    selectedType === type.id && 'border-primary bg-primary/5'
                  )}
                  onClick={() => setSelectedType(type.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Icon className={cn('h-5 w-5 mt-0.5', type.color)} />
                      <div>
                        <p className="font-medium">{type.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 2: Details */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">
            {PREAUTH_TYPES.find((t) => t.id === selectedType)?.label} Pre-authorization Details
          </h3>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Required Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="consent-token">Consent Token *</Label>
                  <Input
                    id="consent-token"
                    value={consentToken}
                    onChange={(e) => setConsentToken(e.target.value)}
                    placeholder="Patient's active consent token"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="intervention-code">Intervention Code *</Label>
                  <Input
                    id="intervention-code"
                    value={interventionCode}
                    onChange={(e) => setInterventionCode(e.target.value)}
                    placeholder="e.g., SHA-19-001"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="patient-id">Patient ID</Label>
                  <Input
                    id="patient-id"
                    type="number"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    placeholder="Local patient record ID"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="claim-id">Claim ID (optional)</Label>
                  <Input
                    id="claim-id"
                    type="number"
                    value={claimId}
                    onChange={(e) => setClaimId(e.target.value)}
                    placeholder="Link to existing claim"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="diagnoses">Diagnoses (comma-separated ICD-10 codes)</Label>
                <Input
                  id="diagnoses"
                  value={diagnoses}
                  onChange={(e) => setDiagnoses(e.target.value)}
                  placeholder="e.g., J06.9, R05"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="doctors">
                  Doctors (comma-separated registration numbers)
                  {selectedType === 'elective' && <span className="text-destructive"> *</span>}
                </Label>
                <Input
                  id="doctors"
                  value={doctors}
                  onChange={(e) => setDoctors(e.target.value)}
                  placeholder="e.g., A12345, B67890"
                />
                {selectedType === 'elective' && (
                  <p className="text-xs text-muted-foreground">
                    Elective preauths require doctor consent — listed doctors will receive an approval request.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="items">Items (comma-separated tariff codes)</Label>
                <Input
                  id="items"
                  value={items}
                  onChange={(e) => setItems(e.target.value)}
                  placeholder="e.g., SHA-19-001-A, SHA-19-001-B"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="clinical-notes">Clinical Notes</Label>
                <Textarea
                  id="clinical-notes"
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  placeholder="Clinical justification for pre-authorization..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Review &amp; Submit</h3>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  <Activity className="mr-1 h-3 w-3" />
                  {selectedType}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Consent Token</span>
                  <p className="font-mono text-xs break-all">{consentToken}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Intervention Code</span>
                  <p className="font-mono">{interventionCode}</p>
                </div>
                {patientId && (
                  <div>
                    <span className="text-muted-foreground">Patient ID</span>
                    <p>{patientId}</p>
                  </div>
                )}
                {diagnoses && (
                  <div>
                    <span className="text-muted-foreground">Diagnoses</span>
                    <p>{diagnoses}</p>
                  </div>
                )}
                {doctors && (
                  <div>
                    <span className="text-muted-foreground">Doctors</span>
                    <p>{doctors}</p>
                  </div>
                )}
                {items && (
                  <div>
                    <span className="text-muted-foreground">Items</span>
                    <p>{items}</p>
                  </div>
                )}
              </div>

              {clinicalNotes && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Clinical Notes</span>
                  <p className="mt-0.5 whitespace-pre-wrap">{clinicalNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedType === 'elective' && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-900/10 p-3">
              <p className="text-sm text-amber-800 dark:text-amber-400">
                <strong>Note:</strong> This elective preauth will trigger doctor consent approval.
                The listed doctors will receive a notification to approve via Practice360.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t">
        <Button
          variant="outline"
          onClick={() => {
            if (step === 1) router.push('/transactions/preauths');
            else setStep(step - 1);
          }}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          {step === 1 ? 'Cancel' : 'Back'}
        </Button>

        {step < totalSteps ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={
              (step === 1 && !canProceedStep1) || (step === 2 && !canProceedStep2)
            }
          >
            Next
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={isSubmitting || !canProceedStep2}>
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileCheck className="mr-2 h-4 w-4" />
            )}
            Submit to SHA
          </Button>
        )}
      </div>
    </div>
  );
}
