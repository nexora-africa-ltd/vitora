/**
 * Consent Confirmation Dialog
 *
 * Handles patient consent confirmation for data processing
 * as required by Kenya Data Protection Act 2019
 */
'use client';

import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ConsentDecision = 'granted' | 'deferred' | 'cancelled';

interface ConsentConfirmationDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Called when consent decision is made */
  onDecision: (decision: ConsentDecision) => void;
  /** Patient name for display */
  patientName?: string;
  /** Whether this is for a new CR record (first time registration) */
  isNewCRRecord?: boolean;
  /** Whether CR record was found */
  crRecordFound?: boolean;
}

export function ConsentConfirmationDialog({
  open,
  onOpenChange,
  onDecision,
  patientName,
  isNewCRRecord = false,
  crRecordFound = false,
}: ConsentConfirmationDialogProps) {
  const [consentChecked, setConsentChecked] = useState(false);
  const [processingChecked, setProcessingChecked] = useState(false);

  const canGrant = consentChecked && processingChecked;

  const handleGrant = () => {
    onDecision('granted');
    resetState();
  };

  const handleDefer = () => {
    onDecision('deferred');
    resetState();
  };

  const handleCancel = () => {
    onDecision('cancelled');
    resetState();
  };

  const resetState = () => {
    setConsentChecked(false);
    setProcessingChecked(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Patient Consent Required
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              {/* CR Record Status */}
              {crRecordFound ? (
                <Alert className="border-success bg-success/10">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <AlertTitle className="text-success">Client Registry Record Found</AlertTitle>
                  <AlertDescription>
                    {patientName ? (
                      <span>Found existing record for <strong>{patientName}</strong>. Patient information will be auto-populated.</span>
                    ) : (
                      'Patient record found in the national Client Registry.'
                    )}
                  </AlertDescription>
                </Alert>
              ) : isNewCRRecord ? (
                <Alert className="border-warning bg-warning/10">
                  <Info className="h-4 w-4 text-warning-foreground" />
                  <AlertTitle className="text-warning-foreground">New Client Registry Record</AlertTitle>
                  <AlertDescription>
                    No existing record found. Registering this patient will create a new record in Kenya&apos;s national Client Registry.
                  </AlertDescription>
                </Alert>
              ) : null}

              {/* Consent Requirements */}
              <div className="text-sm text-muted-foreground">
                <p className="mb-3">
                  Under the Kenya Data Protection Act 2019, patient consent is required before collecting and processing personal health information.
                </p>

                <p className="font-medium text-foreground mb-2">
                  Please confirm that you have obtained verbal consent from the patient for:
                </p>
              </div>

              {/* Consent Checkboxes */}
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="consent-collection"
                    checked={consentChecked}
                    onCheckedChange={(checked) => setConsentChecked(checked === true)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="consent-collection" className="cursor-pointer leading-normal">
                      Collection and storage of personal health information
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Including name, ID, contact details, and medical records
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="consent-processing"
                    checked={processingChecked}
                    onCheckedChange={(checked) => setProcessingChecked(checked === true)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="consent-processing" className="cursor-pointer leading-normal">
                      Processing of data for healthcare purposes
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Enabling healthcare providers to access records for diagnosis and treatment
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>

          <Button
            variant="outline"
            onClick={handleDefer}
            className="border-warning text-warning-foreground hover:bg-warning/10"
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Defer Consent
          </Button>

          <AlertDialogAction
            onClick={handleGrant}
            disabled={!canGrant}
            className={cn(!canGrant && 'opacity-50 cursor-not-allowed')}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Confirm Consent
          </AlertDialogAction>
        </AlertDialogFooter>

        {/* Deferred Consent Warning */}
        <div className="mt-2 text-xs text-muted-foreground text-center">
          <AlertTriangle className="h-3 w-3 inline mr-1" />
          If consent is deferred, it must be obtained before discharge, claim submission, or encounter completion.
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConsentConfirmationDialog;
