/**
 * Enhanced Patient Registration Form
 *
 * Features:
 * - Flexible ID type selection (clickable label)
 * - Auto CR (Client Registry) lookup on ID input
 * - Form field freezing during CR lookup
 * - Consent confirmation dialog
 * - Read-only CR number field
 * - Payment mode selection (Cash, SHA, Insurance)
 * - Address field
 * - Kenya Data Protection Act 2019 compliance
 */
'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarIcon, Loader2, CheckCircle2, AlertCircle, Info, Search, Lock, CreditCard, Building2, Wallet, ChevronDown, HelpCircle, ChevronsUpDown, Check, Ban, ChevronLeft, ChevronRight, Eye, BadgeCheck, XCircle, Users } from 'lucide-react';
import { SHALogo } from '@/components/ui/sha-logo';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import DatePicker from '@/components/ui/date-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { LocationCombobox } from '@/components/ui/location-combobox';
import { HelpPopover } from '@/components/shared/help-popover';
import { IdentificationInput } from './identification-input';
import { ConsentConfirmationDialog, type ConsentDecision } from './consent-confirmation-dialog';
import { SHAPrincipalConfirmationDialog, type SHAPrincipalDecision } from './sha-principal-confirmation-dialog';
import { DuplicatePatientAlert } from './duplicate-patient-alert';
import { DuplicatePatientModal } from './duplicate-patient-modal';
import { cn } from '@/lib/utils';
import { useCounties, useSubCounties, useWards } from '@/lib/hooks/use-locations';
import { useToast } from '@/lib/hooks/use-toast';
import { shaApi } from '@/lib/api/sha';
import { patientsApi } from '@/lib/api/patients';
import { GENDER_OPTIONS, REFERRAL_SOURCE_OPTIONS, RELATIONSHIP_OPTIONS } from '@/lib/utils/constants';
import { NATIONALITIES, NATIONALITY_OPTIONS } from '@/lib/utils/nationalities';
import {
  type PatientCreateData,
  type IdentificationType,
  type PatientTitle,
  type PaymentMode,
  type DuplicateCheckResult,
  type DuplicateMatch,
  IDENTIFICATION_TYPE_OPTIONS,
  TITLE_OPTIONS,
  PAYMENT_MODE_OPTIONS,
} from '@/lib/types/patient';
import type { ClientRegistryClient, DirectEligibilityCheckResponse } from '@/lib/types/sha';
import { PaymentMethodCarousel } from './payment-method-carousel';

// Debounce hook for auto-search
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Validation schema
const patientFormSchema = z.object({
  // Identification (at the top)
  identification_type: z.enum(['national_id', 'cr_number', 'mandate_number', 'alien_id', 'kra_pin', 'temporary_id', 'passport']).default('national_id'),
  identification_number: z.string()
    .max(15, 'ID number cannot exceed 15 characters')
    .regex(/^[a-zA-Z0-9-]*$/, 'ID can only contain letters, numbers, and dashes')
    .optional(),
  cr_number: z.string().optional(), // Read-only, populated from CR lookup
  sha_number: z.string().optional(), // Read-only, populated from SHA lookup

  // Personal Information
  title: z.enum(['Mr', 'Mrs', 'Miss', 'Ms', 'Dr', 'Prof', 'Hon', 'Rev', '']).optional(),
  first_name: z.string().min(1, 'First name is required').max(100),
  middle_name: z.string().optional(),
  last_name: z.string().min(1, 'Last name is required').max(100),
  date_of_birth: z.date({
    required_error: 'Date of birth is required',
  }).refine((date) => date <= new Date(), {
    message: 'Date of birth cannot be in the future',
  }),
  place_of_birth: z.string().optional(),
  gender: z.enum(['M', 'F', 'O'], {
    required_error: 'Gender is required',
  }),
  nationality: z.string().default('Kenyan'),
  is_person_with_disability: z.boolean().default(false),

  // Contact Information
  phone_number: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  address: z.string().optional(),

  // Location
  county: z.number({
    required_error: 'County is required',
  }),
  sub_county: z.number({
    required_error: 'Sub-county is required',
  }),
  ward: z.number().optional(),
  village: z.string().optional(),

  // Payment
  payment_mode: z.enum(['cash', 'sha', 'insurance_private', 'insurance_corporate']).default('cash'),
  insurance_provider: z.string().optional(),
  insurance_member_number: z.string().optional(),

  // Emergency Contact
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  emergency_contact_relationship: z.string().optional(),

  // Referral
  referral_source: z.enum(['self', 'clinic', 'other_facility']).optional(),
  referred_from_facility: z.string().optional(),

  // Consent
  consent_given: z.boolean().default(false),
  consent_deferred: z.boolean().default(false),
});

// Add refinement for conditional validation
const patientFormSchemaRefined = patientFormSchema.refine(
  (data) => {
    // If referral_source is 'other_facility', referred_from_facility is required
    if (data.referral_source === 'other_facility') {
      return !!data.referred_from_facility && data.referred_from_facility.trim().length > 0;
    }
    return true;
  },
  {
    message: "Facility name is required when referral source is 'Other Facility'.",
    path: ['referred_from_facility'],
  }
);

type PatientFormValues = z.infer<typeof patientFormSchema>;

interface PatientFormProps {
  onSubmit: (data: PatientCreateData) => void;
  onCancel: () => void;
  isLoading?: boolean;
  defaultValues?: Partial<PatientFormValues>;
  /** Pre-populated CR client from external lookup */
  prePopulatedClient?: ClientRegistryClient | null;
  isEditing?: boolean;
}

// Payment mode icons - using muted foreground for consistent theming
const PAYMENT_MODE_ICONS: Record<PaymentMode, React.ReactNode> = {
  cash: <Wallet className="h-4 w-4 text-success" />,
  sha: <SHALogo size="sm" />,
  insurance_private: <CreditCard className="h-4 w-4 text-accent-foreground" />,
  insurance_corporate: <Building2 className="h-4 w-4 text-warning-foreground" />,
};

