/**
 * SHA Verification Modal
 *
 * A modal dialog with two separate functions:
 * 1. Client Registry (CR) Lookup - Find patient demographics from national CR
 * 2. SHA Eligibility Check - Verify if someone has active SHA coverage
 *
 * These are independent operations:
 * - CR lookup finds the person in Kenya's national database
 * - Eligibility check verifies SHA insurance coverage status
 */
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  UserCheck,
  ShieldCheck,
  ShieldOff,
  Info,
  Database,
  ShieldQuestionMark,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import type {
  ClientRegistryClient,
  DirectEligibilityCheckResponse,
} from '@/lib/types/sha';

// -----------------------------------------------------------------------------
// Responsive helpers
// -----------------------------------------------------------------------------

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQueryList = window.matchMedia(query);
    const update = () => setMatches(mediaQueryList.matches);
    update();

    // Safari < 14 fallback
    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', update);
      return () => mediaQueryList.removeEventListener('change', update);
    }

    mediaQueryList.addListener(update);
    return () => mediaQueryList.removeListener(update);
  }, [query]);

  return matches;
}

// ============================================================================
// Types
// ============================================================================

interface SHAVerificationModalProps {
  /** Trigger element (button, etc.) */
  trigger?: React.ReactNode;
  /** Default national ID to pre-fill */
  defaultNationalId?: string;
  /** Default tab to open ('eligibility' or 'cr') */
  defaultTab?: 'eligibility' | 'cr';
  /** Callback when CR client is found */
  onClientFound?: (client: ClientRegistryClient) => void;
  /** Callback when eligibility is verified */
  onEligibilityVerified?: (eligibility: DirectEligibilityCheckResponse) => void;
  /** Whether modal is open (controlled) */
  open?: boolean;
  /** Callback when modal open state changes */
  onOpenChange?: (open: boolean) => void;
}

type LookupStatus = 'idle' | 'loading' | 'success' | 'not_found' | 'error';

// ============================================================================
// Client Registry Tab Content
// ============================================================================

interface CRLookupTabProps {
  defaultNationalId?: string;
  onClientFound?: (client: ClientRegistryClient) => void;
}

