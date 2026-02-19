/**
 * Patient Verification Dialog
 *
 * A unified verification modal that implements the SHA-first flow:
 * 1. Show SHA eligibility results (principal + dependents)
 * 2. User selects WHO they are registering (principal or dependent)
 * 3. Then duplicate check runs against the selected person
 *
 * This prevents the race condition of checking duplicates before knowing
 * which person (principal vs dependent) is being registered.
 */
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  AlertTriangle,
  User,
  UserCheck,
  UserPlus,
  ExternalLink,
  Users,
  ChevronDown,
  ChevronUp,
  Loader2,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { HelpPopover } from '@/components/shared/help-popover';
import { SHALogo } from '@/components/ui/sha-logo';
import { cn } from '@/lib/utils';
import type { DuplicateMatch, DuplicateCheckResult } from '@/lib/types/patient';
import type { DirectEligibilityCheckResponse, SHADependent } from '@/lib/types/sha';

export type VerificationDecision =
  | { type: 'select_existing'; mrn: string }
  | { type: 'continue_new' }
  | { type: 'use_sha_principal' }
  | { type: 'use_sha_dependent'; dependent: SHADependent }
  | { type: 'enter_manually' }
  | { type: 'cancelled' };

interface PatientVerificationDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Callback when user makes a decision */
  onDecision: (decision: VerificationDecision) => void;

  /** Duplicate check results (if any) */
  duplicateResult: DuplicateCheckResult | null;
  /** Whether duplicate check is loading */
  isCheckingDuplicates?: boolean;

  /** SHA eligibility details (if any) */
  shaDetails: DirectEligibilityCheckResponse | null;
  /** Whether SHA check is still loading */
  isCheckingSha?: boolean;

  /** Whether CR record was found (affects messaging) */
  crRecordFound: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Principal member selection card */