export function PatientForm({
  onSubmit,
  onCancel,
  isLoading,
  defaultValues,
  prePopulatedClient,
  isEditing = false
}: PatientFormProps) {
  const { toast } = useToast();

  // Prevent double submission
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);

  // CR Lookup state
  const [isSearchingCR, setIsSearchingCR] = useState(false);
  const [crClient, setCrClient] = useState<ClientRegistryClient | null>(prePopulatedClient || null);
  const [crSearched, setCrSearched] = useState(false);
  const [formLocked, setFormLocked] = useState(false);

  // Consent dialog state
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<PatientFormValues | null>(null);

  // SHA Eligibility state - tracks if patient is eligible for SHA coverage
  const [shaEligibility, setShaEligibility] = useState<{
    checked: boolean;
    isEligible: boolean;
    reason?: string;
    details?: DirectEligibilityCheckResponse;
  }>({ checked: false, isEligible: true });
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);

  // SHA Details dialog state
  const [showShaDetailsDialog, setShowShaDetailsDialog] = useState(false);

  // SHA Principal Confirmation dialog state
  const [showShaPrincipalDialog, setShowShaPrincipalDialog] = useState(false);
  const [pendingShaDetails, setPendingShaDetails] = useState<DirectEligibilityCheckResponse | null>(null);

  // Nationality combobox state
  const [nationalityOpen, setNationalityOpen] = useState(false);

  // UI state
  const [dobPopoverOpen, setDobPopoverOpen] = useState(false);
  const [showCustomRelationship, setShowCustomRelationship] = useState(false);
  const [customRelationship, setCustomRelationship] = useState('');

  // Duplicate check state - for detecting existing patients
  const [duplicateCheckResult, setDuplicateCheckResult] = useState<DuplicateCheckResult | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);

  const form = useForm<PatientFormValues>({
    resolver: zodResolver(patientFormSchemaRefined),
    defaultValues: {
      identification_type: 'national_id',
      identification_number: '',
      cr_number: '',
      sha_number: '',
      title: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      place_of_birth: '',
      gender: undefined,
      nationality: 'Kenyan',
      is_person_with_disability: false,
      phone_number: '',
      email: '',
      address: '',
      village: '',
      payment_mode: 'cash',
      insurance_provider: '',
      insurance_member_number: '',
      referral_source: 'self',
      referred_from_facility: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      emergency_contact_relationship: '',
      consent_given: false,
      consent_deferred: false,
      ...defaultValues,
    },
  });

  // Watch values for cascading selects and auto-search
  const selectedCounty = form.watch('county');
  const selectedSubCounty = form.watch('sub_county');
  const identificationType = form.watch('identification_type');
  const identificationNumber = form.watch('identification_number');
  const paymentMode = form.watch('payment_mode');
  const referralSource = form.watch('referral_source');

  // Watch demographic fields for duplicate checking
  const watchedFirstName = form.watch('first_name');
  const watchedLastName = form.watch('last_name');
  const watchedDob = form.watch('date_of_birth');
  const watchedGender = form.watch('gender');

  // Debounced identification number for auto-search
  const debouncedIdNumber = useDebounce(identificationNumber, 800);

  // Debounced name values for demographic duplicate check
  const debouncedFirstName = useDebounce(watchedFirstName, 600);
  const debouncedLastName = useDebounce(watchedLastName, 600);

  const { data: counties, isLoading: isLoadingCounties } = useCounties();
  const { data: subCounties, isLoading: isLoadingSubCounties } = useSubCounties(selectedCounty);
  const { data: wards, isLoading: isLoadingWards } = useWards(selectedSubCounty);

  // Define populateFromCRClient with useCallback
  const populateFromCRClient = useCallback((client: ClientRegistryClient) => {
    // Auto-populate form fields from CR client
    if (client.first_name) form.setValue('first_name', client.first_name);
    if (client.middle_name) form.setValue('middle_name', client.middle_name);
    if (client.last_name) form.setValue('last_name', client.last_name);
    if (client.date_of_birth) {
      const dob = new Date(client.date_of_birth);
      if (!isNaN(dob.getTime())) {
        form.setValue('date_of_birth', dob);
      }
    }
    if (client.gender) form.setValue('gender', client.gender);
    if (client.phone_number) form.setValue('phone_number', client.phone_number);
    if (client.email) form.setValue('email', client.email);
    if (client.client_number) form.setValue('cr_number', client.client_number);
    if (client.place_of_birth) form.setValue('place_of_birth', client.place_of_birth);
    if (client.citizenship) form.setValue('nationality', client.citizenship);
    if (client.is_person_with_disability !== undefined) {
      form.setValue('is_person_with_disability', client.is_person_with_disability);
    }
    if (client.address) form.setValue('address', client.address);
  }, [form]);

  // Populate form from SHA eligibility details (when no CR record exists)
  const populateFromShaDetails = useCallback((details: DirectEligibilityCheckResponse, dependentName?: string) => {
    // Set SHA number
    if (details.sha_number) {
      form.setValue('sha_number', details.sha_number);
    }

    // Parse name - could be from principal or dependent
    const fullName = dependentName || details.full_name;
    if (fullName) {
      const nameParts = fullName.trim().split(/\s+/);
      if (nameParts.length >= 1 && nameParts[0]) {
        form.setValue('first_name', nameParts[0]);
      }
      if (nameParts.length >= 3) {
        const middleName = nameParts.slice(1, -1).join(' ');
        const lastName = nameParts[nameParts.length - 1];
        if (middleName) form.setValue('middle_name', middleName);
        if (lastName) form.setValue('last_name', lastName);
      } else if (nameParts.length === 2 && nameParts[1]) {
        form.setValue('last_name', nameParts[1]);
      }
    }

    // Only auto-select SHA payment mode if eligible
    if (details.is_eligible) {
      form.setValue('payment_mode', 'sha');
    }
  }, [form]);

  // Handle SHA principal confirmation decision
  const handleShaPrincipalDecision = useCallback((decision: SHAPrincipalDecision, selectedDependent?: { name: string; sha_number?: string; date_of_birth?: string }) => {
    setShowShaPrincipalDialog(false);

    if (decision === 'cancelled') {
      // User wants to enter manually, just set SHA number if available
      if (pendingShaDetails?.sha_number) {
        form.setValue('sha_number', pendingShaDetails.sha_number);
      }
      setPendingShaDetails(null);
      return;
    }

    if (pendingShaDetails) {
      if (decision === 'confirmed') {
        // Principal is the patient - populate from SHA details
        populateFromShaDetails(pendingShaDetails);
        toast({
          title: 'Form Auto-Populated',
          description: pendingShaDetails.is_eligible
            ? 'Patient details filled from SHA records. Please verify and complete remaining fields.'
            : 'Patient details filled from SHA records (coverage not active). Please verify and complete remaining fields.',
        });
      } else if (decision === 'is_dependent' && selectedDependent) {
        // Selected a dependent - populate with dependent info
        if (selectedDependent.sha_number) {
          form.setValue('sha_number', selectedDependent.sha_number);
        }
        if (selectedDependent.name) {
          const nameParts = selectedDependent.name.trim().split(/\s+/);
          if (nameParts.length >= 1 && nameParts[0]) {
            form.setValue('first_name', nameParts[0]);
          }
          if (nameParts.length >= 3) {
            const middleName = nameParts.slice(1, -1).join(' ');
            const lastName = nameParts[nameParts.length - 1];
            if (middleName) form.setValue('middle_name', middleName);
            if (lastName) form.setValue('last_name', lastName);
          } else if (nameParts.length === 2 && nameParts[1]) {
            form.setValue('last_name', nameParts[1]);
          }
        }
        if (selectedDependent.date_of_birth) {
          const dob = new Date(selectedDependent.date_of_birth);
          if (!isNaN(dob.getTime())) {
            form.setValue('date_of_birth', dob);
          }
        }
        // Only auto-select SHA payment mode if eligible
        if (pendingShaDetails.is_eligible) {
          form.setValue('payment_mode', 'sha');
        }
        toast({
          title: 'Dependent Selected',
          description: pendingShaDetails.is_eligible
            ? `Patient details filled for ${selectedDependent.name}. Please verify and complete remaining fields.`
            : `Patient details filled for ${selectedDependent.name} (coverage not active). Please verify and complete remaining fields.`,
        });
      }
    }

    setPendingShaDetails(null);
  }, [form, pendingShaDetails, populateFromShaDetails, toast]);

  // Define performCRLookup with useCallback
  // Returns { found: boolean, idType, idNumber } to allow caller to check eligibility
  // Enhanced: Also checks local patients for duplicates
  const performCRLookup = useCallback(async (idType: IdentificationType, idNumber: string): Promise<{ found: boolean; idType: IdentificationType; idNumber: string } | null> => {
    if (!idNumber || idNumber.length < 5) return null;

    setIsSearchingCR(true);
    setFormLocked(true);
    // Reset duplicate state when starting new lookup
    setDuplicateCheckResult(null);
    setDuplicateAcknowledged(false);

    try {
      // Build the request based on ID type - always use identification_type/identification_number
      const request: Record<string, string> = {};

      // Map our internal ID types to DHA API identification_type values
      const idTypeMap: Record<IdentificationType, string> = {
        national_id: 'National ID',
        passport: 'Passport',
        cr_number: 'SHA Number',
        alien_id: 'Alien ID',
        kra_pin: 'KRA PIN',
        mandate_number: 'Mandate Number',
        temporary_id: 'Temporary ID',
      };

      request.identification_type = idTypeMap[idType] || idType;
      request.identification_number = idNumber;

      // Run CR lookup and local duplicate check in parallel
      // Use Promise.allSettled so failures in one don't block the other
      const [crResult, duplicateResult] = await Promise.allSettled([
        shaApi.fetchFromClientRegistry(request),
        patientsApi.checkDuplicate({
          identification_number: idNumber,
          identification_type: idType,
        }),
      ]);

      setCrSearched(true);

      // Handle local duplicate check result (if successful)
      if (duplicateResult.status === 'fulfilled') {
        const duplicateData = duplicateResult.value;
        if (duplicateData.has_duplicate && duplicateData.matches.length > 0) {
          setDuplicateCheckResult(duplicateData);

          // If exact ID match, show modal immediately
          if (duplicateData.match_type === 'exact_id') {
            setShowDuplicateModal(true);
            toast({
              title: 'Patient Already Exists',
              description: `Found existing patient: ${duplicateData.matches[0]?.full_name ?? 'Unknown'}`,
              variant: 'destructive',
            });
          } else {
            // For demographic matches, just show inline alert
            toast({
              title: 'Potential Duplicate Found',
              description: `Found ${duplicateData.matches.length} patient(s) with similar details.`,
              variant: 'default',
            });
          }
        }
      } else {
        // Duplicate check failed - log but don't block the flow
        console.warn('Duplicate check failed:', duplicateResult.reason);
      }

      // Handle CR lookup result
      if (crResult.status === 'fulfilled') {
        const crResponse = crResult.value;
        if (crResponse.found && crResponse.client) {
          setCrClient(crResponse.client);

          // Only show CR toast if no exact local duplicate
          const hasDuplicate = duplicateResult.status === 'fulfilled' && duplicateResult.value.has_duplicate;
          const isExactMatch = duplicateResult.status === 'fulfilled' && duplicateResult.value.match_type === 'exact_id';
          if (!hasDuplicate || !isExactMatch) {
            toast({
              title: 'Client Registry Record Found',
              description: `Found record for ${crResponse.client.first_name} ${crResponse.client.last_name}. Fields will be auto-populated.`,
            });
          }

          populateFromCRClient(crResponse.client);

          return { found: true, idType, idNumber };
        } else {
          // Only show "no CR record" toast if no duplicates found
          const hasDuplicate = duplicateResult.status === 'fulfilled' && duplicateResult.value.has_duplicate;
          if (!hasDuplicate) {
            toast({
              title: 'No Record Found',
              description: 'No existing Client Registry record. A new record will be created upon registration.',
              variant: 'default',
            });
          }
          // Don't set eligibility here - we'll check directly with SHA API
          return { found: false, idType, idNumber };
        }
      } else {
        // CR lookup failed
        console.error('CR lookup failed:', crResult.reason);
        toast({
          title: 'Lookup Failed',
          description: 'Unable to search Client Registry. You can continue with manual entry.',
          variant: 'destructive',
        });
        return null;
      }
    } catch (error) {
      console.error('CR lookup failed:', error);
      toast({
        title: 'Lookup Failed',
        description: 'Unable to search Client Registry. You can continue with manual entry.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsSearchingCR(false);
      setFormLocked(false);
    }
  }, [toast, populateFromCRClient]);

  // Check SHA eligibility for the patient
  // When crFound is false and SHA details are found, show confirmation dialog
  const checkShaEligibility = useCallback(async (idType: IdentificationType, idNumber: string, crFound: boolean = false) => {
    if (!idNumber) return;

    setIsCheckingEligibility(true);
    try {
      // Build eligibility check request based on ID type
      const params: Record<string, string> = {};
      if (idType === 'national_id') {
        params.national_id = idNumber;
      } else if (idType === 'cr_number') {
        params.sha_number = idNumber;
      } else {
        params.identification_type = idType;
        params.identification_number = idNumber;
      }

      const response = await shaApi.checkDirectEligibility(params);

      setShaEligibility({
        checked: true,
        isEligible: response.is_eligible,
        reason: response.is_eligible
          ? undefined
          : response.reason || 'Patient is not eligible for SHA coverage',
        details: response,
      });

      // Always set SHA number if available
      if (response.sha_number) {
        form.setValue('sha_number', response.sha_number);
      }

      // If CR record was NOT found but SHA details are available, prompt user to confirm identity
      // Show dialog regardless of eligibility - user may want to populate form with member details
      if (!crFound && (response.full_name || response.sha_number)) {
        setPendingShaDetails(response);
        setShowShaPrincipalDialog(true);
        // Don't show the toast yet - wait for user confirmation
      } else if (crFound && response.is_eligible) {
        // CR record was found AND eligible - just show success toast
        toast({
          title: 'SHA Coverage Active',
          description: `Patient ${response.full_name || ''} has active SHA coverage.`,
        });
      }

      // If ineligible and SHA was selected, switch to cash
      if (!response.is_eligible) {
        const currentPaymentMode = form.getValues('payment_mode');
        if (currentPaymentMode === 'sha') {
          form.setValue('payment_mode', 'cash');
          toast({
            title: 'Payment Mode Changed',
            description: 'SHA coverage is not available. Switched to Cash payment.',
            variant: 'default',
          });
        }
      }
    } catch (error) {
      console.error('SHA eligibility check failed:', error);
      // On error, allow SHA as an option but show warning
      setShaEligibility({
        checked: true,
        isEligible: true, // Allow selection, verification will happen at claim time
        reason: undefined,
        details: undefined,
      });
    } finally {
      setIsCheckingEligibility(false);
    }
  }, [form, toast]);

  // Auto-search CR when ID number changes (debounced)
  useEffect(() => {
    if (
      debouncedIdNumber &&
      debouncedIdNumber.length >= 8 &&
      !crClient &&
      !crSearched &&
      !isEditing
    ) {
      performCRLookup(identificationType, debouncedIdNumber).then((result) => {
        // Always check SHA eligibility after CR lookup (regardless of whether CR found a record)
        // SHA eligibility is independent of Client Registry status
        if (result) {
          checkShaEligibility(result.idType, result.idNumber, result.found);
        }
      });
    }
  }, [debouncedIdNumber, identificationType, crClient, crSearched, isEditing, performCRLookup, checkShaEligibility]);

  // Pre-populate from external CR client
  useEffect(() => {
    if (prePopulatedClient && !crClient) {
      setCrClient(prePopulatedClient);
      populateFromCRClient(prePopulatedClient);
    }
  }, [prePopulatedClient, crClient, populateFromCRClient]);

  // Demographic duplicate check when name + DOB are filled (and no ID check was done)
  useEffect(() => {
    // Skip if:
    // - We already have an ID-based duplicate check result
    // - User acknowledged a previous duplicate
    // - Not enough data for search
    // - Editing existing patient
    if (
      isEditing ||
      duplicateAcknowledged ||
      (duplicateCheckResult && duplicateCheckResult.match_type === 'exact_id') ||
      !debouncedFirstName ||
      !debouncedLastName ||
      !watchedDob ||
      debouncedFirstName.length < 2 ||
      debouncedLastName.length < 2
    ) {
      return;
    }

    // If we already searched by ID and found results, skip demographic search
    if (duplicateCheckResult?.matches.length) {
      return;
    }

    // Format DOB for API
    let dobString: string | null = null;
    if (watchedDob instanceof Date) {
      dobString = format(watchedDob, 'yyyy-MM-dd');
    } else if (watchedDob) {
      // Handle case where watchedDob might be serialized as string (edge case)
      const dobValue = watchedDob as unknown;
      if (typeof dobValue === 'string' && dobValue.length >= 10) {
        dobString = dobValue.substring(0, 10);
      }
    }

    if (!dobString) return;

    // Run demographic duplicate check
    const checkDemographicDuplicates = async () => {
      try {
        const result = await patientsApi.checkDuplicate({
          first_name: debouncedFirstName,
          last_name: debouncedLastName,
          date_of_birth: dobString,
          gender: watchedGender || undefined,
        });

        if (result.has_duplicate && result.matches.length > 0) {
          setDuplicateCheckResult(result);
          toast({
            title: 'Similar Patient Found',
            description: `Found ${result.matches.length} patient(s) with similar name and date of birth.`,
            variant: 'default',
          });
        }
      } catch (error) {
        // Silently fail - demographic check is non-critical
        console.error('Demographic duplicate check failed:', error);
      }
    };

    checkDemographicDuplicates();
  }, [
    debouncedFirstName,
    debouncedLastName,
    watchedDob,
    watchedGender,
    isEditing,
    duplicateAcknowledged,
    duplicateCheckResult,
    toast,
  ]);

  const handleManualCRSearch = () => {
    const idNumber = form.getValues('identification_number');
    const idType = form.getValues('identification_type');

    if (idNumber && idNumber.length >= 5) {
      // Only reset crClient, NOT crSearched (to avoid triggering the auto-search useEffect)
      setCrClient(null);
      performCRLookup(idType, idNumber).then((result) => {
        // Always check SHA eligibility after CR lookup (regardless of whether CR found a record)
        if (result) {
          checkShaEligibility(result.idType, result.idNumber, result.found);
        }
      });
    } else {
      toast({
        title: 'Invalid ID',
        description: 'Please enter at least 5 characters for the ID number.',
        variant: 'destructive',
      });
    }
  };

  const handleFormSubmit = async (values: PatientFormValues) => {
    // Prevent double submission
    if (submitLockRef.current || isSubmitting) {
      return;
    }

    // If no consent given and not deferred, show consent dialog
    if (!values.consent_given && !values.consent_deferred) {
      setPendingFormData(values);
      setShowConsentDialog(true);
      return;
    }

    await submitForm(values);
  };

  const handleConsentDecision = async (decision: ConsentDecision) => {
    setShowConsentDialog(false);

    if (decision === 'cancelled') {
      setPendingFormData(null);
      return;
    }

    if (pendingFormData) {
      const updatedData = { ...pendingFormData };

      if (decision === 'granted') {
        updatedData.consent_given = true;
        updatedData.consent_deferred = false;
      } else if (decision === 'deferred') {
        updatedData.consent_given = false;
        updatedData.consent_deferred = true;

        toast({
          title: 'Consent Deferred',
          description: 'Patient consent must be obtained before discharge, claim submission, or encounter completion.',
          variant: 'default',
        });
      }

      await submitForm(updatedData);
    }
  };

  const submitForm = async (values: PatientFormValues) => {
    submitLockRef.current = true;
    setIsSubmitting(true);

    try {
      const data: PatientCreateData = {
        ...values,
        date_of_birth: format(values.date_of_birth, 'yyyy-MM-dd'),
        consent_date: values.consent_given ? new Date().toISOString() : undefined,
        // Include CR number if found
        cr_number: values.cr_number || crClient?.client_number,
        // Include SHA number if found
        sha_number: values.sha_number || shaEligibility.details?.sha_number || undefined,
      };

      await onSubmit(data);
    } finally {
      setTimeout(() => {
        submitLockRef.current = false;
        setIsSubmitting(false);
      }, 1000);
    }
  };

  const resetCRSearch = () => {
    setCrClient(null);
    setCrSearched(false);
    form.setValue('cr_number', '');
    form.setValue('sha_number', '');
  };

  const isFormLoading = isLoading || isSubmitting;

  // Handle form validation errors with toast
  const handleFormErrors = useCallback(() => {
    const errors = form.formState.errors;
    const errorFields: string[] = [];

    // Collect human-readable field names for required fields
    if (errors.first_name) errorFields.push('First Name');
    if (errors.last_name) errorFields.push('Last Name');
    if (errors.date_of_birth) errorFields.push('Date of Birth');
    if (errors.gender) errorFields.push('Gender');
    if (errors.county) errorFields.push('County');
    if (errors.sub_county) errorFields.push('Sub-County');

    if (errorFields.length > 0) {
      toast({
        title: 'Missing Required Fields',
        description: `Please fill in: ${errorFields.join(', ')}`,
        variant: 'destructive',
      });
    }
  }, [form.formState.errors, toast]);

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleFormSubmit, handleFormErrors)} className="space-y-6 sm:space-y-8">

          {/* ================================================================== */}
          {/* SECTION 1: Identification & CR Status (Top Priority) */}
          {/* ================================================================== */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Identification</h3>
              {isSearchingCR && (
                <Badge variant="secondary" className="animate-pulse">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Searching Client Registry...
                </Badge>
              )}
            </div>

            {/* CR Status Banner */}
            {crClient && (
              <Alert className="border-success bg-success/10">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <AlertTitle className="text-success">Client Registry Record Found</AlertTitle>
                <AlertDescription className="flex items-center justify-between">
                  <span>
                    <strong>{crClient.first_name} {crClient.last_name}</strong>
                    {crClient.client_number && ` • CR: ${crClient.client_number}`}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetCRSearch}
                  >
                    Clear
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {crSearched && !crClient && (
              <Alert className="border-warning bg-warning/10">
                <Info className="h-4 w-4 text-warning-foreground" />
                <AlertTitle className="text-warning-foreground">No Existing Record</AlertTitle>
                <AlertDescription>
                  A new Client Registry record will be created upon registration.
                </AlertDescription>
              </Alert>
            )}

            {/* Local Duplicate Patient Alert */}
            {duplicateCheckResult?.has_duplicate && !duplicateAcknowledged && (
              <DuplicatePatientAlert
                matches={duplicateCheckResult.matches}
                matchType={duplicateCheckResult.match_type}
                onSelectPatient={(patientId) => {
                  // Navigate to check-in page for the existing patient
                  window.location.href = `/patients/checkin?select=${patientId}`;
                }}
                onContinueAsNew={() => {
                  setDuplicateAcknowledged(true);
                  setShowDuplicateModal(false);
                }}
                showContinueOption={duplicateCheckResult.match_type !== 'exact_id'}
              />
            )}

            {/* SHA Eligibility Status Banner */}
            {isCheckingEligibility && (
              <Alert className="border-primary/30 bg-primary/5">
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
                <AlertTitle className="text-primary">Checking SHA Coverage...</AlertTitle>
                <AlertDescription className="text-primary/80">
                  Verifying patient eligibility with Social Health Authority.
                </AlertDescription>
              </Alert>
            )}

            {shaEligibility.checked && !isCheckingEligibility && shaEligibility.isEligible && shaEligibility.details && (
              <Alert className="border-success/30 bg-success/5">
                <BadgeCheck className="h-4 w-4 text-success" />
                <AlertTitle className="text-success">
                  <div className="flex items-center gap-2">
                    <span>Active SHA Coverage</span>
                    {/* Mobile: emoji only, Desktop: badge with text */}
                    <span className="sm:hidden text-lg" title="Eligible">👍</span>
                    <Badge variant="outline" className="hidden sm:inline-flex border-success/50 text-success bg-success/10 w-fit">
                      Eligible
                    </Badge>
                  </div>
                </AlertTitle>
                <AlertDescription className="flex items-center justify-between gap-2">
                  <span className="text-success/90">
                    {shaEligibility.details.full_name && (
                      <strong>{shaEligibility.details.full_name}</strong>
                    )}
                    {shaEligibility.details.sha_number && (
                      <span> • SHA#: {shaEligibility.details.sha_number}</span>
                    )}
                    {shaEligibility.details.copay_percentage !== undefined && shaEligibility.details.copay_percentage > 0 && (
                      <span> • Co-pay: {shaEligibility.details.copay_percentage}%</span>
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-success/50 text-success hover:bg-success/10 w-fit shrink-0"
                    onClick={() => setShowShaDetailsDialog(true)}
                    title="View SHA Details"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Ineligible: Has SHA number but coverage not active (RED) */}
            {shaEligibility.checked && !isCheckingEligibility && !shaEligibility.isEligible && shaEligibility.details?.sha_number && (
              <Alert className="border-destructive/30 bg-destructive/5">
                <XCircle className="h-4 w-4 text-destructive" />
                <AlertTitle className="text-destructive">
                  <div className="flex items-center gap-2">
                    <span>SHA Coverage Inactive</span>
                    {/* Mobile: emoji only, Desktop: badge with text */}
                    <span className="sm:hidden text-lg" title="Not Eligible">👎</span>
                    <Badge variant="outline" className="hidden sm:inline-flex border-destructive/50 text-destructive bg-destructive/10 w-fit">
                      Not Eligible
                    </Badge>
                  </div>
                </AlertTitle>
                <AlertDescription className="text-destructive/80">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {shaEligibility.reason || 'Patient SHA coverage is not active.'}
                      {shaEligibility.details?.possible_solution && (
                        <span className="block mt-1 text-sm">
                          <strong>Suggestion:</strong> {shaEligibility.details.possible_solution}
                        </span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-destructive/50 text-destructive hover:bg-destructive/10 w-fit shrink-0"
                      onClick={() => setShowShaDetailsDialog(true)}
                      title="View Details"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Unregistered: No SHA record found (AMBER) */}
            {shaEligibility.checked && !isCheckingEligibility && !shaEligibility.isEligible && !shaEligibility.details?.sha_number && (
              <Alert className="border-warning/30 bg-warning/5">
                <XCircle className="h-4 w-4 text-warning-foreground" />
                <AlertTitle className="text-warning-foreground">
                  <div className="flex items-center gap-2">
                    <span>Not Registered with SHA</span>
                    <Badge variant="outline" className="hidden sm:inline-flex border-warning/50 text-warning-foreground bg-warning/10 w-fit">
                      Unregistered
                    </Badge>
                  </div>
                </AlertTitle>
                <AlertDescription className="text-warning-foreground/80">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {shaEligibility.reason || 'Patient is not registered with Social Health Authority.'}
                      {shaEligibility.details?.possible_solution && (
                        <span className="block mt-1 text-sm">
                          <strong>Suggestion:</strong> {shaEligibility.details.possible_solution}
                        </span>
                      )}
                    </div>
                    {shaEligibility.details && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-warning/50 text-warning-foreground hover:bg-warning/10 w-fit shrink-0"
                        onClick={() => setShowShaDetailsDialog(true)}
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {/* ID Type + Number with clickable label */}
              <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                <FormField
                  control={form.control}
                  name="identification_number"
                  render={({ field }) => (
                    <FormItem>
                      <IdentificationInput
                        identificationType={identificationType}
                        identificationNumber={field.value || ''}
                        onTypeChange={(type) => {
                          form.setValue('identification_type', type);
                          resetCRSearch();
                        }}
                        onNumberChange={(value) => {
                          field.onChange(value);
                          if (crClient) resetCRSearch();
                        }}
                        disabled={formLocked || isFormLoading}
                        required
                        error={form.formState.errors.identification_number?.message}
                        onSearch={handleManualCRSearch}
                        isSearching={isSearchingCR}
                        minSearchLength={5}
                      />
                      <FormDescription>
                        Click the label to change ID type
                      </FormDescription>
                    </FormItem>
                  )}
                />
              </div>

              {/* CR Number (Read-only) */}
              <FormField
                control={form.control}
                name="cr_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Lock className="h-4 w-4" />
                      CR Number
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        readOnly
                        disabled
                        placeholder="Auto-populated"
                        className="bg-muted font-mono text-sm"
                      />
                    </FormControl>
                    <FormDescription>
                      Auto-assigned from registry
                    </FormDescription>
                  </FormItem>
                )}
              />

              {/* SHA Number (Read-only) */}
              <FormField
                control={form.control}
                name="sha_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1 text-teal-400">
                      <SHALogo size="sm" />
                      SHA Number
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        readOnly
                        disabled
                        placeholder="Auto-populated"
                        className="bg-secondary/5 border-secondary/20 font-mono text-sm text-teal-400"
                      />
                    </FormControl>
                    <FormDescription className="text-teal-400">
                      From SHA lookup
                    </FormDescription>
                  </FormItem>
                )}
              />
              {/* TODO : modularise all reusable components */}
              {/* Payment Method - Compact selector with dialog */}
              {/* Payment Method - Compact selector with dialog */}
              <FormField
                control={form.control}
                name="payment_mode"
                render={({ field }) => {
                  const selectedOption = PAYMENT_MODE_OPTIONS.find(o => o.value === field.value);
                  const isShaDisabled = shaEligibility.checked && !shaEligibility.isEligible;

                  return (
                    <FormItem>
                      <FormLabel>Payment Method *</FormLabel>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-between",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={formLocked || isFormLoading}
                          >
                            <div className="flex items-center gap-2">
                              {selectedOption && PAYMENT_MODE_ICONS[selectedOption.value]}
                              <span>{selectedOption?.label || "Select payment method"}</span>
                            </div>
                            <ChevronDown className="h-4 w-4 opacity-50" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-sm overflow-y-auto">
                          <DialogHeader>
                            <div className="flex items-center gap-2">
                              <DialogTitle>Select Payment Method</DialogTitle>
                              <HelpPopover content="Choose how the patient will pay for services. SHA requires active coverage." />
                            </div>
                            {isShaDisabled && (
                              <p className="text-sm text-warning-foreground mt-1">
                                ⚠️ SHA is unavailable: {shaEligibility.reason || 'Patient not eligible'}
                              </p>
                            )}
                          </DialogHeader>
                          <PaymentMethodCarousel
                            value={field.value}
                            onChange={field.onChange}
                            shaDisabled={isShaDisabled}
                            shaDisabledReason={shaEligibility.reason}
                          />
                        </DialogContent>
                      </Dialog>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>
          </div>

          <Separator />

          {/* ================================================================== */}
          {/* SECTION 2: Personal Information */}
          {/* ================================================================== */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Personal Information</h3>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="sm:col-span-1">
                    <FormLabel>Title</FormLabel>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          disabled={formLocked || isFormLoading}
                          className={cn(
                            "w-full justify-between font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value
                            ? TITLE_OPTIONS.find((t) => t.value === field.value)?.label
                            : "Select"}
                          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {TITLE_OPTIONS.map((option) => (
                          <DropdownMenuItem
                            key={option.value}
                            onSelect={() => field.onChange(option.value || 'none')}
                          >
                            {option.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter first name"
                        {...field}
                        disabled={formLocked || isFormLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="middle_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Middle Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter middle name"
                        {...field}
                        disabled={formLocked || isFormLoading}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter last name"
                        {...field}
                        disabled={formLocked || isFormLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 items-start">
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender *</FormLabel>
                    <FormControl>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-between"
                            disabled={formLocked || isFormLoading}
                          >
                            {field.value
                              ? GENDER_OPTIONS.find(opt => opt.value === field.value)?.label
                              : 'Select gender'
                            }
                            <ChevronDown className="h-4 w-4 opacity-50" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-full min-w-[140px]">
                          <DropdownMenuRadioGroup
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            {GENDER_OPTIONS.map((option) => (
                              <DropdownMenuRadioItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date_of_birth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of Birth *</FormLabel>
                    <DatePicker
                      value={field.value}
                      onChange={field.onChange}
                      disabled={formLocked || isFormLoading}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="place_of_birth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Place of Birth</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="County or City"
                        {...field}
                        disabled={formLocked || isFormLoading}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nationality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nationality</FormLabel>
                    <Popover open={nationalityOpen} onOpenChange={setNationalityOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={nationalityOpen}
                            className={cn(
                              'w-full justify-between',
                              !field.value && 'text-muted-foreground'
                            )}
                            disabled={formLocked || isFormLoading}
                          >
                            {field.value || 'Select nationality'}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[250px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search nationality..." />
                          <CommandList>
                            <CommandEmpty>No nationality found.</CommandEmpty>
                            <CommandGroup className="max-h-[300px] overflow-y-auto">
                              {NATIONALITIES.map((nationality) => (
                                <CommandItem
                                  key={nationality}
                                  value={nationality}
                                  onSelect={() => {
                                    field.onChange(nationality);
                                    setNationalityOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      field.value === nationality ? 'opacity-100' : 'opacity-0'
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_person_with_disability"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4 sm:mt-6">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={formLocked || isFormLoading}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="flex items-center gap-2">
                        PLWD
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Check if patient has a registered disability</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Separator />

          {/* ================================================================== */}
          {/* SECTION 3: Contact Information */}
          {/* ================================================================== */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Contact Information</h3>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <FormField
                control={form.control}
                name="phone_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="+254..."
                        {...field}
                        disabled={formLocked || isFormLoading}
                      />
                    </FormControl>
                    <FormDescription>Kenya format</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="email@example.com"
                        {...field}
                        disabled={formLocked || isFormLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Physical Address (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="P.O BOX, Street, Nearest Landmark, School, etc."
                        {...field}
                        disabled={formLocked || isFormLoading}
                        rows={2}
                        className="min-h-[60px] resize-y"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Separator />

          {/* ================================================================== */}
          {/* SECTION 4: Location */}
          {/* ================================================================== */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Location</h3>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <FormField
                control={form.control}
                name="county"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>County *</FormLabel>
                    <FormControl>
                      <LocationCombobox
                        options={counties?.map(c => ({ value: c.id.toString(), label: c.name })) || []}
                        value={field.value?.toString()}
                        onSelect={(value) => {
                          field.onChange(Number(value));
                          form.setValue('sub_county', undefined as unknown as number);
                          form.setValue('ward', undefined);
                        }}
                        placeholder="Select county"
                        searchPlaceholder="Search counties..."
                        emptyMessage="No county found."
                        isLoading={isLoadingCounties}
                        disabled={formLocked || isFormLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sub_county"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sub-County *</FormLabel>
                    <FormControl>
                      <LocationCombobox
                        options={subCounties?.map(sc => ({ value: sc.id.toString(), label: sc.name })) || []}
                        value={field.value?.toString()}
                        onSelect={(value) => {
                          field.onChange(Number(value));
                          form.setValue('ward', undefined);
                        }}
                        placeholder={!selectedCounty ? 'Select county first' : 'Select sub-county'}
                        searchPlaceholder="Search sub-counties..."
                        emptyMessage="No sub-county found."
                        disabled={!selectedCounty || formLocked || isFormLoading}
                        isLoading={isLoadingSubCounties}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ward"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ward (Optional)</FormLabel>
                    <FormControl>
                      <LocationCombobox
                        options={wards?.map(w => ({ value: w.id.toString(), label: w.name })) || []}
                        value={field.value?.toString()}
                        onSelect={(value) => field.onChange(Number(value))}
                        placeholder={!selectedSubCounty ? 'Select sub-county first' : 'Select ward'}
                        searchPlaceholder="Search wards..."
                        emptyMessage="No ward found."
                        disabled={!selectedSubCounty || formLocked || isFormLoading}
                        isLoading={isLoadingWards}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="village"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Village/Estate (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter village or estate"
                      {...field}
                      disabled={formLocked || isFormLoading}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <Separator />

          {/* ================================================================== */}
          {/* SECTION 5: Insurance Details (conditional) */}
          {/* ================================================================== */}
          {(paymentMode === 'insurance_private' || paymentMode === 'insurance_corporate') && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Insurance Details</h3>
              <div className="grid gap-4 md:grid-cols-2 p-4 rounded-lg border bg-muted/30">
                <FormField
                  control={form.control}
                  name="insurance_provider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Insurance Provider *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Jubilee, AAR, Britam"
                          {...field}
                          disabled={formLocked || isFormLoading}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="insurance_member_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Member/Policy Number</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter member number"
                          {...field}
                          disabled={formLocked || isFormLoading}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>
          )}

          <Separator />

          {/* ================================================================== */}
          {/* SECTION 6: Emergency Contact */}
          {/* ================================================================== */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Emergency Contact</h3>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <FormField
                control={form.control}
                name="emergency_contact_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Full name"
                        {...field}
                        disabled={formLocked || isFormLoading}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="emergency_contact_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Phone</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="+254..."
                        {...field}
                        disabled={formLocked || isFormLoading}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="emergency_contact_relationship"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relationship</FormLabel>
                    {!showCustomRelationship ? (
                      <Select
                        onValueChange={(value) => {
                          if (value === 'other') {
                            setShowCustomRelationship(true);
                            field.onChange('');
                          } else {
                            field.onChange(value);
                          }
                        }}
                        value={field.value || ''}
                        disabled={formLocked || isFormLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select relationship" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {RELATIONSHIP_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            placeholder="Specify relationship"
                            value={customRelationship}
                            onChange={(e) => {
                              setCustomRelationship(e.target.value);
                              field.onChange(e.target.value);
                            }}
                            disabled={formLocked || isFormLoading}
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowCustomRelationship(false);
                            setCustomRelationship('');
                            field.onChange('');
                          }}
                          disabled={formLocked || isFormLoading}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Separator />

          {/* ================================================================== */}
          {/* SECTION 7: Referral Source */}
          {/* ================================================================== */}
          <FormField
            control={form.control}
            name="referral_source"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>Referral Source</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={formLocked || isFormLoading}
                    className="flex flex-wrap gap-4"
                  >
                    {REFERRAL_SOURCE_OPTIONS.map((option) => (
                      <div key={option.value} className="flex items-center space-x-2">
                        <RadioGroupItem value={option.value} id={`referral-${option.value}`} />
                        <Label htmlFor={`referral-${option.value}`} className="cursor-pointer font-normal">
                          {option.label}
                        </Label>
                      </div>
                    ))}  
                  </RadioGroup>
                </FormControl>
              </FormItem>
            )}
          />

          {/* Referred From Facility - shown when 'other_facility' selected */}
          {referralSource === 'other_facility' && (
            <FormField
              control={form.control}
              name="referred_from_facility"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Referring Facility Name <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter the name of the referring facility"
                      {...field}
                      disabled={formLocked || isFormLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <Separator />

          {/* ================================================================== */}
          {/* SECTION 8: Data Protection Notice (Always Visible) */}
          {/* ================================================================== */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Data Protection</h3>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Kenya Data Protection Act 2019</AlertTitle>
              <AlertDescription>
                Patient consent will be requested upon form submission. Data will be encrypted and stored securely in compliance with the law.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="consent_given"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => {
                           field.onChange(checked);
                           if (checked) form.setValue('consent_deferred', false);
                        }}
                        disabled={formLocked || isFormLoading}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Patient Consent
                      </FormLabel>
                      <FormDescription>
                        I confirm that the patient has given consent for data collection.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="consent_deferred"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => {
                           field.onChange(checked);
                           if (checked) form.setValue('consent_given', false);
                        }}
                        disabled={formLocked || isFormLoading}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Defer Consent
                      </FormLabel>
                      <FormDescription>
                        Consent is deferred due to emergency or incapacity.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* ================================================================== */}
          {/* Actions */}
          {/* ================================================================== */}
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-4 sm:justify-end pt-4">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isFormLoading} className="order-2 sm:order-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isFormLoading || formLocked} className="order-1 sm:order-2">
              {isFormLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Update Patient' : 'Register Patient'}
            </Button>
          </div>
        </form>
      </Form>

      {/* Consent Confirmation Dialog */}
      <ConsentConfirmationDialog
        open={showConsentDialog}
        onOpenChange={setShowConsentDialog}
        onDecision={handleConsentDecision}
        patientName={
          pendingFormData
            ? `${pendingFormData.first_name} ${pendingFormData.last_name}`.trim()
            : undefined
        }
        crRecordFound={!!crClient}
        isNewCRRecord={crSearched && !crClient}
      />

      {/* SHA Principal Confirmation Dialog */}
      <SHAPrincipalConfirmationDialog
        open={showShaPrincipalDialog}
        onOpenChange={setShowShaPrincipalDialog}
        onDecision={handleShaPrincipalDecision}
        shaDetails={pendingShaDetails}
      />

      {/* SHA Details Dialog */}
      <Dialog open={showShaDetailsDialog} onOpenChange={setShowShaDetailsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle className="flex items-center gap-2">
                <SHALogo size="md" />
                SHA Coverage Details
              </DialogTitle>
              <HelpPopover content="Social Health Authority membership information and coverage status." />
            </div>
          </DialogHeader>

          {shaEligibility.details && (
            <div className="space-y-4">
              {/* Eligibility Status */}
              {shaEligibility.isEligible ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/30">
                  <BadgeCheck className="h-5 w-5 text-success" />
                  <div>
                    <p className="font-medium text-success">Active Coverage</p>
                    <p className="text-sm text-success/80">Patient is eligible for SHA benefits</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
                  <XCircle className="h-5 w-5 text-warning-foreground" />
                  <div>
                    <p className="font-medium text-warning-foreground">Coverage Inactive</p>
                    <p className="text-sm text-warning-foreground/80">
                      {shaEligibility.reason || 'Patient is not currently eligible for SHA benefits'}
                    </p>
                  </div>
                </div>
              )}

              {/* Member Details */}
              <div className="grid gap-3">
                {shaEligibility.details.full_name && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Member Name</span>
                    <span className="font-medium">{shaEligibility.details.full_name}</span>
                  </div>
                )}

                {shaEligibility.details.sha_number && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">SHA Number</span>
                    <span className="font-mono font-medium">{shaEligibility.details.sha_number}</span>
                  </div>
                )}

                {shaEligibility.details.coverage_end_date && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Coverage Valid Until</span>
                    <span className="font-medium">{shaEligibility.details.coverage_end_date}</span>
                  </div>
                )}

                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Co-pay Percentage</span>
                  <span className="font-medium">{shaEligibility.details.copay_percentage || 0}%</span>
                </div>

                {shaEligibility.details.employment_type && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Employment Type</span>
                    <span className="font-medium capitalize">{shaEligibility.details.employment_type}</span>
                  </div>
                )}

                {shaEligibility.details.employer_name && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Employer</span>
                    <span className="font-medium">{shaEligibility.details.employer_name}</span>
                  </div>
                )}

                {shaEligibility.details.nhif_transition_status && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">NHIF Transition</span>
                    <Badge variant="outline" className="capitalize">
                      {shaEligibility.details.nhif_transition_status}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Means Testing Info (if available) */}
              {shaEligibility.details.means_testing && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <p className="text-sm font-medium flex items-center gap-1">
                    <Info className="h-4 w-4" />
                    Means Testing Information
                  </p>
                  <div className="grid gap-2 text-sm">
                    {shaEligibility.details.means_testing.monthly_contribution !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Monthly Contribution</span>
                        <span>KES {shaEligibility.details.means_testing.monthly_contribution?.toLocaleString()}</span>
                      </div>
                    )}
                    {shaEligibility.details.means_testing.income_prediction_category && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Income Category</span>
                        <span className="capitalize">{shaEligibility.details.means_testing.income_prediction_category}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Dependents Accordion - Always show */}
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="dependents" className="border rounded-lg px-3">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>Dependents ({shaEligibility.details.dependents?.length || shaEligibility.details.dependents_covered || 0})</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pt-2">
                      {shaEligibility.details.dependents && shaEligibility.details.dependents.length > 0 ? (
                        shaEligibility.details.dependents.map((dependent, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 rounded-md bg-muted/30 border"
                          >
                            <div className="space-y-1">
                              <p className="font-medium text-sm">{dependent.name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {dependent.relationship && (
                                  <span className="capitalize">{dependent.relationship}</span>
                                )}
                                {dependent.age !== undefined && (
                                  <span>• {dependent.age} years</span>
                                )}
                                {dependent.date_of_birth && !dependent.age && (
                                  <span>• DOB: {dependent.date_of_birth}</span>
                                )}
                              </div>
                              {dependent.sha_number && (
                                <p className="text-xs font-mono text-muted-foreground">
                                  SHA#: {dependent.sha_number}
                                </p>
                              )}
                            </div>
                            {dependent.is_active !== undefined && (
                              <Badge variant={dependent.is_active ? 'default' : 'secondary'}>
                                {dependent.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No dependents registered under this membership
                        </p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setShowShaDetailsDialog(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicate Patient Modal */}
      <DuplicatePatientModal
        open={showDuplicateModal}
        onOpenChange={setShowDuplicateModal}
        result={duplicateCheckResult}
        onSelectExistingPatient={(patientId) => {
          // Navigate to check-in page for the existing patient
          window.location.href = `/patients/checkin?select=${patientId}`;
        }}
        onContinueAsNew={() => {
          setDuplicateAcknowledged(true);
          setShowDuplicateModal(false);
        }}
      />
    </>
  );
}

export default PatientForm;
