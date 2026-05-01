/**
 * SHA Consent Step
 *
 * Inline OTP consent flow shown after check-in for SHA-eligible patients.
 * Can be skipped (consent deferred to billing/claims time).
 *
 * Flow:
 * 1. Auto-checks if patient has an SHAMember record
 * 2. If eligible → shows "Obtain Consent" OTP wizard inline
 * 3. User can skip → consent will be obtained later at billing
 * 4. On success → links consent token to the encounter created at check-in
 */
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  CheckCircle2,
  Loader2,
  Send,
  KeyRound,
  ShieldCheck,
  SkipForward,
  ChevronsUpDown,
  Search,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import { getApiErrorMessage } from '@/lib/api/client';
import { useSendConsentOTP, useStartVisit } from '@/lib/hooks/use-sha';
import { useDebounce } from '@/lib/hooks';
import { useFacility } from '@/lib/context/facility-context';
import { OtpWhitelistRequestSheet } from './otp-whitelist-request-sheet';
import type { SHAMember } from '@/lib/types/sha';

// ============================================================================
// Types
// ============================================================================

interface SHAConsentStepProps {
  /** Patient ID to look up SHA membership */
  patientId: number;
  /** Encounter ID created during check-in (to link consent) */
  encounterId?: number | null;
  /** Called when consent is obtained or skipped */
  onComplete?: (result: { consented: boolean; consentId?: number }) => void;
  /** Whether to auto-check on mount */
  autoCheck?: boolean;
  /** Custom className */
  className?: string;
}

type StepState =
  | 'checking'         // Looking up SHA member
  | 'not_eligible'     // No SHA coverage — skip
  | 'ready'            // SHA eligible, ready to send OTP
  | 'otp_sent'         // OTP sent, waiting for code
  | 'validating'       // Validating OTP
  | 'done'             // Consent obtained
  | 'skipped';         // User chose to skip

interface InterventionOption {
  code: string;
  name: string;
  category?: string;
  price?: number;
}

/** Known SHA benefit packages — shown as defaults when terminology API is unreachable. */
const SHA_BENEFIT_PACKAGES: InterventionOption[] = [
  { code: 'SHA-12-001', name: 'Outpatient Consultation', category: 'Outpatient' },
  { code: 'SHA-12-002', name: 'Outpatient Specialized Consultation', category: 'Outpatient' },
  { code: 'SHA-07-001', name: 'Inpatient Admission (General Ward)', category: 'Inpatient' },
  { code: 'SHA-01-001', name: 'Ambulance Services (Intra-metro)', category: 'Emergency' },
  { code: 'SHA-08-001', name: 'Antenatal Care Visit', category: 'Maternity' },
  { code: 'SHA-19-001', name: 'Minor Surgical Procedure', category: 'Surgical' },
  { code: 'SHA-09-001', name: 'Medical Imaging (X-Ray)', category: 'Diagnostics' },
  { code: 'SHA-05-001', name: 'Optical Consultation', category: 'Outpatient' },
  { code: 'SHA-10-001', name: 'Mental Health Consultation', category: 'Outpatient' },
  { code: 'SHA-16-001', name: 'Renal Dialysis Session', category: 'Specialized' },
];

/**
 * SHA facility level restrictions:
 * - Level 2/3: Basic outpatient, maternity (SHA-12-001, SHA-08-001)
 * - Level 4+: Inpatient, specialized, surgical, diagnostics
 * - Level 5/6: All interventions including renal, complex surgical
 *
 * Level 4B specifically cannot provide SHA-12-xxx (Outpatient) interventions
 * under SHA rules — they handle inpatient, surgical, specialized services.
 */
