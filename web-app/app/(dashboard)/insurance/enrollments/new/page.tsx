'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Check, CheckCircle2, ChevronsUpDown } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  buildHealthcloudEligibilityView,
  HealthcloudEligibilityCards,
} from '@/components/insurance/healthcloud-eligibility-cards';
import {
  useCreateEnrollment,
  useInsurancePlans,
  useInsuranceProviders,
  useProviderConfigs,
  usePatientInsurances,
  useVerifyEnrollmentViaHealthcloudPreview,
} from '@/lib/hooks/use-insurance';
import { useCounties, useSubCounties } from '@/lib/hooks/use-locations';
import { useCreatePatient } from '@/lib/hooks/use-patients';
import { useToast } from '@/lib/hooks/use-toast';
import type { VerifyViaHealthcloudResult } from '@/lib/types/insurance';
import { getApiErrorMessage } from '@/lib/api/client';
import { patientsApi } from '@/lib/api/patients';
import type { IdentificationType, Patient } from '@/lib/types/patient';
import { useFacility } from '@/lib/context/facility-context';
import { NATIONALITIES } from '@/lib/utils/nationalities';
import { cn } from '@/lib/utils';

const MAX_CARD_IMAGE_SIZE_MB = 5;
const MAX_CARD_IMAGE_SIZE_BYTES = MAX_CARD_IMAGE_SIZE_MB * 1024 * 1024;
const ALLOWED_CARD_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type MatchConfidence = 'high' | 'medium' | 'low';

type SuggestedPatient = {
  patient: Patient;
  score: number;
  confidence: MatchConfidence;
};

type InlinePatientFormData = {
  first_name: string;
  middle_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'M' | 'F' | 'O' | '';
  identification_type: IdentificationType;
  identification_number: string;
  phone_number: string;
  citizenship: string;
  address: string;
  place_of_birth: string;
  village: string;
  county: string;
  sub_county: string;
  referral_source: 'self' | 'clinic' | 'other_facility';
  referred_from_facility: string;
  consent_choice: 'given' | 'deferred' | '';
  payment_mode: 'cash' | 'sha' | 'insurance_private' | 'insurance_corporate';
  insurance_provider: string;
  insurance_member_number: string;
  sha_number: string;
  household_number: string;
  principal_national_id: string;
};

const emptyInlinePatientForm: InlinePatientFormData = {
  first_name: '',
  middle_name: '',
  last_name: '',
  date_of_birth: '',
  gender: '',
  identification_type: 'national_id',
  identification_number: '',
  phone_number: '',
  citizenship: 'Kenyan',
  address: '',
  place_of_birth: '',
  village: '',
  county: '',
  sub_county: '',
  referral_source: 'self',
  referred_from_facility: '',
  consent_choice: '',
  payment_mode: 'insurance_private',
  insurance_provider: '',
  insurance_member_number: '',
  sha_number: '',
  household_number: '',
  principal_national_id: '',
};

const IDENTIFICATION_TYPE_MAP: Record<string, IdentificationType> = {
  'national id': 'national_id',
  national_id: 'national_id',
  nationalid: 'national_id',
  'hie patient id': 'cr_number',
  'cr id': 'cr_number',
  'cr number': 'cr_number',
  cr_number: 'cr_number',
  'mandate number': 'mandate_number',
  mandate_number: 'mandate_number',
  'alien id': 'alien_id',
  alien_id: 'alien_id',
  'kra pin': 'kra_pin',
  kra_pin: 'kra_pin',
  passport: 'passport',
  'passport number': 'passport',
  'birth certificate': 'birth_certificate',
  'birth certificate number': 'birth_certificate',
  birth_certificate: 'birth_certificate',
  'temporary id': 'temporary_id',
  temporary_id: 'temporary_id',
};

const identificationTypeOptions: Array<{ value: IdentificationType; label: string }> = [
  { value: 'national_id', label: 'National ID' },
  { value: 'cr_number', label: 'CR Number' },
  { value: 'mandate_number', label: 'Mandate Number' },
  { value: 'alien_id', label: 'Alien ID' },
  { value: 'kra_pin', label: 'KRA PIN' },
  { value: 'temporary_id', label: 'Temporary ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'birth_certificate', label: 'Birth Certificate' },
];

const normalizeIdentificationType = (value: unknown): IdentificationType | undefined => {
  if (typeof value !== 'string') return undefined;
  return IDENTIFICATION_TYPE_MAP[value.trim().toLowerCase()];
};

const pickFirstString = (source: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const splitPersonNames = (member: Record<string, unknown>) => {
  const explicitFirst = pickFirstString(member, ['firstName', 'first_name']);
  const explicitMiddle = pickFirstString(member, ['middleName', 'middle_name']);
  const explicitLast = pickFirstString(member, ['lastName', 'last_name']);

  if (explicitFirst || explicitLast) {
    return {
      first_name: explicitFirst,
      middle_name: explicitMiddle,
      last_name: explicitLast,
    };
  }

  const combinedName = pickFirstString(member, ['names', 'full_name', 'fullName', 'name']);
  if (!combinedName) {
    return { first_name: '', middle_name: '', last_name: '' };
  }

  const parts = combinedName.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { first_name: parts[0] || '', middle_name: '', last_name: '' };
  }
  if (parts.length === 2) {
    return { first_name: parts[0] || '', middle_name: '', last_name: parts[1] || '' };
  }

  return {
    first_name: parts[0] || '',
    middle_name: parts.slice(1, -1).join(' '),
    last_name: parts[parts.length - 1] || '',
  };
};

const normalizeGender = (value: unknown): InlinePatientFormData['gender'] => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'm' || normalized === 'male') return 'M';
  if (normalized === 'f' || normalized === 'female') return 'F';
  if (normalized === 'o' || normalized === 'other') return 'O';
  return '';
};