function PrincipalCard({
  shaDetails,
  isSelected,
  onSelect,
}: {
  shaDetails: DirectEligibilityCheckResponse;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left p-3 sm:p-4 rounded-lg border-2 transition-all',
        isSelected
          ? 'border-success bg-success/10 ring-2 ring-success/20'
          : 'border-border bg-card hover:border-success/50 hover:bg-success/5'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'h-10 w-10 rounded-full flex items-center justify-center shrink-0',
          isSelected ? 'bg-success/20' : 'bg-muted'
        )}>
          <UserCheck className={cn(
            'h-5 w-5',
            isSelected ? 'text-success' : 'text-muted-foreground'
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{shaDetails.full_name || 'Principal Member'}</span>
            <Badge variant="outline" className="text-xs">
              Principal
            </Badge>
            {isSelected && (
              <CheckCircle2 className="h-4 w-4 text-success ml-auto shrink-0" />
            )}
          </div>
          <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
            {shaDetails.sha_number && (
              <p className="font-mono text-xs">{shaDetails.sha_number}</p>
            )}
            <p className={cn(
              'text-xs',
              shaDetails.is_eligible ? 'text-success' : 'text-muted-foreground'
            )}>
              {shaDetails.is_eligible ? '✓ Active coverage' : '✗ Coverage inactive'}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}

/** Dependent selection card */
function DependentCard({
  dependent,
  isSelected,
  onSelect,
}: {
  dependent: SHADependent;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left p-3 rounded-lg border-2 transition-all',
        isSelected
          ? 'border-warning bg-warning/10 ring-2 ring-warning/20'
          : 'border-border bg-card hover:border-warning/50 hover:bg-warning/5'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
          isSelected ? 'bg-warning/20' : 'bg-muted'
        )}>
          <Users className={cn(
            'h-4 w-4',
            isSelected ? 'text-warning-foreground' : 'text-muted-foreground'
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{dependent.name}</span>
            {isSelected && (
              <CheckCircle2 className="h-4 w-4 text-warning-foreground ml-auto shrink-0" />
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {dependent.relationship && `${dependent.relationship}`}
            {dependent.date_of_birth && ` • DOB: ${dependent.date_of_birth}`}
            {dependent.age !== undefined && ` (${dependent.age} yrs)`}
          </p>
        </div>
      </div>
    </button>
  );
}

/** Patient match card for duplicates */
function PatientMatchCard({
  match,
  isPrimary,
  onSelect,
}: {
  match: DuplicateMatch;
  isPrimary: boolean;
  onSelect: () => void;
}) {
  const confidenceColor = match.match_confidence >= 95
    ? 'text-destructive'
    : match.match_confidence >= 80
      ? 'text-warning-foreground'
      : 'text-muted-foreground';

  return (
    <Card className={cn(
      'transition-all',
      isPrimary && 'border-destructive/50 shadow-sm'
    )}>
      <CardContent className="p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn(
              'h-9 w-9 rounded-full flex items-center justify-center shrink-0',
              isPrimary ? 'bg-destructive/10' : 'bg-muted'
            )}>
              <User className={cn(
                'h-4 w-4',
                isPrimary ? 'text-destructive' : 'text-muted-foreground'
              )} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm truncate">{match.full_name}</span>
                <Badge variant="outline" className={cn('text-xs', confidenceColor)}>
                  {match.match_confidence}%
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground mt-0.5">
                <span className="font-mono bg-muted px-1 py-0.5 rounded">{match.mrn}</span>
                <span>{format(new Date(match.date_of_birth), 'MMM d, yyyy')}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-2 sm:mt-0">
            <Button size="sm" variant="default" onClick={onSelect} className="flex-1 sm:flex-none">
              <UserCheck className="h-3.5 w-3.5 mr-1" />
              <span className="sm:hidden">Select</span>
              <span className="hidden sm:inline">Check-in</span>
            </Button>
            <Button size="sm" variant="outline" asChild className="flex-1 sm:flex-none">
              <Link href={`/patients/${match.id}`} target="_blank">
                <ExternalLink className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">View</span>
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function PatientVerificationDialog({
  open,
  onOpenChange,
  onDecision,
  duplicateResult,
  isCheckingDuplicates = false,
  shaDetails,
  isCheckingSha = false,
  crRecordFound,
}: PatientVerificationDialogProps) {
  // Selection state
  const [selectedPerson, setSelectedPerson] = useState<'principal' | 'dependent' | 'manual' | null>(null);
  const [selectedDependent, setSelectedDependent] = useState<SHADependent | null>(null);
  const [showAllMatches, setShowAllMatches] = useState(false);

  // Reset selection when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setSelectedPerson(null);
      setSelectedDependent(null);
      setShowAllMatches(false);
    }
  }, [open]);

  // Derived state
  const hasShaDetails = !!(shaDetails && (shaDetails.full_name || shaDetails.sha_number));
  const hasDependents = !!(shaDetails?.dependents && shaDetails.dependents.length > 0);
  const hasDuplicates = !!(duplicateResult?.has_duplicate && duplicateResult.matches.length > 0);
  const isExactIdMatch = duplicateResult?.match_type === 'exact_id';
  const isLoading = isCheckingSha || isCheckingDuplicates;

  // Primary duplicate match
  const primaryMatch = duplicateResult?.matches[0];
  const additionalMatches = duplicateResult?.matches.slice(1) ?? [];

  // Can proceed with registration?
  const canProceed = selectedPerson !== null && !isExactIdMatch;

  // Handlers
  const handleSelectPrincipal = useCallback(() => {
    setSelectedPerson('principal');
    setSelectedDependent(null);
  }, []);

  const handleSelectDependent = useCallback((dependent: SHADependent) => {
    setSelectedPerson('dependent');
    setSelectedDependent(dependent);
  }, []);

  const handleSelectManual = useCallback(() => {
    setSelectedPerson('manual');
    setSelectedDependent(null);
  }, []);

  const handleSelectExisting = useCallback((mrn: string) => {
    onDecision({ type: 'select_existing', mrn });
  }, [onDecision]);

  const handleProceed = useCallback(() => {
    if (selectedPerson === 'principal') {
      onDecision({ type: 'use_sha_principal' });
    } else if (selectedPerson === 'dependent' && selectedDependent) {
      onDecision({ type: 'use_sha_dependent', dependent: selectedDependent });
    } else if (selectedPerson === 'manual') {
      onDecision({ type: 'enter_manually' });
    } else {
      onDecision({ type: 'continue_new' });
    }
  }, [onDecision, selectedPerson, selectedDependent]);

  const handleCancel = useCallback(() => {
    onDecision({ type: 'cancelled' });
    onOpenChange(false);
  }, [onDecision, onOpenChange]);

  // Don't render if nothing to show
  const hasContent = hasShaDetails || hasDuplicates || isLoading;
  if (!hasContent) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg p-0 gap-0 max-h-[90vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 shrink-0 border-b">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-base sm:text-lg">
              Patient Verification
            </DialogTitle>
            <HelpPopover content="Select the person you're registering, then check for existing records." />
          </div>
        </DialogHeader>

        {/* Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-4 sm:px-6 space-y-4">

            {/* ─────────────────────────────────────────────────────
                STEP 1: SHA MEMBER SELECTION
            ───────────────────────────────────────────────────── */}
            {(hasShaDetails || isCheckingSha) && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <SHALogo size="sm" />
                  <h3 className="font-semibold text-sm">Who are you registering?</h3>
                </div>

                {isCheckingSha && !hasShaDetails ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    <span className="text-sm">Checking SHA membership...</span>
                  </div>
                ) : hasShaDetails && shaDetails ? (
                  <div className="space-y-2">
                    {/* Principal */}
                    <PrincipalCard
                      shaDetails={shaDetails}
                      isSelected={selectedPerson === 'principal'}
                      onSelect={handleSelectPrincipal}
                    />

                    {/* Dependents */}
                    {hasDependents && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground px-1">
                          Or select a dependent:
                        </p>
                        <div className="grid gap-2">
                          {shaDetails.dependents?.map((dep, idx) => (
                            <DependentCard
                              key={idx}
                              dependent={dep}
                              isSelected={selectedPerson === 'dependent' && selectedDependent === dep}
                              onSelect={() => handleSelectDependent(dep)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Manual entry option */}
                    <button
                      type="button"
                      onClick={handleSelectManual}
                      className={cn(
                        'w-full text-left p-3 rounded-lg border-2 transition-all text-sm',
                        selectedPerson === 'manual'
                          ? 'border-primary bg-primary/10'
                          : 'border-dashed border-muted-foreground/30 hover:border-muted-foreground/50'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Enter details manually</span>
                        {selectedPerson === 'manual' && (
                          <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />
                        )}
                      </div>
                    </button>
                  </div>
                ) : null}
              </section>
            )}

            {/* ─────────────────────────────────────────────────────
                STEP 2: DUPLICATE CHECK RESULTS
            ───────────────────────────────────────────────────── */}
            {(hasDuplicates || isCheckingDuplicates) && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={cn(
                    'h-4 w-4',
                    isExactIdMatch ? 'text-destructive' : 'text-warning-foreground'
                  )} />
                  <h3 className="font-semibold text-sm">
                    {isExactIdMatch ? 'Patient Already Exists' : 'Similar Patients Found'}
                  </h3>
                </div>

                {isCheckingDuplicates ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    <span className="text-sm">Checking for existing records...</span>
                  </div>
                ) : hasDuplicates && primaryMatch ? (
                  <div className="space-y-2">
                    {isExactIdMatch && (
                      <Alert variant="destructive" className="py-2">
                        <AlertDescription className="text-xs">
                          A patient with this ID already exists. Select the existing record or use a different ID.
                        </AlertDescription>
                      </Alert>
                    )}

                    <PatientMatchCard
                      match={primaryMatch}
                      isPrimary
                      onSelect={() => handleSelectExisting(primaryMatch.mrn)}
                    />

                    {/* Additional matches */}
                    {additionalMatches.length > 0 && (
                      <Collapsible open={showAllMatches} onOpenChange={setShowAllMatches}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full text-xs">
                            {showAllMatches ? (
                              <><ChevronUp className="h-3 w-3 mr-1" /> Hide {additionalMatches.length} more</>
                            ) : (
                              <><ChevronDown className="h-3 w-3 mr-1" /> Show {additionalMatches.length} more</>
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-2">
                          {additionalMatches.map((match) => (
                            <PatientMatchCard
                              key={match.id}
                              match={match}
                              isPrimary={false}
                              onSelect={() => handleSelectExisting(match.mrn)}
                            />
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {/* Continue as new option (non-exact matches only) */}
                    {!isExactIdMatch && (
                      <p className="text-xs text-muted-foreground text-center pt-2">
                        If this is a different person, proceed with registration below.
                      </p>
                    )}
                  </div>
                ) : null}
              </section>
            )}

            {/* No SHA but has duplicates - show context */}
            {!hasShaDetails && !isCheckingSha && hasDuplicates && !isExactIdMatch && (
              <p className="text-xs text-muted-foreground">
                Select an existing patient above, or proceed with new registration.
              </p>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-4 py-3 sm:px-6 border-t bg-muted/30 shrink-0">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
            >
              Cancel
            </Button>

            {!isExactIdMatch && (
              <Button
                size="sm"
                onClick={handleProceed}
                disabled={!canProceed && hasShaDetails}
                className={cn(
                  selectedPerson === 'principal' && 'bg-success hover:bg-success/90',
                  selectedPerson === 'dependent' && 'bg-warning text-warning-foreground hover:bg-warning/90'
                )}
              >
                {selectedPerson === 'principal' && (
                  <>
                    <UserCheck className="h-4 w-4 mr-1.5" />
                    <span className="hidden sm:inline">Register Principal</span>
                    <span className="sm:hidden">Continue</span>
                  </>
                )}
                {selectedPerson === 'dependent' && selectedDependent && (
                  <>
                    <Users className="h-4 w-4 mr-1.5" />
                    <span className="hidden sm:inline">Register {selectedDependent.name.split(' ')[0]}</span>
                    <span className="sm:hidden">Continue</span>
                  </>
                )}
                {selectedPerson === 'manual' && (
                  <>
                    <UserPlus className="h-4 w-4 mr-1.5" />
                    <span className="hidden sm:inline">Enter Manually</span>
                    <span className="sm:hidden">Continue</span>
                  </>
                )}
                {!selectedPerson && !hasShaDetails && (
                  <>
                    <ArrowRight className="h-4 w-4 mr-1.5" />
                    <span>Continue Registration</span>
                  </>
                )}
                {!selectedPerson && hasShaDetails && (
                  <span className="text-muted-foreground">Select a person above</span>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PatientVerificationDialog;
