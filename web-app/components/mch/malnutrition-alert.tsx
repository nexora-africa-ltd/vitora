'use client';

import { AlertTriangle, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { MUACClassification, NutritionalStatus } from '@/lib/types/mch';

interface MalnutritionAlertProps {
  /** MUAC classification (SAM, MAM, or NORMAL) */
  muacClassification?: MUACClassification;
  /** Overall nutritional status */
  nutritionalStatus?: NutritionalStatus;
  /** Whether the measurement has any critical flag */
  hasCriticalFlag: boolean;
  /** Alert messages from the backend */
  alerts?: string[];
  /** Patient name for display */
  patientName?: string;
  /** Optional callback when "Refer" is clicked */
  onRefer?: () => void;
}

/**
 * Alert banner displayed when SAM (Severe Acute Malnutrition) or
 * MAM (Moderate Acute Malnutrition) is detected in growth measurements.
 *
 * Shows severity-appropriate messaging and recommended actions
 * per Kenya's IMAM (Integrated Management of Acute Malnutrition) guidelines.
 */
export function MalnutritionAlert({
  muacClassification,
  nutritionalStatus,
  hasCriticalFlag,
  alerts = [],
  patientName,
  onRefer,
}: MalnutritionAlertProps) {
  if (!hasCriticalFlag && muacClassification !== 'SAM' && muacClassification !== 'MAM') {
    return null;
  }

  const isSAM =
    muacClassification === 'SAM' ||
    nutritionalStatus === 'SEVERE_UNDERWEIGHT';
  const isMAM =
    muacClassification === 'MAM' ||
    nutritionalStatus === 'MODERATE_UNDERWEIGHT';

  return (
    <Alert variant="destructive" className={isSAM ? 'border-red-500 bg-red-50' : 'border-orange-500 bg-orange-50'}>
      <AlertTriangle className={`h-5 w-5 ${isSAM ? 'text-red-600' : 'text-orange-600'}`} />
      <AlertTitle className={`font-semibold ${isSAM ? 'text-red-800' : 'text-orange-800'}`}>
        {isSAM
          ? 'Severe Acute Malnutrition (SAM) Detected'
          : isMAM
            ? 'Moderate Acute Malnutrition (MAM) Detected'
            : 'Nutritional Concern Detected'}
      </AlertTitle>
      <AlertDescription className={`space-y-2 ${isSAM ? 'text-red-700' : 'text-orange-700'}`}>
        {patientName && (
          <p className="font-medium">{patientName}</p>
        )}

        {alerts.length > 0 && (
          <ul className="list-disc list-inside text-sm space-y-1">
            {alerts.map((alert, i) => (
              <li key={i}>{alert}</li>
            ))}
          </ul>
        )}

        <div className="text-sm mt-2">
          {isSAM ? (
            <div className="space-y-1">
              <p className="font-medium">Recommended Actions (IMAM Guidelines):</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Refer immediately for inpatient therapeutic care</li>
                <li>Check for medical complications (appetite test, bilateral pitting edema)</li>
                <li>Initiate therapeutic feeding (F-75, F-100, or RUTF)</li>
                <li>Monitor vital signs and hydration status</li>
              </ul>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="font-medium">Recommended Actions:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Enroll in Supplementary Feeding Programme (SFP)</li>
                <li>Provide nutrition counselling to caregiver</li>
                <li>Schedule follow-up measurement in 2 weeks</li>
                <li>Screen for underlying conditions (infections, diarrhea)</li>
              </ul>
            </div>
          )}
        </div>

        {onRefer && (
          <div className="mt-3">
            <Button
              size="sm"
              variant={isSAM ? 'destructive' : 'outline'}
              onClick={onRefer}
              className="gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Create Referral
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