const normalizeIsoDate = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const dateText = value.trim();
  if (!dateText) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return dateText;
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

export default function NewInsuranceEnrollmentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { facility, organization } = useFacility();
  const createEnrollment = useCreateEnrollment();
  const createPatient = useCreatePatient();
  const verifyPreview = useVerifyEnrollmentViaHealthcloudPreview();
  const { data: counties = [] } = useCounties();
  const { data: plansData } = useInsurancePlans(
    { page: 1, page_size: 200 },
    { enabled: !!facility?.id && !!organization?.id }
  );
  const { data: providersData } = useInsuranceProviders(
    { page: 1, page_size: 200 },
    { enabled: !!facility?.id && !!organization?.id }
  );
  const { data: providerConfigsData } = useProviderConfigs(
    { page: 1, page_size: 200 },
    { enabled: !!facility?.id && !!organization?.id }
  );
  const [patientId, setPatientId] = useState<number | null>(null);
  const [suggestedPatients, setSuggestedPatients] = useState<SuggestedPatient[]>([]);
  const [searchPatients, setSearchPatients] = useState<Patient[]>([]);
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [patientMatchingLoading, setPatientMatchingLoading] = useState(false);
  const [providerId, setProviderId] = useState('');
  const [planId, setPlanId] = useState('');
  const [memberNumber, setMemberNumber] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [validTo, setValidTo] = useState(
    new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10)
  );
  const [cardImageFront, setCardImageFront] = useState<File | null>(null);
  const [cardImageBack, setCardImageBack] = useState<File | null>(null);
  const [cardImageFrontPreview, setCardImageFrontPreview] = useState<string | null>(null);
  const [cardImageBackPreview, setCardImageBackPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [eligibilityResult, setEligibilityResult] = useState<VerifyViaHealthcloudResult | null>(
    null
  );
  const [isCreatePatientSheetOpen, setIsCreatePatientSheetOpen] = useState(false);
  const [nationalityOpen, setNationalityOpen] = useState(false);
  const [createPatientForm, setCreatePatientForm] =
    useState<InlinePatientFormData>(emptyInlinePatientForm);
  const [duplicateCheckMatches, setDuplicateCheckMatches] = useState<Patient[]>([]);
  const [duplicateCheckArmed, setDuplicateCheckArmed] = useState(false);
  const [createEnrollmentError, setCreateEnrollmentError] = useState<string | null>(null);

  const { data: duplicateEnrollmentsData } = usePatientInsurances(
    {
      page: 1,
      page_size: 100,
      provider: providerId ? Number(providerId) : undefined,
      status: 'active',
    },
    { enabled: !!providerId && memberNumber.trim().length > 0 }
  );

  const { data: subCounties = [] } = useSubCounties(
    createPatientForm.county ? Number(createPatientForm.county) : undefined
  );

  const filteredPlans = (plansData?.results ?? []).filter((p) =>
    providerId ? p.provider === Number(providerId) : true
  );
  const providerOptions =
    ((providersData?.results ?? []).length > 0
      ? providersData?.results
      : Array.from(
          new Map(
            (plansData?.results ?? []).map((p) => [
              p.provider,
              { id: p.provider, name: p.provider_name },
            ])
          ).values()
        )) ?? [];
  const selectedProvider = providerOptions.find((provider) => String(provider.id) === providerId);
  const isEligibilityChecked = Boolean(eligibilityResult);
  const selectedProviderConfig = (providerConfigsData?.results ?? []).find(
    (cfg) => cfg.provider === Number(providerId)
  );
  const eligibilityView = buildHealthcloudEligibilityView(eligibilityResult);
  const resolvePlanFromEligibility = (result: VerifyViaHealthcloudResult | null) => {
    if (!result || !providerId) return undefined;
    const requestedPlanName = (result.plan_name || '').trim().toLowerCase();
    const providerPlans = (plansData?.results ?? []).filter(
      (plan) => plan.provider === Number(providerId)
    );
    if (providerPlans.length === 0) return undefined;
    const exactPlan = providerPlans.find(
      (plan) => plan.name.trim().toLowerCase() === requestedPlanName
    );
    const fuzzyPlan = providerPlans.find((plan) =>
      plan.name.trim().toLowerCase().includes(requestedPlanName)
    );
    return exactPlan || fuzzyPlan || providerPlans[0];
  };

  const derivedResolvedPlan = resolvePlanFromEligibility(eligibilityResult);
  const effectivePlanId = planId || (derivedResolvedPlan ? String(derivedResolvedPlan.id) : '');
  const resolvedPlan = (plansData?.results ?? []).find(
    (plan) => String(plan.id) === effectivePlanId
  );
  const resolvedPlanLabel = resolvedPlan
    ? `${resolvedPlan.provider_name} - ${resolvedPlan.name}`
    : String((eligibilityView?.cover?.schemeName ?? eligibilityResult?.plan_name) || 'N/A');
  const normalizedMemberNumber = memberNumber.trim().toLowerCase();
  const duplicateActiveEnrollment = (duplicateEnrollmentsData?.results ?? []).find(
    (enrollment) => enrollment.member_number.trim().toLowerCase() === normalizedMemberNumber
  );
  const duplicateEnrollmentInlineError = duplicateActiveEnrollment
    ? `An active enrollment already exists for this payer and member number (${duplicateActiveEnrollment.patient_name}).`
    : null;

  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
  const digitsOnly = (value: string) => value.replace(/\D+/g, '');
  const patientLabel = (patient: Patient) =>
    patient.full_name || `${patient.first_name} ${patient.last_name}`;

  const pickUniquePatients = (items: Patient[]) => {
    const map = new Map<number, Patient>();
    items.forEach((item) => map.set(item.id, item));
    return Array.from(map.values());
  };

  const uniqueSearchPatients = pickUniquePatients(searchPatients);
  const hasPatientMatches = suggestedPatients.length > 0 || uniqueSearchPatients.length > 0;

  const scoreToConfidence = (score: number): MatchConfidence => {
    if (score >= 80) return 'high';
    if (score >= 45) return 'medium';
    return 'low';
  };

  const confidenceClasses: Record<MatchConfidence, string> = {
    high: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-slate-100 text-slate-700',
  };
  const isEligibilityEligible = eligibilityResult?.eligible === true;
  const eligibilityInlineError =
    isEligibilityChecked && !isEligibilityEligible
      ? eligibilityResult?.message || 'Member is not eligible for enrollment right now.'
      : null;
  const missingRequirements: string[] = [];
  if (!isEligibilityChecked) missingRequirements.push('run eligibility precheck');
  if (isEligibilityChecked && !isEligibilityEligible)
    missingRequirements.push('resolve eligibility issue');
  if (duplicateEnrollmentInlineError)
    missingRequirements.push('use a different member number or update the existing enrollment');
  if (!patientId) missingRequirements.push('select a matched patient');
  if (!effectivePlanId) missingRequirements.push('resolve plan from eligibility');

  const handleCardImageChange = (side: 'front' | 'back', file: File | null) => {
    if (!file) {
      if (side === 'front') {
        setCardImageFront(null);
      } else {
        setCardImageBack(null);
      }
      return;
    }

    if (!ALLOWED_CARD_IMAGE_TYPES.has(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Use JPG, PNG, or WEBP card images only.',
        variant: 'destructive',
      });
      return;
    }
    if (file.size > MAX_CARD_IMAGE_SIZE_BYTES) {
      toast({
        title: 'File too large',
        description: `Card image must be ${MAX_CARD_IMAGE_SIZE_MB} MB or smaller.`,
        variant: 'destructive',
      });
      return;
    }

    if (side === 'front') {
      setCardImageFront(file);
      return;
    }
    setCardImageBack(file);
  };

  const setInlinePatientForm = (
    updater: (prev: InlinePatientFormData) => InlinePatientFormData
  ) => {
    setCreatePatientForm((prev) => updater(prev));
    setDuplicateCheckMatches([]);
    setDuplicateCheckArmed(false);
  };

  useEffect(() => {
    setCreateEnrollmentError(null);
  }, [providerId, memberNumber, patientId, effectivePlanId, eligibilityResult]);

  useEffect(() => {
    if (!eligibilityResult || planId) return;
    if (derivedResolvedPlan) {
      setPlanId(String(derivedResolvedPlan.id));
    }
  }, [derivedResolvedPlan, eligibilityResult, planId]);

  useEffect(() => {
    if (!cardImageFront) {
      setCardImageFrontPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(cardImageFront);
    setCardImageFrontPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [cardImageFront]);

  useEffect(() => {
    if (!cardImageBack) {
      setCardImageBackPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(cardImageBack);
    setCardImageBackPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [cardImageBack]);

  const scorePatientCandidate = (
    patient: Patient,
    expectedName: string,
    expectedFirst: string,
    expectedLast: string,
    expectedIdLast4: string
  ) => {
    let score = 0;
    const label = normalize(patientLabel(patient));
    const first = normalize(patient.first_name || '');
    const last = normalize(patient.last_name || '');
    const fullExpected = normalize(expectedName);
    const firstExpected = normalize(expectedFirst);
    const lastExpected = normalize(expectedLast);

    if (fullExpected && label === fullExpected) score += 60;
    if (firstExpected && first === firstExpected) score += 20;
    if (lastExpected && last === lastExpected) score += 25;
    if (fullExpected && label.includes(fullExpected)) score += 10;

    const patientIds = [patient.identification_number || '', patient.national_id || ''];
    const patientDigits = patientIds.map(digitsOnly).filter(Boolean);
    if (expectedIdLast4) {
      if (patientDigits.some((v) => v.endsWith(expectedIdLast4))) score += 35;
      else if (patientDigits.some((v) => v.includes(expectedIdLast4))) score += 15;
    }

    return score;
  };

  const getInlinePatientDefaults = (
    result: VerifyViaHealthcloudResult | null
  ): InlinePatientFormData => {
    const view = buildHealthcloudEligibilityView(result);
    const member = view?.member ?? {};
    const nameParts = splitPersonNames(member);
    const mappedIdentificationType = normalizeIdentificationType(
      member.identification_type || member.identificationType || member.idType || member.id_type
    );
    const countyName = pickFirstString(member, ['countyName', 'county_name', 'county']);
    const subCountyName = pickFirstString(member, [
      'subCountyName',
      'sub_county_name',
      'subCounty',
      'sub_county',
    ]);
    const matchedCounty = counties.find(
      (county) => normalize(county.name) === normalize(countyName)
    );
    const matchedSubCounty = matchedCounty
      ? subCounties.find((subCounty) => normalize(subCounty.name) === normalize(subCountyName))
      : undefined;

    return {
      first_name: nameParts.first_name,
      middle_name: nameParts.middle_name,
      last_name: nameParts.last_name,
      date_of_birth: normalizeIsoDate(member.dateOfBirth || member.date_of_birth),
      gender: normalizeGender(member.gender),
      identification_type: mappedIdentificationType || 'national_id',
      identification_number: String(
        member.identification_number ||
          member.identificationNumber ||
          member.idNumber ||
          member.id_number ||
          member.national_id ||
          member.nationalId ||
          ''
      ).trim(),
      phone_number: String(member.phoneNumber || member.phone_number || '').trim(),
      citizenship: String(member.citizenship || member.nationality || 'Kenyan').trim() || 'Kenyan',
      address: [
        member.village_estate,
        member.ward,
        member.sub_county,
        member.county,
        member.postal_address,
      ]
        .filter((part) => typeof part === 'string' && part.trim())
        .map((part) => String(part).trim())
        .join(', '),
      place_of_birth: String(member.placeOfBirth || member.place_of_birth || '').trim(),
      village: String(member.village_estate || member.village || '').trim(),
      county: matchedCounty ? String(matchedCounty.id) : '',
      sub_county: matchedSubCounty ? String(matchedSubCounty.id) : '',
      referral_source: 'self',
      referred_from_facility: '',
      consent_choice: '',
      payment_mode: 'insurance_private',
      insurance_provider: selectedProvider?.name || '',
      insurance_member_number: String(
        member.memberNumber || member.member_number || result?.member_number || ''
      ).trim(),
      sha_number: String(
        member.memberNumber || member.member_number || result?.member_number || ''
      ).trim(),
      household_number: String(member.householdNumber || member.household_number || '').trim(),
      principal_national_id: String(
        member.principalNationalId || member.principal_national_id || member.principalId || ''
      ).trim(),
    };
  };

  const openCreatePatientSheet = () => {
    setCreatePatientForm(getInlinePatientDefaults(eligibilityResult));
    setDuplicateCheckMatches([]);
    setDuplicateCheckArmed(false);
    setIsCreatePatientSheetOpen(true);
  };

  const handleInlineCreatePatient = async () => {
    if (!createPatientForm.first_name.trim() || !createPatientForm.last_name.trim()) {
      toast({
        title: 'Missing fields',
        description: 'First name and last name are required.',
        variant: 'destructive',
      });
      return;
    }
    if (!createPatientForm.date_of_birth || !createPatientForm.gender) {
      toast({
        title: 'Missing fields',
        description: 'Date of birth and gender are required.',
        variant: 'destructive',
      });
      return;
    }
    if (!createPatientForm.county || !createPatientForm.sub_county) {
      toast({
        title: 'Missing fields',
        description: 'County and sub-county are required.',
        variant: 'destructive',
      });
      return;
    }
    if (!createPatientForm.consent_choice) {
      toast({
        title: 'Consent required',
        description: 'Select whether consent is given now or deferred.',
        variant: 'destructive',
      });
      return;
    }
    if (
      createPatientForm.referral_source === 'other_facility' &&
      !createPatientForm.referred_from_facility.trim()
    ) {
      toast({
        title: 'Missing field',
        description: 'Please provide the referring facility name.',
        variant: 'destructive',
      });
      return;
    }

    const duplicatePayload = {
      identification_number: createPatientForm.identification_number.trim() || undefined,
      identification_type: createPatientForm.identification_number.trim()
        ? createPatientForm.identification_type
        : undefined,
      first_name: createPatientForm.first_name.trim(),
      last_name: createPatientForm.last_name.trim(),
      date_of_birth: createPatientForm.date_of_birth,
      gender: createPatientForm.gender,
    };

    if (!duplicateCheckArmed) {
      try {
        const duplicateCheckResult = await patientsApi.checkDuplicate(duplicatePayload);
        if (duplicateCheckResult.has_duplicate && duplicateCheckResult.matches.length > 0) {
          const duplicateCandidates = duplicateCheckResult.matches.slice(0, 5).map(
            (match) =>
              ({
                id: match.id,
                mrn: match.mrn,
                first_name: match.full_name,
                last_name: '',
                date_of_birth: match.date_of_birth,
                gender: match.gender,
                county: Number(createPatientForm.county),
                sub_county: Number(createPatientForm.sub_county),
                is_sensitive: false,
                consent_given: false,
                referral_source: 'self',
                registered_by: 0,
                created_at: '',
                updated_at: '',
                full_name: match.full_name,
              }) as Patient
          );

          setDuplicateCheckMatches(duplicateCandidates);
          setDuplicateCheckArmed(true);
          toast({
            title: 'Possible duplicate found',
            description:
              'Review matching patients below. Click Create Anyway only if this is a different person.',
            variant: 'destructive',
          });
          return;
        }
      } catch (error) {
        toast({
          title: 'Duplicate check failed',
          description: getApiErrorMessage(error),
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      const createdPatient = await createPatient.mutateAsync({
        data: {
          first_name: createPatientForm.first_name.trim(),
          middle_name: createPatientForm.middle_name.trim() || undefined,
          last_name: createPatientForm.last_name.trim(),
          date_of_birth: createPatientForm.date_of_birth,
          gender: createPatientForm.gender,
          county: Number(createPatientForm.county),
          sub_county: Number(createPatientForm.sub_county),
          citizenship: createPatientForm.citizenship.trim() || 'Kenyan',
          place_of_birth: createPatientForm.place_of_birth.trim() || undefined,
          address: createPatientForm.address.trim() || undefined,
          village: createPatientForm.village.trim() || undefined,
          identification_type: createPatientForm.identification_number.trim()
            ? createPatientForm.identification_type
            : undefined,
          identification_number: createPatientForm.identification_number.trim() || undefined,
          phone_number: createPatientForm.phone_number.trim() || undefined,
          referral_source: createPatientForm.referral_source,
          referred_from_facility: createPatientForm.referred_from_facility.trim() || undefined,
          payment_mode: createPatientForm.payment_mode,
          insurance_provider: createPatientForm.insurance_provider.trim() || undefined,
          insurance_member_number: createPatientForm.insurance_member_number.trim() || undefined,
          consent_given: createPatientForm.consent_choice === 'given',
          consent_deferred: createPatientForm.consent_choice === 'deferred',
          sha_number: createPatientForm.sha_number.trim() || undefined,
          household_number: createPatientForm.household_number.trim() || undefined,
          principal_national_id: createPatientForm.principal_national_id.trim() || undefined,
        },
      });

      if (!createdPatient) {
        throw new Error('Patient creation did not return a patient record.');
      }

      setPatientId(createdPatient.id);
      setSearchPatients((prev) => pickUniquePatients([createdPatient, ...prev]));
      setPatientSearchTerm(patientLabel(createdPatient));
      setIsCreatePatientSheetOpen(false);
      setDuplicateCheckArmed(false);
      setDuplicateCheckMatches([]);
      toast({
        title: 'Patient created',
        description: `${patientLabel(createdPatient)} is now selected for this enrollment.`,
      });
    } catch (error) {
      toast({
        title: 'Failed to create patient',
        description: getApiErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const runPatientMatching = async (result: VerifyViaHealthcloudResult) => {
    const view = buildHealthcloudEligibilityView(result);
    const member = view?.member ?? {};
    const fullName = String(member.names || '').trim();
    const firstName = String(member.firstName || member.first_name || '').trim();
    const lastName = String(member.lastName || member.last_name || '').trim();
    const idCandidate = String(
      member.identification_number ||
        member.identificationNumber ||
        member.idNumber ||
        member.id_number ||
        member.national_id ||
        member.nationalId ||
        ''
    ).trim();
    const idLast4 = digitsOnly(idCandidate).slice(-4);
    const query = [fullName || [firstName, lastName].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(' ')
      .trim();

    setPatientMatchingLoading(true);
    try {
      const matchedByName = query
        ? await patientsApi.getPatients({ search: query, page_size: 30 })
        : { results: [] };
      const ranked = (matchedByName.results ?? [])
        .map((patient) => ({
          patient,
          score: scorePatientCandidate(patient, fullName, firstName, lastName, idLast4),
        }))
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((row) => ({
          patient: row.patient,
          score: row.score,
          confidence: scoreToConfidence(row.score),
        }));

      setSuggestedPatients(ranked.slice(0, 6));
      setSearchPatients([]);
      if (query) setPatientSearchTerm(query);
    } catch {
      setSuggestedPatients([]);
      setSearchPatients([]);
    } finally {
      setPatientMatchingLoading(false);
    }
  };

  const handleSearchPatients = async () => {
    if (patientSearchTerm.trim().length < 2) {
      toast({
        title: 'Search term too short',
        description: 'Enter at least 2 characters to search local patients.',
        variant: 'destructive',
      });
      return;
    }
    setPatientMatchingLoading(true);
    try {
      const response = await patientsApi.getPatients({
        search: patientSearchTerm.trim(),
        page_size: 20,
      });
      setSearchPatients(response.results ?? []);
    } catch {
      toast({
        title: 'Patient search failed',
        description: 'Could not search local patients right now.',
        variant: 'destructive',
      });
      setSearchPatients([]);
    } finally {
      setPatientMatchingLoading(false);
    }
  };

  const handleVerifyEligibility = async () => {
    if (!providerId || !memberNumber) {
      toast({
        title: 'Missing fields',
        description: 'Provider and member number are required for eligibility check.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const result = await verifyPreview.mutateAsync({
        provider: Number(providerId),
        member_number: memberNumber,
        policy_number: policyNumber || undefined,
      });
      setEligibilityResult(result);

      if (typeof result.resolved_plan_id === 'number' && result.resolved_plan_id > 0) {
        setPlanId(String(result.resolved_plan_id));
      } else {
        const resolvedPlan = resolvePlanFromEligibility(result);
        if (resolvedPlan) {
          setPlanId(String(resolvedPlan.id));
        }
      }

      const nextEligibilityView = buildHealthcloudEligibilityView(result);
      const policyNumberFromEligibility = nextEligibilityView?.cover?.policyNumber;
      if (typeof policyNumberFromEligibility === 'string' && policyNumberFromEligibility) {
        setPolicyNumber(policyNumberFromEligibility);
      }
      const validFromFromEligibility = nextEligibilityView?.cover?.validFrom;
      if (typeof validFromFromEligibility === 'string' && validFromFromEligibility) {
        setValidFrom(validFromFromEligibility.slice(0, 10));
      }
      const validToFromEligibility = nextEligibilityView?.cover?.validTo;
      if (typeof validToFromEligibility === 'string' && validToFromEligibility) {
        setValidTo(validToFromEligibility.slice(0, 10));
      }
      if (result.member_number) {
        setMemberNumber(result.member_number);
      }

      await runPatientMatching(result);

      toast({
        title: result.eligible ? 'Eligible' : 'Not eligible',
        description: result.message,
        variant: result.eligible ? 'default' : 'destructive',
      });
    } catch {
      toast({ title: 'Error', description: 'Eligibility check failed.', variant: 'destructive' });
    }
  };

  const handleCreate = async () => {
    if (!isEligibilityChecked) {
      toast({
        title: 'Eligibility required',
        description:
          'Run HealthCloud eligibility first. Enrollment details are populated from that response.',
        variant: 'destructive',
      });
      return;
    }
    if (!patientId || !effectivePlanId || !memberNumber || !providerId) {
      toast({
        title: 'Missing fields',
        description: 'Patient, payer, plan, and member number are required.',
        variant: 'destructive',
      });
      return;
    }
    if (duplicateEnrollmentInlineError) {
      toast({
        title: 'Duplicate active enrollment',
        description: duplicateEnrollmentInlineError,
        variant: 'destructive',
      });
      return;
    }
    try {
      setCreateEnrollmentError(null);
      await createEnrollment.mutateAsync({
        patient: patientId,
        plan: Number(effectivePlanId),
        member_number: memberNumber,
        policy_number: policyNumber || undefined,
        status: eligibilityResult
          ? eligibilityResult.eligible
            ? 'active'
            : 'pending_verification'
          : undefined,
        annual_balance: eligibilityResult?.annual_balance ?? undefined,
        valid_from: validFrom,
        valid_to: validTo,
        card_image_front: cardImageFront || undefined,
        card_image_back: cardImageBack || undefined,
        notes: notes || undefined,
      });
      toast({ title: 'Enrollment created' });
      router.push('/insurance/enrollments');
    } catch (error) {
      const message = getApiErrorMessage(error) || 'Failed to create enrollment.';
      setCreateEnrollmentError(message);
      toast({ title: 'Enrollment not created', description: message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Insurance Enrollment"
        helpContent="Link a patient to an insurance plan."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enrollment Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>
              {isEligibilityChecked ? 'Payer (from eligibility)' : 'Payer to check eligibility'}
            </Label>
            {isEligibilityChecked ? (
              <Input value={selectedProvider?.name || 'Unknown payer'} readOnly />
            ) : (
              <Select
                value={providerId}
                onValueChange={(value) => {
                  setProviderId(value);
                  setPlanId('');
                  setPatientId(null);
                  setSuggestedPatients([]);
                  setSearchPatients([]);
                  setEligibilityResult(null);
                  setPolicyNumber('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payer" />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((provider) => (
                    <SelectItem key={provider.id} value={String(provider.id)}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {providerId && (
              <p className="mt-1 text-xs text-muted-foreground">
                Payer Slade Code: {selectedProviderConfig?.payer_slade_code ?? 'Not configured'}
              </p>
            )}
          </div>
          <div>
            <Label>Member Number</Label>
            <Input
              value={memberNumber}
              onChange={(e) => {
                setMemberNumber(e.target.value);
                setEligibilityResult(null);
                setPlanId('');
                setPatientId(null);
                setSuggestedPatients([]);
                setSearchPatients([]);
              }}
            />
          </div>

          {isEligibilityChecked && (
            <>
              <div className="space-y-3 rounded-md border p-3 md:col-span-2">
                <div>
                  <Label>2. Match Local Patient</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Suggestions are ranked using HealthCloud names plus partial ID-number comparison
                    where available.
                  </p>
                </div>

                {patientMatchingLoading && (
                  <p className="text-sm text-muted-foreground">Finding matching patients...</p>
                )}

                {!patientMatchingLoading && suggestedPatients.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Suggested matches</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestedPatients.map((candidate) => (
                        <Button
                          key={candidate.patient.id}
                          type="button"
                          variant={patientId === candidate.patient.id ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setPatientId(candidate.patient.id)}
                          className="gap-2"
                        >
                          <span>
                            {patientLabel(candidate.patient)} ({candidate.patient.mrn})
                          </span>
                          {patientId === candidate.patient.id && (
                            <CheckCircle2 className="h-4 w-4 text-green-400" />
                          )}
                          <Badge className={confidenceClasses[candidate.confidence]}>
                            {candidate.confidence}
                          </Badge>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                  <Input
                    value={patientSearchTerm}
                    onChange={(e) => setPatientSearchTerm(e.target.value)}
                    placeholder="Search patient by name or MRN"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleSearchPatients()}
                    disabled={patientMatchingLoading}
                  >
                    Search Patients
                  </Button>
                </div>

                {!patientMatchingLoading && !hasPatientMatches && (
                  <div className="rounded-md border border-dashed p-3">
                    <p className="text-sm">No matching local patient found yet.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Create the patient here and continue enrollment without leaving this page.
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-3"
                      onClick={openCreatePatientSheet}
                    >
                      Create New Patient
                    </Button>
                  </div>
                )}

                {!patientMatchingLoading && searchPatients.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Search results</p>
                    <div className="flex flex-wrap gap-2">
                      {uniqueSearchPatients.map((candidate) => (
                        <Button
                          key={`search-${candidate.id}`}
                          type="button"
                          variant={patientId === candidate.id ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setPatientId(candidate.id)}
                        >
                          {patientLabel(candidate)} ({candidate.mrn})
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {patientId && <Badge variant="secondary">Selected patient ID: {patientId}</Badge>}
              </div>

              <div>
                <Label>Plan (from eligibility)</Label>
                <Input value={resolvedPlanLabel} readOnly />
              </div>
              <div>
                <Label>Policy Number</Label>
                <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} />
              </div>
              <div>
                <Label>Valid From</Label>
                <Input
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              </div>
              <div>
                <Label>Valid To</Label>
                <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
              </div>
              <div>
                <Label>Card Image Front (optional)</Label>
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleCardImageChange('front', e.target.files?.[0] ?? null)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  JPG, PNG, or WEBP up to {MAX_CARD_IMAGE_SIZE_MB} MB.
                </p>
                {cardImageFrontPreview && (
                  <Image
                    src={cardImageFrontPreview}
                    alt="Card front preview"
                    width={640}
                    height={256}
                    unoptimized
                    className="mt-2 h-32 w-full rounded border bg-muted object-contain"
                  />
                )}
              </div>
              <div>
                <Label>Card Image Back (optional)</Label>
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleCardImageChange('back', e.target.files?.[0] ?? null)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  JPG, PNG, or WEBP up to {MAX_CARD_IMAGE_SIZE_MB} MB.
                </p>
                {cardImageBackPreview && (
                  <Image
                    src={cardImageBackPreview}
                    alt="Card back preview"
                    width={640}
                    height={256}
                    unoptimized
                    className="mt-2 h-32 w-full rounded border bg-muted object-contain"
                  />
                )}
              </div>
              <div className="md:col-span-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any enrollment notes"
                />
              </div>
            </>
          )}
          {eligibilityResult && (
            <div className="space-y-3 md:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Eligibility loaded</Badge>
                {eligibilityResult.eligible ? (
                  <Badge className="bg-green-100 text-green-800">Eligible</Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800">Not eligible</Badge>
                )}
                <Badge variant="outline">Member: {eligibilityResult.member_number || 'N/A'}</Badge>
              </div>

              <HealthcloudEligibilityCards
                eligibility={eligibilityResult}
                patientName={undefined}
              />

              <p className="text-xs text-muted-foreground">
                Session step starts after enrollment creation. Use "Start Session" on the
                enrollments page to launch OTP and visit authorization.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 md:col-span-2">
            {!isEligibilityChecked && (
              <Button
                variant="secondary"
                onClick={() => void handleVerifyEligibility()}
                disabled={verifyPreview.isPending}
              >
                {verifyPreview.isPending ? 'Checking...' : '1. Run Eligibility Precheck'}
              </Button>
            )}
            <Button variant="outline" onClick={() => router.push('/insurance/enrollments')}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                createEnrollment.isPending ||
                !isEligibilityChecked ||
                !isEligibilityEligible ||
                !!duplicateEnrollmentInlineError ||
                !patientId ||
                !effectivePlanId
              }
            >
              {createEnrollment.isPending ? 'Creating...' : 'Create Enrollment'}
            </Button>
          </div>
          <div className="md:col-span-2">
            {createEnrollment.isPending ? (
              <p className="text-xs text-muted-foreground">Creating enrollment...</p>
            ) : eligibilityInlineError ? (
              <p className="text-xs text-red-700">Eligibility failed: {eligibilityInlineError}</p>
            ) : duplicateEnrollmentInlineError ? (
              <p className="text-xs text-red-700">{duplicateEnrollmentInlineError}</p>
            ) : createEnrollmentError ? (
              <p className="text-xs text-red-700">{createEnrollmentError}</p>
            ) : missingRequirements.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                To enable Create Enrollment: {missingRequirements.join(', ')}.
              </p>
            ) : (
              <p className="text-xs text-green-700">Ready to create enrollment.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Sheet open={isCreatePatientSheetOpen} onOpenChange={setIsCreatePatientSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Create patient</SheetTitle>
            <SheetDescription>
              Add a local patient record and continue enrollment with the new patient selected.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>First Name</Label>
                <Input
                  value={createPatientForm.first_name}
                  onChange={(e) =>
                    setInlinePatientForm((prev) => ({ ...prev, first_name: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Middle Name (optional)</Label>
                <Input
                  value={createPatientForm.middle_name}
                  onChange={(e) =>
                    setInlinePatientForm((prev) => ({ ...prev, middle_name: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input
                  value={createPatientForm.last_name}
                  onChange={(e) =>
                    setInlinePatientForm((prev) => ({ ...prev, last_name: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={createPatientForm.date_of_birth}
                  onChange={(e) =>
                    setInlinePatientForm((prev) => ({ ...prev, date_of_birth: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Gender</Label>
                <Select
                  value={createPatientForm.gender || undefined}
                  onValueChange={(value) =>
                    setInlinePatientForm((prev) => ({ ...prev, gender: value as 'M' | 'F' | 'O' }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Male</SelectItem>
                    <SelectItem value="F">Female</SelectItem>
                    <SelectItem value="O">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>ID Type</Label>
                <Select
                  value={createPatientForm.identification_type}
                  onValueChange={(value) =>
                    setInlinePatientForm((prev) => ({
                      ...prev,
                      identification_type: value as IdentificationType,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select ID type" />
                  </SelectTrigger>
                  <SelectContent>
                    {identificationTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>ID Number (optional)</Label>
                <Input
                  value={createPatientForm.identification_number}
                  onChange={(e) =>
                    setInlinePatientForm((prev) => ({
                      ...prev,
                      identification_number: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Phone Number (optional)</Label>
                <Input
                  value={createPatientForm.phone_number}
                  onChange={(e) =>
                    setInlinePatientForm((prev) => ({ ...prev, phone_number: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Citizenship</Label>
                <Popover open={nationalityOpen} onOpenChange={setNationalityOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={nationalityOpen}
                      className={cn(
                        'w-full justify-between',
                        !createPatientForm.citizenship && 'text-muted-foreground'
                      )}
                    >
                      {createPatientForm.citizenship || 'Select citizenship'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] p-0"
                    align="start"
                  >
                    <Command>
                      <CommandInput placeholder="Search citizenship..." />
                      <CommandList>
                        <CommandEmpty>No nationality found.</CommandEmpty>
                        <CommandGroup className="max-h-[260px] overflow-y-auto">
                          {NATIONALITIES.map((nationality) => (
                            <CommandItem
                              key={nationality}
                              value={nationality}
                              onSelect={() => {
                                setInlinePatientForm((prev) => ({
                                  ...prev,
                                  citizenship: nationality,
                                }));
                                setNationalityOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  createPatientForm.citizenship === nationality
                                    ? 'opacity-100'
                                    : 'opacity-0'
                                )}
                              />
                              {nationality}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Place of Birth (optional)</Label>
                <Input
                  value={createPatientForm.place_of_birth}
                  onChange={(e) =>
                    setInlinePatientForm((prev) => ({ ...prev, place_of_birth: e.target.value }))
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Address (optional)</Label>
                <Input
                  value={createPatientForm.address}
                  onChange={(e) =>
                    setInlinePatientForm((prev) => ({ ...prev, address: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Village / Estate (optional)</Label>
                <Input
                  value={createPatientForm.village}
                  onChange={(e) =>
                    setInlinePatientForm((prev) => ({ ...prev, village: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>County</Label>
                <Select
                  value={createPatientForm.county || undefined}
                  onValueChange={(value) =>
                    setInlinePatientForm((prev) => ({ ...prev, county: value, sub_county: '' }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select county" />
                  </SelectTrigger>
                  <SelectContent>
                    {counties.map((county) => (
                      <SelectItem key={county.id} value={String(county.id)}>
                        {county.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sub-county</Label>
                <Select
                  value={createPatientForm.sub_county || undefined}
                  onValueChange={(value) =>
                    setInlinePatientForm((prev) => ({ ...prev, sub_county: value }))
                  }
                  disabled={!createPatientForm.county}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        createPatientForm.county ? 'Select sub-county' : 'Select county first'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {subCounties.map((subCounty) => (
                      <SelectItem key={subCounty.id} value={String(subCounty.id)}>
                        {subCounty.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Referral Source</Label>
                <Select
                  value={createPatientForm.referral_source}
                  onValueChange={(value) =>
                    setInlinePatientForm((prev) => ({
                      ...prev,
                      referral_source: value as 'self' | 'clinic' | 'other_facility',
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Self</SelectItem>
                    <SelectItem value="clinic">Clinic</SelectItem>
                    <SelectItem value="other_facility">Other Facility</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>
                  Referred From Facility{' '}
                  {createPatientForm.referral_source === 'other_facility' ? '' : '(optional)'}
                </Label>
                <Input
                  value={createPatientForm.referred_from_facility}
                  onChange={(e) =>
                    setInlinePatientForm((prev) => ({
                      ...prev,
                      referred_from_facility: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Consent Status</Label>
                <Select
                  value={createPatientForm.consent_choice || undefined}
                  onValueChange={(value) =>
                    setInlinePatientForm((prev) => ({
                      ...prev,
                      consent_choice: value as 'given' | 'deferred',
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select consent status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="given">Consent Given</SelectItem>
                    <SelectItem value="deferred">Consent Deferred</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payment Mode</Label>
                <Select
                  value={createPatientForm.payment_mode}
                  onValueChange={(value) =>
                    setInlinePatientForm((prev) => ({
                      ...prev,
                      payment_mode: value as InlinePatientFormData['payment_mode'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="sha">SHA</SelectItem>
                    <SelectItem value="insurance_private">Private Insurance</SelectItem>
                    <SelectItem value="insurance_corporate">Corporate Insurance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Insurance Provider (optional)</Label>
                <Input
                  value={createPatientForm.insurance_provider}
                  onChange={(e) =>
                    setInlinePatientForm((prev) => ({
                      ...prev,
                      insurance_provider: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Insurance Member Number (optional)</Label>
                <Input
                  value={createPatientForm.insurance_member_number}
                  onChange={(e) =>
                    setInlinePatientForm((prev) => ({
                      ...prev,
                      insurance_member_number: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label>SHA Number (optional)</Label>
                <Input
                  value={createPatientForm.sha_number}
                  onChange={(e) =>
                    setInlinePatientForm((prev) => ({ ...prev, sha_number: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Household Number (optional)</Label>
                <Input
                  value={createPatientForm.household_number}
                  onChange={(e) =>
                    setInlinePatientForm((prev) => ({ ...prev, household_number: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Principal National ID (optional)</Label>
                <Input
                  value={createPatientForm.principal_national_id}
                  onChange={(e) =>
                    setInlinePatientForm((prev) => ({
                      ...prev,
                      principal_national_id: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            {duplicateCheckMatches.length > 0 && (
              <div className="space-y-2 rounded-md border border-yellow-300 bg-yellow-50 p-3">
                <p className="text-sm font-medium text-yellow-900">
                  Possible duplicate records found
                </p>
                <div className="space-y-1">
                  {duplicateCheckMatches.map((candidate) => (
                    <p key={`dup-${candidate.id}`} className="text-xs text-yellow-900">
                      {candidate.full_name || patientLabel(candidate)} ({candidate.mrn})
                    </p>
                  ))}
                </div>
                <p className="text-xs text-yellow-800">
                  If this is truly a different person, click Create Anyway.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreatePatientSheetOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleInlineCreatePatient()}
                disabled={createPatient.isPending}
              >
                {createPatient.isPending
                  ? 'Creating...'
                  : duplicateCheckArmed
                    ? 'Create Anyway'
                    : 'Create Patient'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
