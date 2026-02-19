/**
 * Duplicate Patient Modal
 *
 * A workflow clarification modal that appears when the system detects
 * a potential duplicate patient during registration.
 *
 * This modal helps users decide:
 * - Whether to use an existing patient record (check-in)
 * - Or confirm this is genuinely a new patient
 */
'use client';

import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  AlertTriangle,
  User,
  UserCheck,
  UserPlus,
  ExternalLink,
  Calendar,
  MapPin,
  X,
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
import { cn } from '@/lib/utils';
import type { DuplicateMatch, DuplicateCheckResult } from '@/lib/types/patient';

interface DuplicatePatientModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal open state changes */
  onOpenChange: (open: boolean) => void;
  /** Duplicate check result containing matches */
  result: DuplicateCheckResult | null;
  /** Callback when user selects to check-in existing patient */
  onSelectExistingPatient: (patientId: number) => void;
  /** Callback when user confirms to continue with new registration */
  onContinueAsNew: () => void;
  /** Whether the continue button is loading */
  isLoading?: boolean;
}

function PatientCard({
  match,
  isPrimary,
  onSelect,
  onView,
}: {
  match: DuplicateMatch;
  isPrimary: boolean;
  onSelect: () => void;
  onView: () => void;
}) {
  return (
    <Card className={cn(
      'transition-all',
      isPrimary ? 'border-primary shadow-sm' : 'hover:border-muted-foreground/30'
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            'h-12 w-12 rounded-full flex items-center justify-center shrink-0',
            isPrimary ? 'bg-primary/10' : 'bg-muted'
          )}>
            <User className={cn(
              'h-6 w-6',
              isPrimary ? 'text-primary' : 'text-muted-foreground'
            )} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h4 className="font-semibold">{match.full_name}</h4>
              <Badge
                variant={match.match_confidence >= 95 ? 'default' : 'secondary'}
                className="text-xs"
              >
                {match.match_confidence}% match
              </Badge>
              {isPrimary && (
                <Badge variant="outline" className="text-xs">
                  Best Match
                </Badge>
              )}
            </div>

            <div className="space-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                  {match.mrn}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>{format(new Date(match.date_of_birth), 'MMMM d, yyyy')}</span>
                <span className="mx-1">•</span>
                <span>{match.gender === 'M' ? 'Male' : match.gender === 'F' ? 'Female' : 'Other'}</span>
              </div>
              <p className="text-xs italic">{match.match_reason}</p>
            </div>

            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={onSelect}>
                <UserCheck className="h-4 w-4 mr-1.5" />
                Check-in This Patient
              </Button>
              <Button size="sm" variant="outline" onClick={onView}>
                <ExternalLink className="h-4 w-4 mr-1.5" />
                View
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
}: DuplicatePatientModalProps) {
  const router = useRouter();

  if (!result || !result.has_duplicate || result.matches.length === 0) {
    return null;
  }

  const isExactIdMatch = result.match_type === 'exact_id';
  const matches = result.matches;

  const handleViewPatient = (patientId: number) => {
    window.open(`/patients/${patientId}`, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-2">
            <div className={cn(
              'h-10 w-10 rounded-full flex items-center justify-center',
              isExactIdMatch ? 'bg-destructive/10' : 'bg-warning/10'
            )}>
              <AlertTriangle className={cn(
                'h-5 w-5',
                isExactIdMatch ? 'text-destructive' : 'text-warning'
              )} />
            </div>
            <div>
              <DialogTitle>
                {isExactIdMatch ? 'Patient Already Exists' : 'Possible Duplicate Found'}
              </DialogTitle>
              <DialogDescription>
                {isExactIdMatch
                  ? 'A patient with this ID is already registered.'
                  : 'Did you mean to find an existing patient?'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full max-h-[50vh] pr-4">
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                We found {matches.length} patient{matches.length > 1 ? 's' : ''} matching your search:
              </p>

              {matches.map((match, index) => (
                <PatientCard
                  key={match.id}
                  match={match}
                  isPrimary={index === 0}
                  onSelect={() => onSelectExistingPatient(match.id)}
                  onView={() => handleViewPatient(match.id)}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        <Separator className="my-4" />

        {/* Footer actions */}
        <div className="shrink-0 space-y-3">
          {!isExactIdMatch && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <UserPlus className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  If this is a <strong>different person</strong> with similar details,
                  you can continue with the new registration.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            {!isExactIdMatch && (
              <Button
                variant="outline"
                onClick={onContinueAsNew}
                disabled={isLoading}
              >
                <UserPlus className="h-4 w-4 mr-1.5" />
                Continue as New Patient
              </Button>
            )}
          </div>

          {isExactIdMatch && (
            <p className="text-xs text-center text-destructive">
              You cannot register a new patient with this identification number.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
