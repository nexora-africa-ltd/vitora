/**
 * Duplicate Patient Alert Component
 *
 * Displays when potential duplicate patients are found during registration.
 * Shows matching patients with confidence scores and allows user to:
 * - View/select existing patient (redirect to check-in)
 * - Continue with new patient registration
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  AlertTriangle,
  User,
  ExternalLink,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Shield,
  Calendar,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { DuplicateMatch } from '@/lib/types/patient';

interface DuplicatePatientAlertProps {
  /** List of matching patients */
  matches: DuplicateMatch[];
  /** Type of match found */
  matchType: 'exact_id' | 'demographic' | 'partial' | null;
  /** Callback when user selects existing patient */
  onSelectPatient?: (patientId: number) => void;
  /** Callback when user confirms to continue with new registration */
  onContinueAsNew?: () => void;
  /** Whether the "Continue as New" option is visible */
  showContinueOption?: boolean;
  /** Custom class name */
  className?: string;
}

function getMatchBadgeVariant(confidence: number): 'destructive' | 'default' | 'secondary' {
  if (confidence >= 95) return 'destructive';
  if (confidence >= 80) return 'default';
  return 'secondary';
}

function MatchConfidenceBadge({ confidence }: { confidence: number }) {
  const variant = getMatchBadgeVariant(confidence);
  return (
    <Badge variant={variant} className="shrink-0">
      {confidence}% match
    </Badge>
  );
}

function PatientMatchCard({
  match,
  isExactMatch,
  onSelect,
}: {
  match: DuplicateMatch;
  isExactMatch: boolean;
  onSelect: () => void;
}) {
  return (
    <Card className={cn(
      'transition-colors',
      isExactMatch ? 'border-destructive/50 bg-destructive/5' : 'hover:bg-muted/50'
    )}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Patient Info */}
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn(
              'h-10 w-10 rounded-full flex items-center justify-center shrink-0',
              isExactMatch ? 'bg-destructive/10' : 'bg-primary/10'
            )}>
              <User className={cn(
                'h-5 w-5',
                isExactMatch ? 'text-destructive' : 'text-primary'
              )} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold truncate">{match.full_name}</span>
                <MatchConfidenceBadge confidence={match.match_confidence} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground mt-1">
                <span className="font-mono text-xs">{match.mrn}</span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {format(new Date(match.date_of_birth), 'MMM d, yyyy')}
                </span>
                <span>
                  {match.gender === 'M' ? 'Male' : match.gender === 'F' ? 'Female' : 'Other'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {match.match_reason}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 sm:flex-col sm:items-end">
            <Button
              variant={isExactMatch ? 'default' : 'outline'}
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={onSelect}
            >
              <UserCheck className="h-4 w-4 mr-1.5" />
              <span className="sm:hidden">Select</span>
              <span className="hidden sm:inline">Check-in</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 sm:flex-none"
              asChild
            >
              <Link href={`/patients/${match.id}`} target="_blank">
                <ExternalLink className="h-4 w-4 mr-1.5" />
                <span className="sm:hidden">View</span>
                <span className="hidden sm:inline">View Record</span>
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DuplicatePatientAlert({
  matches,
  matchType,
  onSelectPatient,
  onContinueAsNew,
  showContinueOption = true,
  className,
}: DuplicatePatientAlertProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const primaryMatch = matches?.[0];

  if (!matches || matches.length === 0 || !primaryMatch) {
    return null;
  }

  const isExactIdMatch = matchType === 'exact_id';
  const additionalMatches = matches.slice(1);

  return (
    <Alert
      variant={isExactIdMatch ? 'destructive' : 'default'}
      className={cn('relative', className)}
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        {isExactIdMatch ? 'Patient Already Exists' : 'Potential Duplicate Found'}
      </AlertTitle>
      <AlertDescription className="mt-3 space-y-4">
        <p className="text-sm">
          {isExactIdMatch
            ? 'A patient with this identification number is already registered in the system.'
            : `We found ${matches.length} patient${matches.length > 1 ? 's' : ''} with similar information.`}
        </p>

        {/* Primary Match */}
        <PatientMatchCard
          match={primaryMatch}
          isExactMatch={isExactIdMatch}
          onSelect={() => onSelectPatient?.(primaryMatch.id)}
        />

        {/* Additional Matches (collapsible) */}
        {additionalMatches.length > 0 && (
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full">
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-1.5" />
                    Hide {additionalMatches.length} more match{additionalMatches.length > 1 ? 'es' : ''}
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-1.5" />
                    Show {additionalMatches.length} more match{additionalMatches.length > 1 ? 'es' : ''}
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2">
              {additionalMatches.map((match) => (
                <PatientMatchCard
                  key={match.id}
                  match={match}
                  isExactMatch={false}
                  onSelect={() => onSelectPatient?.(match.id)}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Continue as New Option */}
        {showContinueOption && !isExactIdMatch && (
          <div className="pt-3 border-t">
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">
                  If this is a <strong>different person</strong> with the same name/DOB,
                  you can continue with the registration.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={onContinueAsNew}
                >
                  Continue as Different Person
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Exact ID match - block registration */}
        {isExactIdMatch && (
          <div className="pt-3 border-t">
            <p className="text-sm text-destructive">
              You cannot register a new patient with this identification number.
              Please select the existing patient above or use a different ID.
            </p>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