function CRLookupTab({ defaultNationalId, onClientFound }: CRLookupTabProps) {
  const [nationalId, setNationalId] = useState(defaultNationalId || '');
  const [status, setStatus] = useState<LookupStatus>('idle');
  const [client, setClient] = useState<ClientRegistryClient | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();

  const handleLookup = useCallback(async () => {
    if (!nationalId || nationalId.trim().length < 5) {
      setErrorMessage('Please enter a valid National ID (at least 5 characters)');
      return;
    }

    setStatus('loading');
    setClient(null);
    setErrorMessage(undefined);

    try {
      const response = await shaApi.fetchFromClientRegistry({
        identification_type: 'National ID',
        identification_number: nationalId.trim(),
      });

      if (response.found && response.client) {
        setClient(response.client);
        setStatus('success');
        onClientFound?.(response.client);
      } else {
        setStatus('not_found');
      }
    } catch (error) {
      console.error('CR lookup failed:', error);
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to connect to Client Registry'
      );
      setStatus('error');
    }
  }, [nationalId, onClientFound]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLookup();
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cr-national-id">National ID Number</Label>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            id="cr-national-id"
            value={nationalId}
            onChange={(e) => setNationalId(e.target.value)}
            placeholder="Enter National ID"
            onKeyDown={handleKeyDown}
            className={cn(
              'flex-1',
              status === 'success' && 'border-primary',
              status === 'error' && 'border-destructive'
            )}
          />
          <Button
            onClick={handleLookup}
            disabled={status === 'loading' || !nationalId.trim()}
            className="w-full sm:w-auto"
          >
            {status === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span className="ml-2">Search</span>
          </Button>
        </div>
      </div>

      {/* Status Messages */}
      {status === 'not_found' && (
        <Alert className="border-warning bg-warning/10">
          <Info className="h-4 w-4 text-warning-foreground" />
          <AlertTitle>Not Found in Client Registry</AlertTitle>
          <AlertDescription>
            This National ID was not found in Kenya&apos;s Client Registry.
            You can still register the patient manually.
          </AlertDescription>
        </Alert>
      )}

      {status === 'error' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Lookup Failed</AlertTitle>
          <AlertDescription>
            {errorMessage || 'Unable to connect to Client Registry'}
          </AlertDescription>
        </Alert>
      )}

      {/* Client Details */}
      {status === 'success' && client && (
        <Card className="border-success bg-success/10">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <UserCheck className="h-5 w-5 text-success" />
              <h4 className="font-semibold text-success">
                Client Found
              </h4>
              <Badge variant="outline" className="ml-auto text-success border-success">
                {client.client_number}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm">
              <div className="min-w-0">
                <Label className="text-muted-foreground text-xs">Full Name</Label>
                <p className="font-medium break-words">
                  {client.first_name} {client.middle_name && `${client.middle_name} `}
                  {client.last_name}
                </p>
              </div>
              <div className="min-w-0">
                <Label className="text-muted-foreground text-xs">Date of Birth</Label>
                <p className="font-medium break-words">{client.date_of_birth}</p>
              </div>
              <div className="min-w-0">
                <Label className="text-muted-foreground text-xs">Gender</Label>
                <p className="font-medium break-words">
                  {client.gender === 'M' ? 'Male' : client.gender === 'F' ? 'Female' : 'Other'}
                </p>
              </div>
              {client.phone_number && (
                <div className="min-w-0">
                  <Label className="text-muted-foreground text-xs">Phone</Label>
                  <p className="font-medium break-words">{client.phone_number}</p>
                </div>
              )}
              {client.county && (
                <div className="min-w-0">
                  <Label className="text-muted-foreground text-xs">County</Label>
                  <p className="font-medium break-words">{client.county}</p>
                </div>
              )}
              {client.sub_county && (
                <div className="min-w-0">
                  <Label className="text-muted-foreground text-xs">Sub-County</Label>
                  <p className="font-medium break-words">{client.sub_county}</p>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t">
              <Button
                variant="default"
                size="sm"
                onClick={() => onClientFound?.(client)}
                className="w-full"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Use This Information
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Eligibility Check Tab Content
// ============================================================================

interface EligibilityCheckTabProps {
  defaultNationalId?: string;
  onEligibilityVerified?: (eligibility: DirectEligibilityCheckResponse) => void;
}

function EligibilityCheckTab({ defaultNationalId, onEligibilityVerified }: EligibilityCheckTabProps) {
  const [nationalId, setNationalId] = useState(defaultNationalId || '');
  const [status, setStatus] = useState<LookupStatus>('idle');
  const [eligibility, setEligibility] = useState<DirectEligibilityCheckResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();

  const handleCheck = useCallback(async () => {
    if (!nationalId || nationalId.trim().length < 5) {
      setErrorMessage('Please enter a valid National ID (at least 5 characters)');
      return;
    }

    setStatus('loading');
    setEligibility(null);
    setErrorMessage(undefined);

    try {
      const response = await shaApi.checkDirectEligibility({
        national_id: nationalId.trim(),
      });

      setEligibility(response);

      if (response.error) {
        setStatus('error');
        setErrorMessage(response.error);
      } else {
        setStatus('success');
        onEligibilityVerified?.(response);
      }
    } catch (error) {
      console.error('Eligibility check failed:', error);
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to verify eligibility'
      );
      setStatus('error');
    }
  }, [nationalId, onEligibilityVerified]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCheck();
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="elig-national-id">National ID Number</Label>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            id="elig-national-id"
            value={nationalId}
            onChange={(e) => setNationalId(e.target.value)}
            placeholder="Enter National ID"
            onKeyDown={handleKeyDown}
            className={cn(
              'flex-1',
              status === 'success' && eligibility?.is_eligible && 'border-success',
              status === 'success' && !eligibility?.is_eligible && 'border-warning',
              status === 'error' && 'border-destructive'
            )}
          />
          <Button
            onClick={handleCheck}
            disabled={status === 'loading' || !nationalId.trim()}
            className="w-full sm:w-auto"
          >
            {status === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldQuestionMark className="h-4 w-4" />
            )}
            <span className="ml-2">Verify</span>
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {status === 'error' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Verification Failed</AlertTitle>
          <AlertDescription>
            {errorMessage || 'Unable to verify eligibility'}
          </AlertDescription>
        </Alert>
      )}

      {/* Eligibility Result */}
      {status === 'success' && eligibility && (
        <Card className={cn(
          eligibility.is_eligible
            ? 'border-success bg-success/10'
            : 'border-warning bg-warning/10'
        )}>
          <CardContent className="pt-4">
            {eligibility.is_eligible ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="h-6 w-6 text-success" />
                  <div>
                    <h4 className="font-semibold text-success text-lg">
                      SHA ELIGIBLE
                    </h4>
                    <p className="text-sm text-success/80">
                      {eligibility.reason || 'This individual has active SHA coverage'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm mt-4">
                  {eligibility.full_name && (
                    <div className="min-w-0">
                      <Label className="text-muted-foreground text-xs">Name</Label>
                      <p className="font-medium break-words">{eligibility.full_name}</p>
                    </div>
                  )}
                  {eligibility.sha_number && (
                    <div className="min-w-0">
                      <Label className="text-muted-foreground text-xs">SHA Number</Label>
                      <p className="font-medium break-words">{eligibility.sha_number}</p>
                    </div>
                  )}
                  {eligibility.coverage_end_date && (
                    <div className="min-w-0">
                      <Label className="text-muted-foreground text-xs">Coverage Until</Label>
                      <p className="font-medium break-words">{eligibility.coverage_end_date}</p>
                    </div>
                  )}
                  <div className="min-w-0">
                    <Label className="text-muted-foreground text-xs">Copay</Label>
                    <div className="font-medium">
                      {eligibility.copay_percentage === 0 ? (
                        <Badge className="bg-success text-success-foreground">Full Coverage</Badge>
                      ) : (
                        <span>{eligibility.copay_percentage}%</span>
                      )}
                    </div>
                  </div>
                  {eligibility.is_employed !== undefined && (
                    <div className="min-w-0">
                      <Label className="text-muted-foreground text-xs">Employment</Label>
                      <p className="font-medium break-words">
                        {eligibility.is_employed ? 'Employed' : 'Not Employed'}
                      </p>
                    </div>
                  )}
                  {eligibility.employer_name && (
                    <div className="min-w-0">
                      <Label className="text-muted-foreground text-xs">Employer</Label>
                      <p className="font-medium break-words">{eligibility.employer_name}</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => onEligibilityVerified?.(eligibility)}
                    className="w-full"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Confirm Eligibility
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <ShieldOff className="h-6 w-6 text-warning-foreground" />
                  <div>
                    <h4 className="font-semibold text-warning-foreground text-lg">
                      NOT SHA ELIGIBLE
                    </h4>
                    <p className="text-sm text-warning-foreground/80">
                      {eligibility.reason || 'This individual does not have active SHA coverage'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm mt-4">
                  {eligibility.full_name && (
                    <div className="min-w-0">
                      <Label className="text-muted-foreground text-xs">Name</Label>
                      <p className="font-medium break-words">{eligibility.full_name}</p>
                    </div>
                  )}
                  {eligibility.sha_number && (
                    <div className="min-w-0">
                      <Label className="text-muted-foreground text-xs">SHA Number</Label>
                      <p className="font-medium break-words">{eligibility.sha_number}</p>
                    </div>
                  )}
                  {eligibility.is_employed !== undefined && (
                    <div className="min-w-0">
                      <Label className="text-muted-foreground text-xs">Employment Status</Label>
                      <p className="font-medium break-words">
                        {eligibility.is_employed ? 'Employed' : 'Not Employed'}
                        {eligibility.employment_type && eligibility.employment_type !== 'Unspecified' && (
                          <span className="text-muted-foreground"> ({eligibility.employment_type})</span>
                        )}
                      </p>
                    </div>
                  )}
                  {eligibility.employer_name && (
                    <div className="min-w-0">
                      <Label className="text-muted-foreground text-xs">Employer</Label>
                      <p className="font-medium break-words">{eligibility.employer_name}</p>
                    </div>
                  )}
                </div>

                {eligibility.nhif_transition_status && (
                  <div className="text-sm mt-3">
                    <Label className="text-muted-foreground text-xs">NHIF Transition Status</Label>
                    <p className="font-medium text-warning-foreground">{eligibility.nhif_transition_status}</p>
                  </div>
                )}

                {/* Means Testing Details */}
                {eligibility.means_testing && eligibility.means_testing.means_testing_done === 1 && (
                  <div className="mt-4 p-3 rounded-lg bg-muted/50 border">
                    <Label className="text-muted-foreground text-xs font-semibold block mb-2">Means Testing Details</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div className="min-w-0">
                        <span className="text-muted-foreground text-xs">Monthly Contribution:</span>
                        <p className="font-medium">KES {eligibility.means_testing.monthly_contribution?.toLocaleString()}</p>
                      </div>
                      <div className="min-w-0">
                        <span className="text-muted-foreground text-xs">Annual Contribution:</span>
                        <p className="font-medium">KES {eligibility.means_testing.annual_contribution?.toLocaleString()}</p>
                      </div>
                      {eligibility.means_testing.income_prediction_category && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground text-xs">Income Category:</span>
                          <p className="font-medium break-words">{eligibility.means_testing.income_prediction_category}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Possible Solution */}
                {eligibility.possible_solution && (
                  <Alert className="mt-4 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50">
                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <AlertTitle className="text-blue-800 dark:text-blue-300 text-sm">How to Resolve</AlertTitle>
                    <AlertDescription className="text-sm text-blue-700 dark:text-blue-400">
                      {eligibility.possible_solution}
                    </AlertDescription>
                  </Alert>
                )}

                <Alert className="mt-4 border-warning bg-warning/10">
                  <Info className="h-4 w-4 text-warning-foreground" />
                  <AlertDescription className="text-sm">
                    Patient will need to pay cash or use other payment methods.
                  </AlertDescription>
                </Alert>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Main Modal Component
// ============================================================================

export function SHAVerificationModal({
  trigger,
  defaultNationalId,
  defaultTab = 'eligibility',
  onClientFound,
  onEligibilityVerified,
  open,
  onOpenChange,
}: SHAVerificationModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const isMobile = useMediaQuery('(max-width: 640px)');

  // Always use fullscreen layout on small screens.
  const effectiveExpanded = isMobile ? true : isExpanded;
  const useFullScreenLayout = effectiveExpanded;

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? onOpenChange! : setInternalOpen;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) setIsExpanded(false); // Reset expanded state when closing
      setIsOpen(open);
    }}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent className={cn(
        "transition-all duration-200 overflow-hidden",
        useFullScreenLayout
          ? "!max-w-[95vw] !w-[95vw] !h-[95vh] !max-h-[95vh] p-0"
          : "max-w-md w-auto"
      )}>
        {useFullScreenLayout ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="relative border-b px-4 py-3">
              {!isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-4 top-3 h-8 w-8"
                  onClick={() => setIsExpanded(!isExpanded)}
                  title={effectiveExpanded ? 'Minimize' : 'Expand to fullscreen'}
                >
                  {effectiveExpanded ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              )}

              <DialogHeader className={cn('text-left pr-10', !isMobile && 'pl-10')}>
                <DialogTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" />
                  Kenya Digital Health Verification
                </DialogTitle>
                <DialogDescription>
                  Lookup patient records from Client Registry or verify SHA insurance eligibility
                </DialogDescription>
              </DialogHeader>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4">
                <Tabs defaultValue={defaultTab}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="cr" className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      Client Registry
                    </TabsTrigger>
                    <TabsTrigger value="eligibility" className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      SHA Eligibility
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="cr" className="mt-4">
                    <div className="mb-4 p-3 bg-muted rounded-lg text-xs sm:text-sm leading-relaxed">
                      <p className="text-muted-foreground">
                        <strong>Client Registry</strong> lookup retrieves patient demographic information
                        from Kenya&apos;s national database to auto-fill registration details.
                      </p>
                    </div>
                    <CRLookupTab
                      defaultNationalId={defaultNationalId}
                      onClientFound={(client) => {
                        onClientFound?.(client);
                      }}
                    />
                  </TabsContent>

                  <TabsContent value="eligibility" className="mt-4">
                    <div className="mb-4 p-3 bg-muted rounded-lg text-xs sm:text-sm leading-relaxed">
                      <p className="text-muted-foreground">
                        <strong>SHA Eligibility</strong> verifies if a person has active Social Health Authority
                        insurance coverage and determines their copay percentage.
                      </p>
                    </div>
                    <EligibilityCheckTab
                      defaultNationalId={defaultNationalId}
                      onEligibilityVerified={(elig) => {
                        onEligibilityVerified?.(elig);
                      }}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </ScrollArea>
          </div>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-4 h-7 w-7 z-10"
              onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? 'Minimize' : 'Expand to fullscreen'}
            >
              {isExpanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            <DialogHeader className="pl-8">
              <DialogTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                Kenya Digital Health Verification
              </DialogTitle>
              <DialogDescription>
                Lookup patient records from Client Registry or verify SHA insurance eligibility
              </DialogDescription>
            </DialogHeader>

            <div className="overflow-y-auto max-h-[70vh]">
              <Tabs defaultValue={defaultTab} className="mt-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="cr" className="flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Client Registry
                  </TabsTrigger>
                  <TabsTrigger value="eligibility" className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    SHA Eligibility
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="cr" className="mt-4">
                  <div className="mb-4 p-3 bg-muted rounded-lg text-xs sm:text-sm leading-relaxed">
                    <p className="text-muted-foreground">
                      <strong>Client Registry</strong> lookup retrieves patient demographic information
                      from Kenya&apos;s national database to auto-fill registration details.
                    </p>
                  </div>
                  <CRLookupTab
                    defaultNationalId={defaultNationalId}
                    onClientFound={(client) => {
                      onClientFound?.(client);
                    }}
                  />
                </TabsContent>

                <TabsContent value="eligibility" className="mt-4">
                  <div className="mb-4 p-3 bg-muted rounded-lg text-xs sm:text-sm leading-relaxed">
                    <p className="text-muted-foreground">
                      <strong>SHA Eligibility</strong> verifies if a person has active Social Health Authority
                      insurance coverage and determines their copay percentage.
                    </p>
                  </div>
                  <EligibilityCheckTab
                    defaultNationalId={defaultNationalId}
                    onEligibilityVerified={(elig) => {
                      onEligibilityVerified?.(elig);
                    }}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default SHAVerificationModal;
