/**
 * New Pre-authorization Request Wizard (Enhanced)
 *
 * Multi-step form for creating a pre-authorization request.
 * Step 1: Select preauth type + Patient (with eligibility pre-check)
 * Step 2: Consent (embedded OTP/biometric flow via ConsentPanel)
 * Step 3: Clinical details (intervention search, ICD-10 picker, doctors, documents)
 * Step 4: Review and submit
 *
 * Automations:
 * - Patient picker with autocomplete (pre-fills from URL ?patient=X&claim=Y)
 * - Eligibility pre-check before consent
 * - Consent token obtained via embedded ConsentPanel (OTP/biometric)
 * - Intervention code via searchable dropdown (SHA terminology)
 * - Diagnoses via ICD-10 multi-select search
 * - Doctors via staff search (registration numbers)
 * - Duplicate detection before submit
 * - Estimated cost display from intervention catalog
 * - Document upload for clinical justification
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  FileCheck,
  Stethoscope,
  Loader2,
  CheckCircle2,
  Scissors,
  Eye,
  Heart,
  Scan,
  Pill,
  Activity,
  AlertTriangle,
  Search,
  X,
  Upload,
  DollarSign,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { PatientSearchInput } from '@/components/patients/patient-search-input';
import { ConsentPanel } from '@/components/billing/sha/ConsentPanel';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import { useToast } from '@/lib/hooks/use-toast';
import { useDebounce } from '@/lib/hooks/use-debounce';

// ============================================================================
// Preauth Types
// ============================================================================

const PREAUTH_TYPES = [
  {
    id: 'normal',
    label: 'Normal',
    description: 'Standard pre-authorization for general services',
    icon: FileCheck,
    color: 'text-blue-600',
    requiresDoctors: false,
  },
  {
    id: 'surgical',
    label: 'Surgical',
    description: 'Pre-authorization for surgical procedures',
    icon: Scissors,
    color: 'text-red-600',
    requiresDoctors: true,
  },
  {
    id: 'elective',
    label: 'Elective',
    description: 'Planned elective procedures requiring doctor consent',
    icon: Stethoscope,
    color: 'text-purple-600',
    requiresDoctors: true,
  },
  {
    id: 'oncology',
    label: 'Oncology',
    description: 'Cancer treatment pre-authorization',
    icon: Pill,
    color: 'text-pink-600',
    requiresDoctors: true,
  },
  {
    id: 'renal',
    label: 'Renal',
    description: 'Kidney/dialysis treatment pre-authorization',
    icon: Heart,
    color: 'text-orange-600',
    requiresDoctors: false,
  },
  {
    id: 'imaging',
    label: 'Imaging',
    description: 'Medical imaging and investigations',
    icon: Scan,
    color: 'text-cyan-600',
    requiresDoctors: false,
  },
  {
    id: 'optical',
    label: 'Optical',
    description: 'Optical/eye care services',
    icon: Eye,
    color: 'text-green-600',
    requiresDoctors: false,
  },
] as const;

type PreauthType = (typeof PREAUTH_TYPES)[number]['id'];

interface InterventionOption {
  code: string;
  name: string;
  category?: string;
  price?: number;
  access_point?: string;
}

interface DiagnosisChip {
  code: string;
  display: string;
}

interface DoctorChip {
  registration_number: string;
  name: string;
}

// ============================================================================
// Component
// ============================================================================

export default function NewPreauthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Pre-fill from URL params (e.g., navigating from claim or patient page)
  const urlPatientId = searchParams.get('patient');
  const urlClaimId = searchParams.get('claim');

  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<PreauthType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ---- Step 1: Patient + Type ----
  const [patientId, setPatientId] = useState<number | null>(
    urlPatientId ? Number(urlPatientId) : null
  );
  const [claimId, setClaimId] = useState(urlClaimId || '');

  // ---- Step 2: Consent ----
  const [consentToken, setConsentToken] = useState('');
  const [consentTokenId, setConsentTokenId] = useState<number | undefined>();
  const [shaMemberId, setShaMemberId] = useState<number | null>(null);

  // ---- Step 3: Clinical Details ----
  const [interventionCode, setInterventionCode] = useState('');
  const [interventionName, setInterventionName] = useState('');
  const [interventionPrice, setInterventionPrice] = useState<number | null>(null);
  const [interventionSearch, setInterventionSearch] = useState('');
  const [showInterventionDropdown, setShowInterventionDropdown] = useState(false);

  const [diagnosisChips, setDiagnosisChips] = useState<DiagnosisChip[]>([]);
  const [diagnosisSearch, setDiagnosisSearch] = useState('');
  const [showDiagnosisDropdown, setShowDiagnosisDropdown] = useState(false);

  const [doctorChips, setDoctorChips] = useState<DoctorChip[]>([]);
  const [doctorSearch, setDoctorSearch] = useState('');
  const [showDoctorDropdown, setShowDoctorDropdown] = useState(false);

  const [tariffChips, setTariffChips] = useState<string[]>([]);
  const [tariffInput, setTariffInput] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [documents, setDocuments] = useState<File[]>([]);

  const totalSteps = 4;

  // ---- Eligibility pre-check ----
  const { data: eligibility, isLoading: eligibilityLoading, error: eligibilityError } = useQuery({
    queryKey: ['patient-eligibility', patientId],
    queryFn: async () => {
      if (!patientId) return null;
      const result = await shaApi.checkPatientEligibility(patientId);
      if (result.member) {
        setShaMemberId(result.member.id);
      }
      return result;
    },
    enabled: !!patientId,
    retry: false,
  });

  // ---- Patient claims (for claim link picker) ----
  const { data: patientClaims, isLoading: patientClaimsLoading } = useQuery({
    queryKey: ['patient-claims', patientId],
    queryFn: async () => {
      if (!patientId) return [];
      const result = await shaApi.getClaims({ patient: patientId, page_size: 50 });
      return result.results || [];
    },
    enabled: !!patientId,
  });

  // ---- Intervention search ----
  const debouncedInterventionSearch = useDebounce(interventionSearch, 300);
  const { data: interventionResults, isLoading: interventionLoading } = useQuery({
    queryKey: ['intervention-search', debouncedInterventionSearch],
    queryFn: () => shaApi.searchInterventionCodes(debouncedInterventionSearch, 15),
    enabled: debouncedInterventionSearch.length >= 2,
  });

  // ---- ICD-10 diagnosis search ----
  const debouncedDiagnosisSearch = useDebounce(diagnosisSearch, 300);
  const { data: diagnosisResults, isLoading: diagnosisLoading } = useQuery({
    queryKey: ['icd10-search', debouncedDiagnosisSearch],
    queryFn: async () => {
      if (debouncedDiagnosisSearch.length < 2) return [];
      const { apiClient } = await import('@/lib/api/client');
      const response = await apiClient.get('/api/icd10-codes/', {
        params: { search: debouncedDiagnosisSearch, page_size: 10 },
      });
      return (response.data.results || []) as { id: number; code: string; description: string }[];
    },
    enabled: debouncedDiagnosisSearch.length >= 2,
  });

  // ---- Doctor/Staff search ----
  const debouncedDoctorSearch = useDebounce(doctorSearch, 300);
  const { data: doctorResults, isLoading: doctorLoading } = useQuery({
    queryKey: ['staff-search', debouncedDoctorSearch],
    queryFn: async () => {
      if (debouncedDoctorSearch.length < 2) return [];
      const { staffApi } = await import('@/lib/api/rbac');
      const response = await staffApi.list({ search: debouncedDoctorSearch, page_size: 10 });
      return (response.results || []).map((s) => ({
        id: s.id,
        name: s.full_name || `${s.user_first_name} ${s.user_last_name}`.trim(),
        registration_number: s.license_number || s.employee_id || String(s.id),
        role: s.primary_role_name || '',
      }));
    },
    enabled: debouncedDoctorSearch.length >= 2,
  });

  // ---- Duplicate detection ----
  const { data: existingPreauths } = useQuery({
    queryKey: ['preauth-duplicate-check', consentToken, interventionCode],
    queryFn: () => shaApi.listLocalPreauths({ consent_token: consentToken }),
    enabled: !!consentToken && !!interventionCode,
  });

  const hasDuplicate = useMemo(() => {
    if (!existingPreauths?.results || !interventionCode) return false;
    return existingPreauths.results.some(
      (p) => p.intervention_code === interventionCode && p.status !== 'cancelled'
    );
  }, [existingPreauths, interventionCode]);

  // ---- Validation ----
  const typeConfig = PREAUTH_TYPES.find((t) => t.id === selectedType);
  const canProceedStep1 = selectedType !== null && patientId !== null;
  const canProceedStep2 = !!consentToken;
  const canProceedStep3 =
    interventionCode.trim().length > 0 &&
    // Types that require doctors must have at least one
    (!typeConfig?.requiresDoctors || doctorChips.length > 0);

  // ---- Handlers ----
  const handleConsentObtained = useCallback((id: number, token: string, _credential?: any) => {
    setConsentTokenId(id);
    setConsentToken(token);
  }, []);

  const selectIntervention = useCallback((item: InterventionOption) => {
    setInterventionCode(item.code);
    setInterventionName(item.name);
    setInterventionPrice(item.price ?? null);
    setInterventionSearch('');
    setShowInterventionDropdown(false);
    // Auto-add intervention code as the first tariff item
    setTariffChips((prev) => prev.includes(item.code) ? prev : [item.code, ...prev]);
  }, []);

  const addDiagnosis = useCallback((item: { code: string; description: string }) => {
    setDiagnosisChips((prev) => {
      if (prev.some((d) => d.code === item.code)) return prev;
      return [...prev, { code: item.code, display: `${item.code} - ${item.description}` }];
    });
    setDiagnosisSearch('');
    setShowDiagnosisDropdown(false);
  }, []);

  const removeDiagnosis = useCallback((code: string) => {
    setDiagnosisChips((prev) => prev.filter((d) => d.code !== code));
  }, []);

  const addDoctor = useCallback((doc: { name: string; registration_number: string }) => {
    setDoctorChips((prev) => {
      if (prev.some((d) => d.registration_number === doc.registration_number)) return prev;
      return [...prev, { registration_number: doc.registration_number, name: doc.name }];
    });
    setDoctorSearch('');
    setShowDoctorDropdown(false);
  }, []);

  const removeDoctor = useCallback((regNum: string) => {
    setDoctorChips((prev) => prev.filter((d) => d.registration_number !== regNum));
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setDocuments((prev) => [...prev, ...Array.from(files)]);
    }
    e.target.value = '';
  }, []);

  const removeFile = useCallback((index: number) => {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = async () => {
    if (!canProceedStep3 || !consentToken || !patientId) return;
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        preauth_type: selectedType,
      };
      if (diagnosisChips.length > 0) {
        payload.diagnoses = diagnosisChips.map((d) => d.code);
      }
      if (doctorChips.length > 0) {
        payload.doctors = doctorChips.map((d) => d.registration_number);
      }
      if (tariffChips.length > 0) {
        payload.items = tariffChips;
      }
      if (clinicalNotes.trim()) {
        payload.clinical_notes = clinicalNotes;
      }

      const result = await shaApi.ilmPreauthCreate({
        consent_token: consentToken.trim(),
        intervention_code: interventionCode.trim(),
        patient_pk: patientId,
        claim_pk: claimId ? Number(claimId) : undefined,
        payload,
      });

      toast({
        title: 'Pre-authorization Submitted',
        description: `${typeConfig?.label || selectedType} preauth for ${interventionCode} submitted to SHA.`,
      });
      queryClient.invalidateQueries({ queryKey: ['preauths-list'] });

      // Redirect to the new preauth detail page if we have the record_id
      const resultAny = result as unknown as Record<string, unknown>;
      const dataObj = (resultAny?.data as Record<string, unknown>) || resultAny || {};
      const recordId = dataObj.record_id;
      if (recordId) {
        router.push(`/transactions/preauths/${recordId}`);
      } else {
        router.push('/transactions/preauths');
      }
    } catch (err) {
      toast({
        title: 'Submission Failed',
        description: err instanceof Error ? err.message : 'Failed to submit pre-authorization',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = () => {
      setShowInterventionDropdown(false);
      setShowDiagnosisDropdown(false);
      setShowDoctorDropdown(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Pre-authorization"
        helpContent="Submit a pre-authorization request to SHA. Select the type, obtain consent, and provide required clinical information."
      />

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {Array.from({ length: totalSteps }, (_, i) => (
          <React.Fragment key={i}>
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium',
                step > i + 1
                  ? 'bg-primary text-primary-foreground'
                  : step === i + 1
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              {step > i + 1 ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            {i < totalSteps - 1 && (
              <div className={cn('h-0.5 flex-1', step > i + 1 ? 'bg-primary' : 'bg-muted')} />
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Type & Patient</span>
        <span>Consent</span>
        <span>Details</span>
        <span>Review</span>
      </div>

      {/* ================================================================ */}
      {/* Step 1: Select Type & Patient */}
      {/* ================================================================ */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Patient Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Select Patient *</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <PatientSearchInput
                value={patientId}
                onChange={(id) => setPatientId(id)}
                placeholder="Search patient by name or MRN..."
              />

              {/* Eligibility Status */}
              {patientId && (
                <div className="mt-3">
                  {eligibilityLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Checking SHA eligibility...
                    </div>
                  )}
                  {eligibilityError && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Eligibility Check Failed</AlertTitle>
                      <AlertDescription className="text-xs">
                        {eligibilityError instanceof Error ? eligibilityError.message : 'Unable to verify eligibility. You may proceed but submission may fail.'}
                      </AlertDescription>
                    </Alert>
                  )}
                  {eligibility && !eligibilityLoading && (
                    <div className={cn(
                      'flex items-center gap-2 rounded-md p-2.5 text-sm',
                      eligibility.is_eligible
                        ? 'bg-green-50 dark:bg-green-900/10 text-green-800 dark:text-green-400'
                        : 'bg-destructive/10 text-destructive'
                    )}>
                      {eligibility.is_eligible ? (
                        <>
                          <ShieldCheck className="h-4 w-4" />
                          <span>Patient is SHA eligible</span>
                          {eligibility.member && (
                            <Badge variant="outline" className="ml-auto text-xs">
                              Member #{eligibility.member.sha_number || eligibility.member.id}
                            </Badge>
                          )}
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4" />
                          <span>Patient is not SHA eligible — preauth may be rejected</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Claim Link (optional) */}
              <div className="space-y-1.5">
                <Label htmlFor="claim-id" className="text-xs text-muted-foreground">Link to Claim (optional)</Label>
                {patientId && patientClaims && patientClaims.length > 0 ? (
                  <select
                    id="claim-id"
                    value={claimId}
                    onChange={(e) => setClaimId(e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">— None —</option>
                    {patientClaims.map((claim) => (
                      <option key={claim.id} value={String(claim.id)}>
                        #{claim.id} — {claim.claim_number || claim.sha_claim_reference || 'No ref'} ({claim.status}){claim.service_date ? ` • ${claim.service_date}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id="claim-id"
                    type="number"
                    value={claimId}
                    onChange={(e) => setClaimId(e.target.value)}
                    placeholder={patientId ? (patientClaimsLoading ? 'Loading claims...' : 'No claims found — enter ID manually') : 'Select a patient first'}
                    className="h-8 text-sm"
                    disabled={patientClaimsLoading}
                  />
                )}
                {patientId && patientClaimsLoading && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading patient claims…
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Type Selection */}
          <div className="space-y-3">
            <h3 className="text-base font-medium">Select Pre-authorization Type *</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {PREAUTH_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <Card
                    key={type.id}
                    className={cn(
                      'cursor-pointer transition-colors hover:border-primary/50',
                      selectedType === type.id && 'border-primary bg-primary/5'
                    )}
                    onClick={() => setSelectedType(type.id)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2.5">
                        <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', type.color)} />
                        <div>
                          <p className="text-sm font-medium">{type.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{type.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Step 2: Consent */}
      {/* ================================================================ */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Obtain Patient Consent</h3>

          {/* Intervention picker for OTP scope */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Select Benefit Package for Consent *</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                The DHA OTP is scoped to a benefit package. Select the intervention before sending OTP.
              </p>
              {interventionCode ? (
                <div className="flex items-center justify-between rounded-md border p-2.5">
                  <div>
                    <p className="font-mono text-xs font-medium">{interventionCode}</p>
                    <p className="text-xs text-muted-foreground">{interventionName}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setInterventionCode('');
                      setInterventionName('');
                      setInterventionPrice(null);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={interventionSearch}
                      onChange={(e) => {
                        setInterventionSearch(e.target.value);
                        setShowInterventionDropdown(true);
                      }}
                      onFocus={() => setShowInterventionDropdown(true)}
                      placeholder="Search SHA interventions (e.g. surgical, renal, imaging)..."
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                  {showInterventionDropdown && interventionSearch.length >= 2 && (
                    <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
                      {interventionLoading ? (
                        <div className="p-2 text-center text-xs text-muted-foreground">
                          <Loader2 className="inline h-3 w-3 animate-spin mr-1" /> Searching…
                        </div>
                      ) : interventionResults && interventionResults.length > 0 ? (
                        interventionResults.map((item: any) => (
                          <button
                            key={item.code}
                            type="button"
                            className="w-full text-left px-3 py-2 text-xs hover:bg-accent border-b last:border-0"
                            onClick={() => {
                              setInterventionCode(item.code);
                              setInterventionName(item.name || item.display || item.code);
                              setInterventionPrice(item.price || null);
                              setInterventionSearch('');
                              setShowInterventionDropdown(false);
                            }}
                          >
                            <span className="font-mono font-medium">{item.code}</span>
                            <span className="ml-2 text-muted-foreground">{item.name || item.display}</span>
                          </button>
                        ))
                      ) : (
                        <div className="p-2 text-center text-xs text-muted-foreground">
                          No results
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {shaMemberId ? (
            <ConsentPanel
              shaMemberId={shaMemberId}
              consentId={consentTokenId}
              interventionCodes={interventionCode ? [interventionCode] : undefined}
              onConsentObtained={handleConsentObtained}
            />
          ) : (
            <Card>
              <CardContent className="p-4 space-y-3">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>No SHA Member Record</AlertTitle>
                  <AlertDescription>
                    No SHA member record found for this patient. Enter the consent token manually
                    if you already have one from a prior visit.
                  </AlertDescription>
                </Alert>
                <div className="space-y-1.5">
                  <Label htmlFor="manual-consent">Consent Token (manual entry)</Label>
                  <Input
                    id="manual-consent"
                    value={consentToken}
                    onChange={(e) => setConsentToken(e.target.value)}
                    placeholder="Paste consent token from prior OTP validation..."
                    className="font-mono text-xs"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Show consent status */}
          {consentToken && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-900/10 p-3 text-sm text-green-800 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>Consent token obtained successfully</span>
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* Step 3: Clinical Details */}
      {/* ================================================================ */}
      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">
            {typeConfig?.label} Pre-authorization Details
          </h3>

          {/* Intervention Search */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Intervention *</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {interventionCode ? (
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="font-mono text-sm font-medium">{interventionCode}</p>
                    <p className="text-xs text-muted-foreground">{interventionName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {interventionPrice != null && (
                      <Badge variant="secondary" className="font-mono">
                        <DollarSign className="mr-0.5 h-3 w-3" />
                        KES {interventionPrice.toLocaleString()}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setInterventionCode('');
                        setInterventionName('');
                        setInterventionPrice(null);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search interventions by code or name..."
                    value={interventionSearch}
                    onChange={(e) => {
                      setInterventionSearch(e.target.value);
                      setShowInterventionDropdown(true);
                    }}
                    onFocus={() => setShowInterventionDropdown(true)}
                    className="pl-9"
                  />
                  {showInterventionDropdown && debouncedInterventionSearch.length >= 2 && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-60 overflow-y-auto">
                      {interventionLoading ? (
                        <div className="p-3 text-sm text-muted-foreground">Searching...</div>
                      ) : interventionResults && interventionResults.length > 0 ? (
                        interventionResults.map((item) => (
                          <button
                            key={item.code}
                            type="button"
                            className="w-full px-3 py-2 text-left hover:bg-accent text-sm border-b last:border-0"
                            onClick={() => selectIntervention(item)}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="font-mono font-medium">{item.code}</span>
                                <p className="text-xs text-muted-foreground line-clamp-1">{item.name}</p>
                              </div>
                              {item.price != null && (
                                <span className="text-xs font-mono text-muted-foreground shrink-0 ml-2">
                                  KES {item.price.toLocaleString()}
                                </span>
                              )}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-sm text-muted-foreground">No interventions found</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Duplicate warning */}
              {hasDuplicate && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Duplicate Preauth Detected</AlertTitle>
                  <AlertDescription className="text-xs">
                    A pre-authorization for this consent token + intervention code already exists.
                    Submitting may fail or create a duplicate.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Diagnoses */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Diagnoses (ICD-10)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Chips */}
              {diagnosisChips.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {diagnosisChips.map((chip) => (
                    <Badge key={chip.code} variant="secondary" className="gap-1 pr-1 font-mono text-xs">
                      {chip.code}
                      <button
                        type="button"
                        onClick={() => removeDiagnosis(chip.code)}
                        className="ml-1 rounded-full hover:bg-muted p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {/* Search */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search ICD-10 codes (e.g., J06 or malaria)..."
                  value={diagnosisSearch}
                  onChange={(e) => {
                    setDiagnosisSearch(e.target.value);
                    setShowDiagnosisDropdown(true);
                  }}
                  onFocus={() => setShowDiagnosisDropdown(true)}
                  className="pl-9"
                />
                {showDiagnosisDropdown && debouncedDiagnosisSearch.length >= 2 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
                    {diagnosisLoading ? (
                      <div className="p-3 text-sm text-muted-foreground">Searching...</div>
                    ) : diagnosisResults && diagnosisResults.length > 0 ? (
                      diagnosisResults.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-accent text-sm border-b last:border-0"
                          onClick={() => addDiagnosis(item)}
                        >
                          <span className="font-mono font-medium">{item.code}</span>
                          <span className="ml-2 text-muted-foreground">{item.description}</span>
                        </button>
                      ))
                    ) : (
                      <div className="p-3 text-sm text-muted-foreground">No results</div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Doctors (shown for types that require them, or always available) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Doctors / Practitioners
                {typeConfig?.requiresDoctors && <span className="text-destructive ml-1">*</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {typeConfig?.requiresDoctors && (
                <p className="text-xs text-muted-foreground">
                  {selectedType === 'elective'
                    ? 'Elective preauths require doctor consent — listed doctors will receive an approval request via Practice360.'
                    : `${typeConfig.label} preauths require at least one practitioner.`}
                </p>
              )}
              {/* Chips */}
              {doctorChips.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {doctorChips.map((doc) => (
                    <Badge key={doc.registration_number} variant="secondary" className="gap-1 pr-1 text-xs">
                      {doc.name} ({doc.registration_number})
                      <button
                        type="button"
                        onClick={() => removeDoctor(doc.registration_number)}
                        className="ml-1 rounded-full hover:bg-muted p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {/* Search */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search staff by name..."
                  value={doctorSearch}
                  onChange={(e) => {
                    setDoctorSearch(e.target.value);
                    setShowDoctorDropdown(true);
                  }}
                  onFocus={() => setShowDoctorDropdown(true)}
                  className="pl-9"
                />
                {showDoctorDropdown && debouncedDoctorSearch.length >= 2 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
                    {doctorLoading ? (
                      <div className="p-3 text-sm text-muted-foreground">Searching...</div>
                    ) : doctorResults && doctorResults.length > 0 ? (
                      doctorResults.map((doc: { id: number; name: string; registration_number: string; role: string }) => (
                        <button
                          key={doc.id}
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-accent text-sm border-b last:border-0"
                          onClick={() => addDoctor(doc)}
                        >
                          <div className="flex justify-between">
                            <span className="font-medium">{doc.name}</span>
                            <span className="text-xs text-muted-foreground">{doc.registration_number}</span>
                          </div>
                          {doc.role && <p className="text-xs text-muted-foreground">{doc.role}</p>}
                        </button>
                      ))
                    ) : (
                      <div className="p-3 text-sm text-muted-foreground">No staff found</div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tariff Items + Clinical Notes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="tariff-items">Tariff Items</Label>
                <p className="text-xs text-muted-foreground">
                  Auto-filled from selected intervention. Add more codes as needed.
                </p>
                <div className="flex flex-wrap gap-1.5 min-h-[2rem] rounded-md border p-2">
                  {tariffChips.map((code) => (
                    <Badge key={code} variant="secondary" className="gap-1 text-xs font-mono">
                      {code}
                      <button
                        type="button"
                        onClick={() => setTariffChips((prev) => prev.filter((c) => c !== code))}
                        className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <Input
                    id="tariff-items"
                    value={tariffInput}
                    onChange={(e) => setTariffInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ',') && tariffInput.trim()) {
                        e.preventDefault();
                        const code = tariffInput.trim().replace(/,$/, '');
                        if (code && !tariffChips.includes(code)) {
                          setTariffChips((prev) => [...prev, code]);
                        }
                        setTariffInput('');
                      }
                    }}
                    placeholder={tariffChips.length > 0 ? 'Add more codes...' : 'e.g., SHA-19-001-A'}
                    className="flex-1 min-w-[150px] border-0 p-0 h-6 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="clinical-notes">Clinical Justification</Label>
                <Textarea
                  id="clinical-notes"
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  placeholder="Clinical justification for pre-authorization (required for complex procedures)..."
                  rows={3}
                />
              </div>

              {/* Document Upload */}
              <div className="space-y-2">
                <Label>Supporting Documents</Label>
                <p className="text-xs text-muted-foreground">
                  Upload clinical justification documents, X-rays, referral letters, etc.
                </p>
                <div className="flex flex-wrap gap-2">
                  {documents.map((file, i) => (
                    <Badge key={i} variant="outline" className="gap-1 pr-1 text-xs">
                      {file.name} ({(file.size / 1024).toFixed(0)} KB)
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="ml-1 rounded-full hover:bg-muted p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                  <Upload className="h-4 w-4" />
                  Upload File
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ================================================================ */}
      {/* Step 4: Review */}
      {/* ================================================================ */}
      {step === 4 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Review &amp; Submit</h3>

          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  <Activity className="mr-1 h-3 w-3" />
                  {selectedType}
                </Badge>
                {interventionPrice != null && (
                  <Badge variant="secondary" className="font-mono">
                    <DollarSign className="mr-0.5 h-3 w-3" />
                    KES {interventionPrice.toLocaleString()}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Patient</span>
                  <p>ID: {patientId}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Intervention</span>
                  <p className="font-mono">{interventionCode}</p>
                  {interventionName && (
                    <p className="text-xs text-muted-foreground">{interventionName}</p>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Consent Token</span>
                  <p className="font-mono text-xs truncate max-w-[200px]">{consentToken.slice(0, 40)}...</p>
                </div>
                {claimId && (
                  <div>
                    <span className="text-muted-foreground">Linked Claim</span>
                    <p>#{claimId}</p>
                  </div>
                )}
              </div>

              {/* Diagnoses */}
              {diagnosisChips.length > 0 && (
                <div>
                  <span className="text-sm text-muted-foreground">Diagnoses</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {diagnosisChips.map((d) => (
                      <Badge key={d.code} variant="outline" className="font-mono text-xs">
                        {d.code}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Doctors */}
              {doctorChips.length > 0 && (
                <div>
                  <span className="text-sm text-muted-foreground">Doctors</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {doctorChips.map((d) => (
                      <Badge key={d.registration_number} variant="outline" className="text-xs">
                        {d.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Items */}
              {tariffChips.length > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Tariff Items</span>
                  <p className="font-mono text-xs mt-0.5">{tariffChips.join(', ')}</p>
                </div>
              )}

              {/* Clinical Notes */}
              {clinicalNotes && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Clinical Notes</span>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs">{clinicalNotes}</p>
                </div>
              )}

              {/* Documents */}
              {documents.length > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Documents ({documents.length})</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {documents.map((f, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {f.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Duplicate warning */}
          {hasDuplicate && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Duplicate Preauth Warning</AlertTitle>
              <AlertDescription>
                A pre-authorization with this consent token + intervention code already exists.
                Submitting will likely fail. Consider cancelling the existing one first.
              </AlertDescription>
            </Alert>
          )}

          {selectedType === 'elective' && (
            <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-900/10">
              <Info className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800 dark:text-amber-400">Doctor Consent Required</AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-300 text-xs">
                This elective preauth will trigger doctor consent approval.
                Listed doctors will receive a notification to approve via Practice360.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t">
        <Button
          variant="outline"
          onClick={() => {
            if (step === 1) router.push('/transactions/preauths');
            else setStep(step - 1);
          }}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          {step === 1 ? 'Cancel' : 'Back'}
        </Button>

        {step < totalSteps ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={
              (step === 1 && !canProceedStep1) ||
              (step === 2 && !canProceedStep2) ||
              (step === 3 && !canProceedStep3)
            }
          >
            Next
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={isSubmitting || !canProceedStep3 || hasDuplicate}>
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileCheck className="mr-2 h-4 w-4" />
            )}
            Submit to SHA
          </Button>
        )}
      </div>
    </div>
  );
}
