/**
 * Duplicate Patient Modal
 *
 * A workflow clarification modal that appears when the system detects
 * a potential duplicate patient during registration.
 *
 * For exact matches (ID match), blocks registration - user must check-in or use different ID.
 * For partial matches (demographic), allows user to acknowledge and continue.
 */
'use client';

import Link from 'next/link';
import { formatDate } from '@/lib/utils/format';
import {
  AlertTriangle,
  User,
  UserCheck,
  UserPlus,
  ExternalLink,
  Calendar,
  XCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { DuplicateMatch, DuplicateCheckResult } from '@/lib/types/patient';

interface DuplicatePatientModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal open state changes */
  onOpenChange: (open: boolean) => void;
  /** Duplicate check result containing matches */
  result: DuplicateCheckResult | null;
  /** Callback when user selects to check-in existing patient (passes MRN) */
  onSelectExistingPatient: (mrn: string) => void;
  /** Callback when user confirms to continue with new registration */
  onContinueAsNew: () => void;
  /** Whether the continue button is loading */
  isLoading?: boolean;
  /** Name of person being registered (for context) */
  registeringName?: string;
}

function PatientCard({
  match,
  isExact,
  onSelect,
}: {
  match: DuplicateMatch;
  isExact: boolean;
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
      isExact && 'border-destructive bg-destructive/5'
    )}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          {/* Avatar */}
          <div className={cn(
            'h-11 w-11 rounded-full flex items-center justify-center shrink-0',
            isExact ? 'bg-destructive/20' : 'bg-muted'
          )}>
            <User className={cn(
              'h-5 w-5',
              isExact ? 'text-destructive' : 'text-muted-foreground'
            )} />
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{match.full_name}</span>
              <Badge variant="outline" className={cn('text-xs', confidenceColor)}>
                {match.match_confidence}%
              </Badge>
              {isExact && (
                <Badge variant="destructive" className="text-xs">
                  Exact
                </Badge>
              )}
            </div>

            <div className="grid gap-1 text-sm text-muted-foreground">
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded w-fit">
                {match.mrn}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span>{formatDate(match.date_of_birth)}</span>
                <span>•</span>
                <span>{match.gender === 'M' ? 'Male' : match.gender === 'F' ? 'Female' : 'Other'}</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground italic">
              {match.match_reason}
            </p>

            {/* Actions - stack on mobile, inline on sm+ */}
            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap">
              <Button size="sm" onClick={onSelect} className="w-full sm:w-auto">
                <UserCheck className="h-4 w-4 mr-1.5" />
                Check-in Patient
              </Button>
              <Button size="sm" variant="outline" asChild className="w-full sm:w-auto">
                <Link href={`/patients/${match.id}`} target="_blank">
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  View Record
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DuplicatePatientModal({
  open,
  onOpenChange,
  result,
  onSelectExistingPatient,
  onContinueAsNew,
  isLoading,
  registeringName,
}: DuplicatePatientModalProps) {
  if (!result || !result.has_duplicate || result.matches.length === 0) {
    return null;
  }

  const isExactIdMatch = result.match_type === 'exact_id';
  const primaryMatch = result.matches[0];
  const additionalMatches = result.matches.slice(1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg p-0 gap-0 max-h-[90vh] flex flex-col">
        {/* Header */}
        <DialogHeader className={cn(
          'px-4 pt-4 pb-3 sm:px-6 shrink-0 border-b',
          isExactIdMatch ? 'bg-destructive/5' : 'bg-warning/5'
        )}>
          <div className="flex items-start gap-3">
            <div className={cn(
              'h-10 w-10 rounded-full flex items-center justify-center shrink-0',
              isExactIdMatch ? 'bg-destructive/20' : 'bg-warning/20'
            )}>
              <AlertTriangle className={cn(
                'h-5 w-5',
                isExactIdMatch ? 'text-destructive' : 'text-warning-foreground'
              )} />
            </div>
            <div className="min-w-0">
              <DialogTitle className={cn(
                isExactIdMatch ? 'text-destructive' : 'text-warning-foreground'
              )}>
                {isExactIdMatch ? 'Patient Already Registered' : 'Similar Patient Found'}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {isExactIdMatch ? (
                  <>
                    The ID matches an existing patient record.
                    {registeringName && (
                      <span className="block text-sm font-medium mt-1">
                        Registering: {registeringName}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    Found {result.matches.length} patient{result.matches.length > 1 ? 's' : ''} with similar details.
                  </>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-4 sm:px-6 space-y-3">
            {/* Primary match */}
            {primaryMatch && (
              <PatientCard
                match={primaryMatch}
                isExact={isExactIdMatch}
                onSelect={() => onSelectExistingPatient(primaryMatch.mrn)}
              />
            )}

            {/* Additional matches */}
            {additionalMatches.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium px-1">
                  {additionalMatches.length} other potential match{additionalMatches.length > 1 ? 'es' : ''}:
                </p>
                {additionalMatches.map((match) => (
                  <PatientCard
                    key={match.id}
                    match={match}
                    isExact={false}
                    onSelect={() => onSelectExistingPatient(match.mrn)}
                  />
                ))}
              </div>
            )}

            {/* Warning for exact match */}
            {isExactIdMatch && (
              <Alert variant="destructive" className="mt-2">
                <XCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Duplicate registration is blocked. Check-in the existing patient or use a different ID.
                </AlertDescription>
              </Alert>
            )}

            {/* Info for partial match */}
            {!isExactIdMatch && (
              <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <UserPlus className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>
                    If this is a <strong>different person</strong>, you can proceed with the new registration.
                  </p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <Separator />

        {/* Footer */}
        <div className="px-4 py-3 sm:px-6 shrink-0 bg-muted/30">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            {!isExactIdMatch && (
              <Button
                variant="outline"
                size="sm"
                onClick={onContinueAsNew}
                disabled={isLoading}
              >
                <UserPlus className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Continue as New Patient</span>
                <span className="sm:hidden">New Patient</span>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