const FACILITY_LEVEL_ALLOWED_PREFIXES: Record<string, string[]> = {
  '1': ['SHA-12'],                                               // Dispensaries: basic outpatient only
  '2': ['SHA-12', 'SHA-08', 'SHA-05', 'SHA-10'],                 // Health centres: outpatient + maternity + optical + mental
  '3': ['SHA-12', 'SHA-08', 'SHA-05', 'SHA-10', 'SHA-09'],       // Sub-county hospitals: + imaging
  '4': ['SHA-07', 'SHA-01', 'SHA-08', 'SHA-19', 'SHA-09', 'SHA-10', 'SHA-16'], // County/Level 4: inpatient, emergency, surgical, diagnostics
  '5': ['SHA-07', 'SHA-01', 'SHA-08', 'SHA-19', 'SHA-09', 'SHA-10', 'SHA-16', 'SHA-12', 'SHA-05'], // Referral hospitals: all
  '6': ['SHA-07', 'SHA-01', 'SHA-08', 'SHA-19', 'SHA-09', 'SHA-10', 'SHA-16', 'SHA-12', 'SHA-05'], // National referral: all
};

/** Filter interventions by facility level */
function filterByFacilityLevel(interventions: InterventionOption[], level: string | undefined): InterventionOption[] {
  if (!level) return interventions; // No level info — show all
  // Normalize: "4B" → "4", "3A" → "3"
  const numericLevel = level.replace(/[^0-9]/g, '');
  const allowed = FACILITY_LEVEL_ALLOWED_PREFIXES[numericLevel];
  if (!allowed) return interventions; // Unknown level — show all
  return interventions.filter((i) => allowed.some((prefix) => i.code.startsWith(prefix)));
}

/**
 * Extract a human-readable error message from DHA API errors.
 * DHA errors have nested structures like:
 * { error: "DHA API error (400): failed to start visit for patient: {\"Edi Error\":{\"error\":\"...\"}}" }
 */
