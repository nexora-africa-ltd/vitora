/**
 * SHA Claim Form Component
 * Form for submitting SHA (Social Health Authority) claims
 * 
 * IMPORTANT: SHA claims require an active encounter to be valid.
 * Claims submitted without encounter context will be rejected.
 */
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, FileCheck, Loader2 } from 'lucide-react';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { usePatientContext } from '@/lib/context/patient-context';

// ============================================================================
// Types
// ============================================================================

interface SHAClaimFormProps {
  invoiceId: number;
  encounterId?: number;
  patientId?: number;
  onSubmit?: (data: SHAClaimData) => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

interface SHAClaimData {
  invoice_id: number;
  encounter_id: number;
  patient_id: number;
  claim_type: string;
}

// ============================================================================
// Main Component
// ============================================================================

export function SHAClaimForm({
  invoiceId,
  encounterId,
  patientId,
  onSubmit,
  onCancel,
  isLoading,
}: SHAClaimFormProps) {
  // Try to get from context first
  let contextPatientId: number | undefined;
  let contextEncounterId: number | undefined;
  
  try {
    const patientContext = usePatientContext();
    contextPatientId = patientContext.patient?.id;
  } catch {
    // Not in patient context
  }
  
  try {
    const encounterContext = useEncounterContext();
    contextEncounterId = encounterContext.encounter?.id;
  } catch {
    // Not in encounter context
  }
  
  const effectivePatientId = patientId ?? contextPatientId;
  const effectiveEncounterId = encounterId ?? contextEncounterId;
  const hasEncounter = !!effectiveEncounterId;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!hasEncounter || !effectivePatientId) {
      return;
    }
    
    onSubmit?.({
      invoice_id: invoiceId,
      encounter_id: effectiveEncounterId!,
      patient_id: effectivePatientId,
      claim_type: 'OUTPATIENT',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCheck className="h-5 w-5" />
          Submit SHA Claim
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" role="form" data-testid="sha-claim-form">
          {/* Encounter Required Warning */}
          {!hasEncounter && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>SHA Encounter Required</AlertTitle>
              <AlertDescription>
                SHA claims require an active encounter. Claims submitted without an encounter will be rejected by SHA.
              </AlertDescription>
            </Alert>
          )}

          {/* Claim Details */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice ID:</span>
              <span className="font-mono">{invoiceId}</span>
            </div>
            {effectiveEncounterId && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Encounter ID:</span>
                <span className="font-mono">{effectiveEncounterId}</span>
              </div>
            )}
            {effectivePatientId && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Patient ID:</span>
                <span className="font-mono">{effectivePatientId}</span>
              </div>
            )}
          </div>

          {/* SHA Compliance Notice */}
          {hasEncounter && (
            <Alert>
              <FileCheck className="h-4 w-4" />
              <AlertTitle>Ready for Submission</AlertTitle>
              <AlertDescription>
                This claim has all required information for SHA submission.
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button 
              type="submit" 
              disabled={!hasEncounter || isLoading}
              aria-label="Submit SHA Claim"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit to SHA
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// Default export
export default SHAClaimForm;
