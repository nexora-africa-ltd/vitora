/**
 * SHA Principal Confirmation Dialog
 * 
 * When SHA eligibility check returns member details but no CR record exists,
 * this dialog asks the user to confirm whether the SHA principal (main member)
 * is the same person as the patient being registered.
 * 
 * This is important because:
 * 1. SHA might return the principal's information even when checking a dependent
 * 2. The user should verify the identity before auto-populating the form
 */
'use client';

import React from 'react';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Shield, Users, UserCheck, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DirectEligibilityCheckResponse, SHADependent } from '@/lib/types/sha';

export type SHAPrincipalDecision = 'confirmed' | 'is_dependent' | 'cancelled';

interface SHAPrincipalConfirmationDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Called when decision is made */
  onDecision: (decision: SHAPrincipalDecision, selectedDependent?: SHADependent) => void;
  /** SHA eligibility details */
  shaDetails: DirectEligibilityCheckResponse | null;
}

export function SHAPrincipalConfirmationDialog({
  open,
  onOpenChange,
  onDecision,
  shaDetails,
}: SHAPrincipalConfirmationDialogProps) {
  const [selectedDependent, setSelectedDependent] = React.useState<SHADependent | null>(null);

  if (!shaDetails) return null;

  const hasDependents = shaDetails.dependents && shaDetails.dependents.length > 0;

  const handleConfirmPrincipal = () => {
    onDecision('confirmed');
    setSelectedDependent(null);
  };

  const handleSelectDependent = (dependent: SHADependent) => {
    setSelectedDependent(dependent);
  };

  const handleConfirmDependent = () => {
    if (selectedDependent) {
      onDecision('is_dependent', selectedDependent);
      setSelectedDependent(null);
    }
  };

  const handleCancel = () => {
    onDecision('cancelled');
    setSelectedDependent(null);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            SHA Record Found - Confirm Identity
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              {/* SHA Member Info */}
              <Alert className="border-blue-200 bg-blue-50">
                <UserCheck className="h-4 w-4 text-blue-600" />
                <AlertTitle className="text-blue-700">SHA Principal Member</AlertTitle>
                <AlertDescription className="text-blue-600">
                  <div className="mt-2 space-y-1">
                    <p><strong>Name:</strong> {shaDetails.full_name || 'Not available'}</p>
                    <p><strong>SHA Number:</strong> {shaDetails.sha_number || 'Not available'}</p>
                    {shaDetails.coverage_end_date && (
                      <p><strong>Coverage Until:</strong> {shaDetails.coverage_end_date}</p>
                    )}
                    {shaDetails.copay_percentage !== undefined && shaDetails.copay_percentage > 0 && (
                      <p><strong>Co-pay:</strong> {shaDetails.copay_percentage}%</p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>

              {/* Question */}
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">
                  Is this the patient you are registering?
                </p>
                <p>
                  SHA details were found. Please confirm if the principal member shown above
                  is the patient being registered, or select a dependent if applicable.
                </p>
              </div>

              {/* Dependents Section */}
              {hasDependents && (
                <div className="space-y-3">
                  <Alert className="border-amber-200 bg-amber-50">
                    <Users className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-700 flex items-center gap-2">
                      Dependents Found
                      <Badge variant="outline" className="text-amber-600 border-amber-300">
                        {shaDetails.dependents?.length}
                      </Badge>
                    </AlertTitle>
                    <AlertDescription className="text-amber-600">
                      <p className="mb-2">
                        If the patient is a dependent, select them below:
                      </p>
                      <div className="space-y-2 mt-3">
                        {shaDetails.dependents?.map((dependent, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleSelectDependent(dependent)}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-md border transition-colors",
                              selectedDependent === dependent
                                ? "border-amber-500 bg-amber-100"
                                : "border-amber-200 bg-white hover:border-amber-300 hover:bg-amber-50"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-amber-800">{dependent.name}</p>
                                <p className="text-xs text-amber-600">
                                  {dependent.relationship && `${dependent.relationship} • `}
                                  {dependent.date_of_birth && `DOB: ${dependent.date_of_birth}`}
                                  {dependent.age !== undefined && ` (${dependent.age} yrs)`}
                                </p>
                              </div>
                              {dependent.sha_number && (
                                <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                                  {dependent.sha_number}
                                </Badge>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {/* Warning for manual entry */}
              <Alert className="border-slate-200 bg-slate-50">
                <AlertTriangle className="h-4 w-4 text-slate-500" />
                <AlertDescription className="text-slate-600 text-xs">
                  If the patient is not shown here, click &quot;Enter Manually&quot; to proceed
                  without auto-populating SHA details.
                </AlertDescription>
              </Alert>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={handleCancel}>
            Enter Manually
          </AlertDialogCancel>
          {selectedDependent ? (
            <AlertDialogAction
              onClick={handleConfirmDependent}
              className="bg-amber-600 hover:bg-amber-700"
            >
              <Users className="h-4 w-4 mr-2" />
              Use Dependent: {selectedDependent.name.split(' ')[0]}
            </AlertDialogAction>
          ) : (
            <AlertDialogAction
              onClick={handleConfirmPrincipal}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <UserCheck className="h-4 w-4 mr-2" />
              Yes, This is the Patient
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default SHAPrincipalConfirmationDialog;