function extractDHAError(err: unknown): string {
  const raw = getApiErrorMessage(err);

  // Try to extract the inner "Edi Error" message from DHA
  const ediMatch = raw.match(/["']?Edi Error["']?\s*:\s*\{[^}]*["']?error["']?\s*:\s*["']([^"']+)["']/);
  if (ediMatch?.[1]) {
    return ediMatch[1];
  }

  // Try to extract message after "failed to start visit for patient:"
  const visitMatch = raw.match(/failed to start visit for patient:\s*(.+)/);
  if (visitMatch?.[1]) {
    try {
      const parsed = JSON.parse(visitMatch[1]);
      if (parsed?.['Edi Error']?.error) return String(parsed['Edi Error'].error);
    } catch {
      // Not JSON — return as-is
    }
    return visitMatch[1];
  }

  // Strip "DHA API error (400): " prefix for cleaner display
  const cleaned = raw.replace(/^DHA API error \(\d+\):\s*/i, '');
  return cleaned || raw;
}

// ============================================================================
// Component
// ============================================================================

export function SHAConsentStep({
  patientId,
  encounterId,
  onComplete,
  autoCheck = true,
  className,
}: SHAConsentStepProps) {
  const [step, setStep] = useState<StepState>('checking');
  const [shaMember, setSHAMember] = useState<SHAMember | null>(null);
  const [eligibilityInfo, setEligibilityInfo] = useState<{
    verifiedName?: string;
    coverageEndDate?: string;
  } | null>(null);
  const [consentId, setConsentId] = useState<number | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCreatingMember, setIsCreatingMember] = useState(false);

  // Intervention combobox state
  const [selectedIntervention, setSelectedIntervention] = useState<InterventionOption | null>(null);
  const [interventionOpen, setInterventionOpen] = useState(false);
  const [interventionSearch, setInterventionSearch] = useState('');
  const debouncedInterventionSearch = useDebounce(interventionSearch, 300);
  const [interventionResults, setInterventionResults] = useState<InterventionOption[]>([]);
  const [interventionLoading, setInterventionLoading] = useState(false);
  const useLocalFallbackRef = useRef(false);

  // OTP resend countdown (seconds)
  const [resendCountdown, setResendCountdown] = useState(0);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Whitelist request sheet
  const [whitelistOpen, setWhitelistOpen] = useState(false);

  const sendOTP = useSendConsentOTP();
  const startVisit = useStartVisit();
  const { facilityDetail } = useFacility();
  const facilityLevel = facilityDetail?.level;
  const hasCheckedRef = useRef(false);

  // Check SHA eligibility on mount
  const checkEligibility = useCallback(async () => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;
    setStep('checking');
    try {
      const result = await shaApi.checkPatientEligibility(patientId);
      if (result.is_eligible && result.member) {
        setSHAMember(result.member);
        setEligibilityInfo({
          verifiedName: result.verified_name,
          coverageEndDate: result.coverage_end_date,
        });
        setStep('ready');
      } else if (result.is_eligible) {
        // Eligible via direct DHA check but no local SHAMember record yet.
        // Still show OTP button — we'll create the member on-demand when user clicks Send OTP.
        setEligibilityInfo({
          verifiedName: result.verified_name,
          coverageEndDate: result.coverage_end_date,
        });
        setStep('ready');
      } else {
        setStep('not_eligible');
        onComplete?.({ consented: false });
      }
    } catch {
      // If eligibility check fails, don't block the flow
      setStep('not_eligible');
      onComplete?.({ consented: false });
    }
  }, [patientId, onComplete]);

  useEffect(() => {
    if (autoCheck) {
      checkEligibility();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  // Cleanup countdown interval on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Filter packages by facility level
  const allowedPackages = useMemo(
    () => filterByFacilityLevel(SHA_BENEFIT_PACKAGES, facilityLevel),
    [facilityLevel]
  );

  // Search interventions when combobox query changes
  useEffect(() => {
    // When using local fallback, filter the static list client-side
    if (useLocalFallbackRef.current) {
      if (debouncedInterventionSearch.length < 1) {
        setInterventionResults(allowedPackages);
      } else {
        const q = debouncedInterventionSearch.toLowerCase();
        setInterventionResults(
          allowedPackages.filter(
            (i) => i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)
          )
        );
      }
      return;
    }

    // Try live API search
    if (debouncedInterventionSearch.length < 2) {
      setInterventionResults([]);
      return;
    }
    let cancelled = false;
    setInterventionLoading(true);
    shaApi
      .searchInterventionCodes(debouncedInterventionSearch, 20)
      .then((results) => {
        if (!cancelled) setInterventionResults(filterByFacilityLevel(results, facilityLevel));
      })
      .catch(() => {
        // API failed — switch to local fallback permanently for this session
        if (!cancelled) {
          useLocalFallbackRef.current = true;
          const q = debouncedInterventionSearch.toLowerCase();
          setInterventionResults(
            allowedPackages.filter(
              (i) => i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)
            )
          );
        }
      })
      .finally(() => {
        if (!cancelled) setInterventionLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedInterventionSearch, facilityLevel]);

  const handleSendOTP = async () => {
    setError(null);

    // If we don't have an SHAMember yet, create one on-demand
    let memberId = shaMember?.id;
    if (!memberId) {
      setIsCreatingMember(true);
      try {
        const created = await shaApi.ensureSHAMember(patientId);
        if (created) {
          setSHAMember(created);
          memberId = created.id;
        } else {
          setError('Could not create SHA member record. Try again or skip.');
          setIsCreatingMember(false);
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create SHA member record');
        setIsCreatingMember(false);
        return;
      }
      setIsCreatingMember(false);
    }

    sendOTP.mutate(
      {
        sha_member_id: memberId,
        ...(selectedIntervention ? { intervention_codes: [selectedIntervention.code] } : {}),
      },
      {
        onSuccess: (response) => {
          setConsentId(response.consent_id);
          setStep('otp_sent');
          // Start 60s resend countdown
          setResendCountdown(60);
          if (countdownRef.current) clearInterval(countdownRef.current);
          countdownRef.current = setInterval(() => {
            setResendCountdown((prev) => {
              if (prev <= 1) {
                if (countdownRef.current) clearInterval(countdownRef.current);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        },
        onError: (err: unknown) => {
          setError(extractDHAError(err) || 'Failed to send OTP');
        },
      }
    );
  };

  const handleValidateOTP = () => {
    if (!consentId || !otpCode.trim()) return;
    setError(null);
    setStep('validating');

    startVisit.mutate(
      {
        consent_id: consentId,
        otp_code: otpCode.trim(),
        ...(selectedIntervention ? { intervention_codes: [selectedIntervention.code] } : {}),
        ...(encounterId ? { encounter_id: encounterId } : {}),
      },
      {
        onSuccess: (response) => {
          setStep('done');
          setOtpCode('');
          onComplete?.({ consented: true, consentId: response.id });
        },
        onError: (err: unknown) => {
          setStep('otp_sent');
          setError(extractDHAError(err) || 'Failed to verify OTP');
        },
      }
    );
  };

  const handleSkip = () => {
    setStep('skipped');
    onComplete?.({ consented: false });
  };

  // Don't render anything if explicitly skipped
  if (step === 'skipped') {
    return null;
  }

  // Show a brief status for non-SHA patients
  if (step === 'not_eligible') {
    return (
      <div className={cn('rounded-lg border border-muted p-3', className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          <span>No active SHA coverage — patient will pay via selected payment method.</span>
        </div>
      </div>
    );
  }

  // Loading state
  if (step === 'checking') {
    return (
      <div className={cn('rounded-lg border p-4', className)}>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking SHA coverage...
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border p-4 space-y-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">SHA Visit Consent</span>
          {shaMember?.sha_member_number && (
            <Badge variant="outline" className="text-[10px]">
              {shaMember.sha_member_number}
            </Badge>
          )}
          {!shaMember && eligibilityInfo?.verifiedName && (
            <Badge variant="outline" className="text-[10px] text-green-600">
              Verified
            </Badge>
          )}
        </div>
        {step !== 'done' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="text-xs h-7"
          >
            <SkipForward className="mr-1 h-3 w-3" />
            Skip
          </Button>
        )}
      </div>

      {/* Step: Ready to send OTP */}
      {step === 'ready' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Select the visit intervention, then send a one-time password to the patient&apos;s phone.
            {eligibilityInfo?.verifiedName && (
              <span className="block mt-0.5 text-green-600 dark:text-green-400">
                Coverage verified for {eligibilityInfo.verifiedName}
                {eligibilityInfo.coverageEndDate && ` • Valid until ${eligibilityInfo.coverageEndDate}`}
              </span>
            )}
          </p>

          {/* Intervention selector */}
          <div className="space-y-1">
            <Label className="text-xs font-medium">Intervention</Label>
            <Popover open={interventionOpen} onOpenChange={(open) => {
              setInterventionOpen(open);
              // Show default packages when opening with no search text
              if (open && !interventionSearch && interventionResults.length === 0) {
                setInterventionResults(allowedPackages);
              }
            }}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={interventionOpen}
                  className={cn(
                    'w-full justify-between h-9 text-xs font-normal',
                    !selectedIntervention && 'text-muted-foreground'
                  )}
                >
                  {selectedIntervention ? (
                    <span className="truncate">
                      {selectedIntervention.code} — {selectedIntervention.name}
                    </span>
                  ) : (
                    'Select intervention...'
                  )}
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    {selectedIntervention && (
                      <X
                        className="h-3.5 w-3.5 opacity-50 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedIntervention(null);
                        }}
                      />
                    )}
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
                  </div>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" onWheel={(e) => e.stopPropagation()}>
                <Command shouldFilter={false}>
                  <div className="flex items-center border-b px-2">
                    <Search className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-50" />
                    <input
                      value={interventionSearch}
                      onChange={(e) => setInterventionSearch(e.target.value)}
                      placeholder="Search interventions..."
                      className="flex h-9 w-full bg-transparent py-2 text-xs outline-none placeholder:text-muted-foreground"
                    />
                    {interventionLoading && (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin opacity-50" />
                    )}
                  </div>
                  <CommandList className="max-h-[200px] overflow-y-auto">
                    <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                      {interventionLoading
                        ? 'Searching...'
                        : 'No interventions found'}
                    </CommandEmpty>
                    {interventionResults.length > 0 && (
                      <CommandGroup>
                        {interventionResults.map((item) => (
                          <CommandItem
                            key={item.code}
                            value={item.code}
                            onSelect={() => {
                              setSelectedIntervention(item);
                              setInterventionOpen(false);
                              setInterventionSearch('');
                            }}
                            className="text-xs"
                          >
                            <Check
                              className={cn(
                                'mr-2 h-3.5 w-3.5 shrink-0',
                                selectedIntervention?.code === item.code
                                  ? 'opacity-100'
                                  : 'opacity-0'
                              )}
                            />
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="font-medium truncate">{item.code}</span>
                              <span className="text-muted-foreground truncate">{item.name}</span>
                              {(item.category || item.price != null) && (
                                <span className="text-[10px] text-muted-foreground/70">
                                  {item.category && <>{item.category}</>}
                                  {item.category && item.price != null && ' • '}
                                  {item.price != null && <>KES {item.price.toLocaleString()}</>}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            onClick={handleSendOTP}
            disabled={sendOTP.isPending || isCreatingMember}
            size="sm"
          >
            {(sendOTP.isPending || isCreatingMember) ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-2 h-3.5 w-3.5" />
            )}
            {isCreatingMember ? 'Preparing...' : 'Send OTP'}
          </Button>
        </div>
      )}

      {/* Step: Enter OTP */}
      {(step === 'otp_sent' || step === 'validating') && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Enter the 6-digit code sent to the patient&apos;s phone.
          </p>
          <div className="flex gap-2">
            <div className="space-y-1 flex-1">
              <Label htmlFor="sha-otp-checkin" className="sr-only">OTP Code</Label>
              <Input
                id="sha-otp-checkin"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="6-digit code"
                maxLength={6}
                className="font-mono h-9"
                disabled={step === 'validating'}
              />
            </div>
            <Button
              onClick={handleValidateOTP}
              disabled={step === 'validating' || otpCode.length < 4}
              size="sm"
              className="h-9"
            >
              {step === 'validating' ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <KeyRound className="mr-1.5 h-3.5 w-3.5" />
              )}
              Verify
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {error && error.toLowerCase().includes('restricted to biometric') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWhitelistOpen(true)}
              className="text-xs h-7 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-900/20"
            >
              <AlertTriangle className="mr-1 h-3 w-3" />
              Request OTP Whitelist
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSendOTP}
              disabled={sendOTP.isPending || resendCountdown > 0}
              className="text-xs h-7"
            >
              {sendOTP.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : null}
              {resendCountdown > 0 ? `Resend OTP (${resendCountdown}s)` : 'Resend OTP'}
            </Button>
            {resendCountdown > 0 && (
              <span className="text-[10px] text-muted-foreground">
                Code expires in {resendCountdown}s
              </span>
            )}
          </div>

          {/* OTP Whitelist Request Sheet */}
          <OtpWhitelistRequestSheet
            open={whitelistOpen}
            onOpenChange={setWhitelistOpen}
            shaNumber={shaMember?.sha_member_number || shaMember?.sha_number || ''}
            facilityFrCode={facilityDetail?.sha_facility_code || ''}
            beneficiaryName={eligibilityInfo?.verifiedName}
          />
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <div className="rounded-md bg-green-50 dark:bg-green-900/10 p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-700 dark:text-green-300">
              Visit consent obtained
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
