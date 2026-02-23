/**
 * Prescription Allergy Warning Component
 *
 * Alert dialog shown when drug-allergy interactions are detected.
 * Requires acknowledgment before proceeding with prescription.
 */

'use client';

import { useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DrugInteractionCheck, AllergySeverity } from '@/lib/types/allergy';

interface PrescriptionAllergyWarningProps {
  /**
   * Whether the dialog is open
   */
  open: boolean;
  /**
   * Handler for open state changes
   */
  onOpenChange: (open: boolean) => void;
  /**
   * The interaction check result from the API
   */
  interactions: DrugInteractionCheck;
  /**
   * Called when user acknowledges the warning and proceeds
   */
  onAcknowledge: () => void;
  /**
   * Called when user cancels the prescription
   */
  onCancel: () => void;
}

// Severity color mapping
const severityColors: Record<AllergySeverity, string> = {
  mild: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  moderate: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  severe: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  life_threatening:
    'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300 font-semibold',
};

export function PrescriptionAllergyWarning({
  open,
  onOpenChange,
  interactions,
  onAcknowledge,
  onCancel,
}: PrescriptionAllergyWarningProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  // Reset acknowledgment when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setAcknowledged(false);
    }
    onOpenChange(isOpen);
  };

  const handleProceed = () => {
    if (acknowledged) {
      onAcknowledge();
    }
  };

  const handleCancel = () => {
    setAcknowledged(false);
    onCancel();
  };

  const hasHighRisk = interactions.has_high_risk;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle
            className={`flex items-center gap-2 ${hasHighRisk ? 'text-destructive' : 'text-orange-600 dark:text-orange-500'}`}
          >
            {hasHighRisk ? (
              <ShieldAlert className="h-5 w-5" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
            Drug-Allergy Interaction Warning
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasHighRisk
              ? 'High-risk drug-allergy interactions were detected. Please review carefully before proceeding.'
              : 'The following drug-allergy interactions were detected:'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Interaction List */}
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-3 py-4">
            {interactions.interactions.map((interaction) => (
              <div
                key={interaction.allergy_id}
                className={`p-3 rounded-lg border ${
                  interaction.is_high_risk
                    ? 'border-destructive/30 bg-destructive/5'
                    : 'border-orange-200 bg-orange-50 dark:border-orange-900/30 dark:bg-orange-950/20'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">
                      {interaction.drug_name ?? `Drug ID: ${interaction.drug_id}`}
                    </span>
                    {interaction.is_high_risk && (
                      <Badge
                        variant="destructive"
                        className="ml-2 text-xs"
                      >
                        HIGH RISK
                      </Badge>
                    )}
                  </div>
                  <Badge className={`${severityColors[interaction.severity]} shrink-0`}>
                    {interaction.severity_display}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-medium">Patient allergic to:</span> {interaction.substance}
                </p>
                {interaction.reaction_type !== 'other' && (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">Previous reaction:</span>{' '}
                    {interaction.reaction_type.replace(/_/g, ' ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Acknowledgment Checkbox */}
        <div
          className={`flex items-start gap-3 p-3 rounded-lg ${
            hasHighRisk ? 'bg-destructive/5 border border-destructive/20' : 'bg-muted'
          }`}
        >
          <Checkbox
            id="acknowledge"
            checked={acknowledged}
            onCheckedChange={(checked) => setAcknowledged(!!checked)}
            className={hasHighRisk ? 'border-destructive' : ''}
          />
          <label
            htmlFor="acknowledge"
            className={`text-sm leading-relaxed cursor-pointer ${
              hasHighRisk ? 'text-destructive' : ''
            }`}
          >
            {hasHighRisk
              ? 'I have reviewed these HIGH-RISK drug-allergy interactions and accept full clinical responsibility for proceeding with this prescription.'
              : 'I acknowledge these drug-allergy interactions and accept clinical responsibility for this prescription.'}
          </label>
        </div>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel onClick={handleCancel} className="w-full sm:w-auto">
            Cancel Prescription
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleProceed}
            disabled={!acknowledged}
            className={`w-full sm:w-auto ${
              hasHighRisk
                ? 'bg-destructive hover:bg-destructive/90'
                : 'bg-orange-600 hover:bg-orange-700'
            }`}
          >
            {hasHighRisk ? 'Proceed Despite Risk' : 'Proceed with Prescription'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
