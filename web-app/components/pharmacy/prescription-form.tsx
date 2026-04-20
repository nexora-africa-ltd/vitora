/**
 * Standalone Prescription Form Component
 *
 * Extracted from the New Prescription page for embedding in Sheet panels
 * (e.g., encounter detail page). Accepts patient/encounter IDs as props
 * instead of reading from URL params or context providers.
 *
 * Omits the walk-in patient selector (requires patientId prop).
 * Keeps: drug search (local + SHA), smart dosage, drug-allergy checking,
 * copy/print, clinical notes, dispensing type.
 */

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Pill,
  Loader2,
  Search,
  Printer,
  Copy,
  Check,
  RefreshCcw,
  PenLine,
  Shuffle,
  Building2,
  ExternalLink,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DrugProductSelect as DrugSelect } from '@/components/terminology';
import { useToast } from '@/lib/hooks/use-toast';
import { usePatient } from '@/lib/hooks/use-patients';
import { useEncounter } from '@/lib/hooks/use-encounters';
import { useDrugs, useCreatePrescription } from '@/lib/hooks/use-pharmacy';
import { useCheckDrugInteractions } from '@/lib/hooks/use-allergies';
import { PrescriptionAllergyWarning } from '@/components/pharmacy/prescription-allergy-warning';
import type { DrugInteractionCheck } from '@/lib/types/allergy';
import { useAuth } from '@/lib/auth';
import { printPrescription, type PrintPrescriptionOptions } from '@/lib/documents';
import {
  generateDosageSuggestions,
  getSuggestedRoute,
  getRouteOptions,
  getFrequencyOptions,
  getDurationOptions,
  calculateQuantity,
  type DosageSuggestion,
} from '@/lib/utils/dosage';
import { ShiftGate } from '@/components/shared/shift-gate';
import type { Drug, PrescriptionItemCreateData } from '@/lib/types/pharmacy';

// SHA Drug type for selected drug
interface SHADrugSelection {
  code: string;
  name: string;
  price?: number;
  strength?: string;
  form?: string;
  route?: string;
}

// Get options from utilities
const FREQUENCY_OPTIONS = getFrequencyOptions();
const DURATION_OPTIONS = getDurationOptions();
const ROUTE_OPTIONS = getRouteOptions();

interface PrescriptionItemForm extends PrescriptionItemCreateData {
  drug_name?: string;
  drug_strength?: string;
  drug_form?: string;
  sha_code?: string;
}

interface PrescriptionFormProps {
  patientId: number;
  encounterId?: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function PrescriptionForm({
  patientId,
  encounterId,
  onSuccess,
  onCancel,
}: PrescriptionFormProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch patient and encounter data
  const { data: patient, isLoading: patientLoading } = usePatient(patientId);
  const { data: encounter, isLoading: encounterLoading } = useEncounter(
    encounterId || 0
  );

  // Get prescriber name
  const prescriberName = user
    ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username
    : 'Unknown';

  // Drug source selection (local inventory vs DHIS2 formulary)
  const [useSHADrug, setUseSHADrug] = useState(false);
  const [selectedSHADrug, setSelectedSHADrug] = useState<SHADrugSelection | null>(null);

  // Drug search state
  const [drugSearch, setDrugSearch] = useState('');
  const [showDrugSearch, setShowDrugSearch] = useState(false);
  const { data: drugsData, isLoading: drugsLoading } = useDrugs({
    search: drugSearch || undefined,
    page_size: 10,
    is_active: true,
  });

  // Selected drug for smart dosage
  const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);

  // Form state
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [dispensingType, setDispensingType] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');
  const [items, setItems] = useState<PrescriptionItemForm[]>([]);
  const [currentItem, setCurrentItem] = useState<Partial<PrescriptionItemForm>>({
    quantity_prescribed: 1,
    dosage: '',
    frequency: '',
    duration: '',
    route: 'PO',
    instructions: '',
    is_substitutable: true,
  });

  // Custom dosage input state
  const [customDosage, setCustomDosage] = useState('');
  const [showCustomDosage, setShowCustomDosage] = useState(false);

  // Track units per dose from dosage selection (for auto-quantity calculation)
  const [unitsPerDose, setUnitsPerDose] = useState<number | null>(null);

  // Whether user has manually overridden the auto-calculated quantity
  const [quantityManualOverride, setQuantityManualOverride] = useState(false);

  // Copy to clipboard state
  const [copied, setCopied] = useState(false);

  // Generate smart dosage suggestions based on selected drug
  const dosageSuggestions = useMemo<DosageSuggestion[]>(() => {
    if (!selectedDrug) return [];
    return generateDosageSuggestions(selectedDrug);
  }, [selectedDrug]);

  // Auto-calculate quantity when dosage, frequency, or duration changes
  const autoQuantity = useMemo(() => {
    return calculateQuantity(unitsPerDose, currentItem.frequency, currentItem.duration, selectedDrug?.form);
  }, [unitsPerDose, currentItem.frequency, currentItem.duration, selectedDrug?.form]);

  useEffect(() => {
    if (autoQuantity !== null && !quantityManualOverride) {
      setCurrentItem((prev) => ({ ...prev, quantity_prescribed: autoQuantity }));
    }
  }, [autoQuantity, quantityManualOverride]);

  // Create prescription mutation
  const createPrescription = useCreatePrescription();

  // Drug-allergy interaction checking
  const checkInteractions = useCheckDrugInteractions();
  const [allergyWarningOpen, setAllergyWarningOpen] = useState(false);
  const [pendingInteractions, setPendingInteractions] = useState<DrugInteractionCheck | null>(null);

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Generate prescription text for copying
  const generatePrescriptionText = useCallback(() => {
    if (!patient || items.length === 0) return '';

    const today = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    let text = `
PRESCRIPTION
Date: ${today}
Prescriber: ${prescriberName}

PATIENT: ${patient.first_name} ${patient.last_name} (${patient.mrn})
${encounter ? `Encounter: #${encounterId}` : ''}

MEDICATIONS
`;

    items.forEach((item, index) => {
      text += `${index + 1}. ${item.drug_name}
   ${item.dosage} | ${FREQUENCY_OPTIONS.find(f => f.value === item.frequency)?.label || item.frequency} | ${item.duration}
   Route: ${ROUTE_OPTIONS.find(r => r.value === item.route)?.label || item.route || 'Oral'} | Qty: ${item.quantity_prescribed}
   ${item.instructions ? `Note: ${item.instructions}` : ''}
`;
    });

    if (clinicalNotes) {
      text += `\nNOTES: ${clinicalNotes}\n`;
    }

    return text.trim();
  }, [patient, items, encounter, encounterId, clinicalNotes, prescriberName]);

  // Copy prescription to clipboard
  const handleCopyToClipboard = useCallback(async () => {
    const text = generatePrescriptionText();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: 'Copied!', description: 'Prescription copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Error', description: 'Failed to copy to clipboard', variant: 'destructive' });
    }
  }, [generatePrescriptionText, toast]);

  // Print prescription
  const handlePrint = useCallback(async () => {
    if (items.length === 0 || !patient) return;

    const printOptions: PrintPrescriptionOptions = {
      prescription: {
        id: 0,
        prescription_number: `DRAFT-${Date.now()}`,
        patient: patientId,
        patient_name: `${patient.first_name} ${patient.last_name}`,
        patient_mrn: patient.mrn,
        prescriber: user?.id || 0,
        prescriber_name: prescriberName,
        status: 'PENDING',
        effective_status: 'PENDING',
        prescribed_date: new Date().toISOString(),
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        days_until_expiry: 30,
        clinical_notes: clinicalNotes || undefined,
        items: items.map((item, index) => ({
          id: index,
          prescription: 0,
          drug: item.drug || 0,
          drug_name: item.drug_name,
          quantity_prescribed: item.quantity_prescribed,
          quantity_dispensed: 0,
          dosage: item.dosage,
          frequency: FREQUENCY_OPTIONS.find(f => f.value === item.frequency)?.label || item.frequency,
          duration: item.duration,
          instructions: item.instructions,
          is_substitutable: item.is_substitutable ?? true,
          is_cancelled: false,
          remaining_quantity: item.quantity_prescribed,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
        is_valid: true,
        is_fully_dispensed: false,
        dispensing_type: dispensingType,
        is_discharge_medication: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      patient: {
        full_name: `${patient.first_name} ${patient.last_name}`,
        mrn: patient.mrn,
        age: patient.date_of_birth
          ? `${Math.floor((Date.now() - new Date(patient.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} years`
          : undefined,
        gender: patient.gender === 'M' ? 'Male' : patient.gender === 'F' ? 'Female' : patient.gender,
      },
      clinician: { name: prescriberName, registration_number: '' },
      encounterId,
      layout: 'a4',
      theme: 'default',
    };

    await printPrescription(printOptions);
  }, [items, patient, patientId, encounterId, clinicalNotes, prescriberName, user, dispensingType]);

  // Validate current item before adding
  const validateItem = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!currentItem.drug) {
      newErrors.drug = 'Please select a drug';
    }
    if (!currentItem.quantity_prescribed || currentItem.quantity_prescribed < 1) {
      newErrors.quantity = 'Quantity must be at least 1';
    }
    if (!currentItem.dosage?.trim()) {
      newErrors.dosage = 'Dosage is required';
    }
    if (!currentItem.frequency?.trim()) {
      newErrors.frequency = 'Frequency is required';
    }
    if (!currentItem.duration?.trim()) {
      newErrors.duration = 'Duration is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [currentItem]);

  // Add item to prescription
  const handleAddItem = useCallback(() => {
    if (!validateItem()) return;

    setItems((prev) => [
      ...prev,
      {
        drug: currentItem.drug!,
        drug_name: currentItem.drug_name,
        drug_strength: selectedDrug?.strength,
        drug_form: selectedDrug?.form,
        quantity_prescribed: currentItem.quantity_prescribed!,
        dosage: currentItem.dosage!,
        frequency: currentItem.frequency!,
        duration: currentItem.duration!,
        route: currentItem.route,
        instructions: currentItem.instructions,
        is_substitutable: currentItem.is_substitutable,
      },
    ]);

    // Reset current item and selected drug
    setCurrentItem({
      quantity_prescribed: 1,
      dosage: '',
      frequency: '',
      duration: '',
      route: 'PO',
      instructions: '',
      is_substitutable: true,
    });
    setSelectedDrug(null);
    setSelectedSHADrug(null);
    setDrugSearch('');
    setShowDrugSearch(false);
    setCustomDosage('');
    setShowCustomDosage(false);
    setUnitsPerDose(null);
    setQuantityManualOverride(false);
    setErrors({});
  }, [currentItem, selectedDrug, validateItem]);

  // Remove item from prescription
  const handleRemoveItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Select drug from search results - with smart defaults
  const handleSelectDrug = useCallback((drug: Drug) => {
    const displayName = drug.brand_names?.[0] || drug.generic_name;
    setSelectedDrug(drug);
    setSelectedSHADrug(null);

    const suggestedRoute = getSuggestedRoute(drug.form);
    const suggestions = generateDosageSuggestions(drug);
    const defaultSuggestion = suggestions.find((s) => s.isDefault);
    const defaultDosage = defaultSuggestion?.value || '';

    setUnitsPerDose(defaultSuggestion?.quantity ?? null);
    setQuantityManualOverride(false);

    setCurrentItem((prev) => ({
      ...prev,
      drug: drug.id,
      drug_name: displayName,
      drug_strength: drug.strength,
      drug_form: drug.form,
      route: suggestedRoute.value,
      dosage: defaultDosage,
      sha_code: undefined,
    }));
    setDrugSearch(displayName);
    setShowDrugSearch(false);
    setCustomDosage('');
    setShowCustomDosage(false);
  }, []);

  // Select SHA drug
  const handleSelectSHADrug = useCallback((drug: { code: string; name: string; price?: number }) => {
    const shaDrug: SHADrugSelection = {
      code: drug.code,
      name: drug.name,
      price: drug.price,
    };
    setSelectedSHADrug(shaDrug);
    setSelectedDrug(null);

    setCurrentItem((prev) => ({
      ...prev,
      drug: undefined,
      drug_name: drug.name,
      drug_strength: '',
      drug_form: '',
      route: 'PO',
      dosage: '',
      sha_code: drug.code,
    }));
    setDrugSearch(drug.name);
    setShowDrugSearch(false);
  }, []);

  // Actually submit the prescription (after allergy check)
  const submitPrescription = useCallback(async (allergyOverride?: boolean) => {
    const clinicalNotesWithOverride = allergyOverride
      ? `${clinicalNotes}\n\n[ALLERGY WARNING ACKNOWLEDGED: Prescriber reviewed and acknowledged drug-allergy interactions]`.trim()
      : clinicalNotes;

    try {
      await createPrescription.mutateAsync({
        patient: patientId,
        encounter: encounterId,
        dispensing_type: dispensingType,
        clinical_notes: clinicalNotesWithOverride || undefined,
        items: items.map((item) => ({
          drug: item.drug,
          quantity_prescribed: item.quantity_prescribed,
          dosage: item.dosage,
          frequency: item.frequency,
          duration: item.duration,
          route: item.route,
          instructions: item.instructions,
          is_substitutable: item.is_substitutable,
        })),
      });

      toast({
        title: 'Prescription Created',
        description: `Prescription with ${items.length} item(s) has been created successfully`,
      });

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['encounter-prescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });

      onSuccess?.();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create prescription. Please try again.',
        variant: 'destructive',
      });
    }
  }, [patientId, encounterId, clinicalNotes, dispensingType, items, createPrescription, toast, queryClient, onSuccess]);

  // Submit prescription - checks for drug-allergy interactions first
  const handleSubmit = useCallback(async () => {
    if (items.length === 0) {
      toast({
        title: 'No Items',
        description: 'Please add at least one item to the prescription',
        variant: 'destructive',
      });
      return;
    }

    // Check for drug-allergy interactions
    const drugIds = items.map((item) => item.drug).filter((id): id is number => id !== undefined);
    const drugNames = items
      .map((item) => item.drug_name)
      .filter((name): name is string => !!name);

    if (drugIds.length > 0 || drugNames.length > 0) {
      try {
        const interactionCheck = await checkInteractions.mutateAsync({
          patientId,
          drugIds,
          drugNames,
        });

        if (interactionCheck.has_interactions) {
          setPendingInteractions(interactionCheck);
          setAllergyWarningOpen(true);
          return;
        }
      } catch (error) {
        console.warn('Allergy check failed, proceeding with prescription:', error);
      }
    }

    await submitPrescription(false);
  }, [items, patientId, checkInteractions, submitPrescription, toast]);

  const handleAllergyAcknowledge = useCallback(() => {
    setAllergyWarningOpen(false);
    setPendingInteractions(null);
    submitPrescription(true);
  }, [submitPrescription]);

  const handleAllergyCancel = useCallback(() => {
    setAllergyWarningOpen(false);
    setPendingInteractions(null);
  }, []);

  if (patientLoading || encounterLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Pill className="h-5 w-5" />
        New Prescription
      </h2>

      {/* Patient & Encounter Summary Bar */}
      {patient && (
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {patient.first_name} {patient.last_name}
              <span className="text-muted-foreground"> • {patient.mrn}</span>
            </p>
            {encounter && (
              <p className="text-xs sm:text-sm text-muted-foreground">
                Encounter #{encounterId}
              </p>
            )}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground shrink-0">
            Prescriber: {prescriberName}
          </p>
        </div>
      )}

      {/* Add Medication Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5" />
            Add Medication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drug Search with Local/SHA Tabs */}
          <div className="space-y-2">
            <Label>
              Drug <span className="text-destructive">*</span>
            </Label>

            {/* Show selected drug if any */}
            {(selectedDrug || selectedSHADrug) ? (
              <div className="p-3 rounded-lg bg-muted/50 border">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {selectedDrug
                          ? (selectedDrug.brand_names?.[0] || selectedDrug.generic_name)
                          : selectedSHADrug?.name
                        }
                      </span>
                      {selectedSHADrug && (
                        <Badge variant="secondary" className="text-xs">SHA</Badge>
                      )}
                      {selectedDrug && (
                        <Badge variant="secondary" className="text-xs">Local</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {selectedDrug
                        ? `${selectedDrug.generic_name} • ${selectedDrug.form} • ${selectedDrug.strength}`
                        : `${selectedSHADrug?.form || ''} • ${selectedSHADrug?.strength || ''}`
                      }
                    </div>
                    {selectedSHADrug?.code && (
                      <div className="text-xs font-mono text-muted-foreground mt-1">
                        Code: {selectedSHADrug.code}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 items-center">
                    {selectedDrug?.requires_prescription && (
                      <Badge variant="outline" className="text-xs">Rx</Badge>
                    )}
                    {selectedDrug?.is_controlled && (
                      <Badge variant="destructive" className="text-xs">Controlled</Badge>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedDrug(null);
                        setSelectedSHADrug(null);
                        setDrugSearch('');
                        setCurrentItem(prev => ({
                          ...prev,
                          drug: undefined,
                          drug_name: undefined,
                          sha_code: undefined,
                        }));
                      }}
                    >
                      Change
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Drug Source Toggle */}
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2 w-fit cursor-default">
                        <Switch
                          checked={useSHADrug}
                          onCheckedChange={setUseSHADrug}
                        />
                        <span className="text-sm font-medium">
                          {useSHADrug ? 'DHIS2 Formulary' : 'Local Inventory'}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Switch to {useSHADrug ? 'Local Inventory' : 'DHIS2 Formulary'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Local Drug Search */}
                {!useSHADrug && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="drug-search-form"
                      placeholder="Search drugs by name or generic name..."
                      value={drugSearch}
                      onChange={(e) => {
                        setDrugSearch(e.target.value);
                        setShowDrugSearch(true);
                      }}
                      onFocus={() => setShowDrugSearch(true)}
                      className={`pl-10 ${errors.drug ? 'border-destructive' : ''}`}
                    />
                    {showDrugSearch && drugSearch && (
                      <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                        {drugsLoading ? (
                          <div className="p-4 text-center text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                          </div>
                        ) : drugsData?.results && drugsData.results.length > 0 ? (
                          drugsData.results.map((drug) => (
                            <button
                              key={drug.id}
                              type="button"
                              className="w-full px-4 py-2 text-left hover:bg-accent flex items-center justify-between"
                              onClick={() => handleSelectDrug(drug)}
                            >
                              <div>
                                <div className="font-medium">
                                  {drug.brand_names?.[0] || drug.generic_name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {drug.generic_name} • {drug.form} • {drug.strength}
                                </div>
                              </div>
                              {drug.requires_prescription && (
                                <Badge variant="outline" className="text-xs">Rx</Badge>
                              )}
                            </button>
                          ))
                        ) : (
                          <div className="p-4 text-center text-muted-foreground">
                            No drugs found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* SHA Drug Search */}
                {useSHADrug && (
                  <DrugSelect
                    value={selectedSHADrug}
                    onSelect={handleSelectSHADrug}
                    placeholder="Search SHA drug formulary..."
                  />
                )}
              </div>
            )}
            {errors.drug && <p className="text-sm text-destructive">{errors.drug}</p>}
          </div>

          {/* Dosage and Quantity */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between h-5">
                <Label htmlFor="dosage-form">
                  Dosage <span className="text-destructive">*</span>
                </Label>
                {selectedDrug && (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-primary hover:text-foreground"
                    onClick={() => setShowCustomDosage(!showCustomDosage)}
                  >
                    <Shuffle className="h-3 w-3" />
                    {showCustomDosage ? 'Show suggestions' : 'Custom dosage'}
                  </button>
                )}
              </div>

              {showCustomDosage ? (
                <Input
                  id="custom-dosage-form"
                  placeholder="Enter custom dosage..."
                  value={customDosage}
                  onChange={(e) => {
                    setCustomDosage(e.target.value);
                    setUnitsPerDose(null);
                    setCurrentItem((prev) => ({ ...prev, dosage: e.target.value }));
                  }}
                  className={errors.dosage ? 'border-destructive' : ''}
                />
              ) : dosageSuggestions.length > 0 ? (
                <Select
                  value={currentItem.dosage}
                  onValueChange={(value) => {
                    const suggestion = dosageSuggestions.find((s) => s.value === value);
                    setUnitsPerDose(suggestion?.quantity ?? null);
                    setQuantityManualOverride(false);
                    setCurrentItem((prev) => ({ ...prev, dosage: value }));
                  }}
                >
                  <SelectTrigger className={errors.dosage ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Select dosage..." />
                  </SelectTrigger>
                  <SelectContent>
                    {dosageSuggestions.map((suggestion) => (
                      <SelectItem key={suggestion.value} value={suggestion.value} textValue={suggestion.label}>
                        <div className="flex items-center justify-between w-full gap-2">
                          <span>{suggestion.label}</span>
                          {suggestion.isDefault && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">Suggested</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="dosage-form"
                  placeholder="Select a drug first..."
                  value={currentItem.dosage || ''}
                  onChange={(e) =>
                    setCurrentItem((prev) => ({ ...prev, dosage: e.target.value }))
                  }
                  className={errors.dosage ? 'border-destructive' : ''}
                  disabled={!selectedDrug}
                />
              )}
              {errors.dosage && <p className="text-sm text-destructive">{errors.dosage}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between h-5">
                <Label htmlFor="quantity-form">
                  Quantity to Dispense <span className="text-destructive">*</span>
                </Label>
                {autoQuantity !== null && !quantityManualOverride && (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-primary hover:text-foreground"
                    onClick={() => setQuantityManualOverride(true)}
                  >
                    <PenLine className="h-3 w-3" />
                    Override
                  </button>
                )}
                {autoQuantity !== null && quantityManualOverride && (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-primary hover:text-foreground"
                    onClick={() => {
                      setQuantityManualOverride(false);
                      setCurrentItem((prev) => ({ ...prev, quantity_prescribed: autoQuantity }));
                    }}
                  >
                    <RefreshCcw className="h-3 w-3" />
                    Reset to {autoQuantity}
                  </button>
                )}
              </div>
              <Input
                id="quantity-form"
                type="number"
                min={1}
                readOnly={!quantityManualOverride}
                value={currentItem.quantity_prescribed || ''}
                onChange={(e) => {
                  setQuantityManualOverride(true);
                  setCurrentItem((prev) => ({
                    ...prev,
                    quantity_prescribed: parseInt(e.target.value) || 0,
                  }));
                }}
                className={`${errors.quantity ? 'border-destructive' : ''} ${!quantityManualOverride ? 'bg-muted/50' : ''}`}
              />
              {errors.quantity && <p className="text-sm text-destructive">{errors.quantity}</p>}
            </div>
          </div>

          {/* Frequency and Duration */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="frequency-form">
                Frequency <span className="text-destructive">*</span>
              </Label>
              <Select
                value={currentItem.frequency}
                onValueChange={(value) =>
                  setCurrentItem((prev) => ({ ...prev, frequency: value }))
                }
              >
                <SelectTrigger className={errors.frequency ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select frequency..." />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.frequency && (
                <p className="text-sm text-destructive">{errors.frequency}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration-form">
                Duration <span className="text-destructive">*</span>
              </Label>
              <Select
                value={currentItem.duration}
                onValueChange={(value) =>
                  setCurrentItem((prev) => ({ ...prev, duration: value }))
                }
              >
                <SelectTrigger className={errors.duration ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select duration..." />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.duration && <p className="text-sm text-destructive">{errors.duration}</p>}
            </div>
          </div>

          {/* Route and Instructions */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="route-form">Route</Label>
                {selectedDrug && (
                  <span className="text-xs text-muted-foreground">
                    (auto-set from drug form)
                  </span>
                )}
              </div>
              <Select
                value={currentItem.route}
                onValueChange={(value) =>
                  setCurrentItem((prev) => ({ ...prev, route: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select route..." />
                </SelectTrigger>
                <SelectContent>
                  {ROUTE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instructions-form">Special Instructions</Label>
              <Input
                id="instructions-form"
                placeholder="e.g., Take with food"
                value={currentItem.instructions || ''}
                onChange={(e) =>
                  setCurrentItem((prev) => ({ ...prev, instructions: e.target.value }))
                }
              />
            </div>
          </div>

          {/* Substitutable checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="substitutable-form"
              checked={currentItem.is_substitutable}
              onCheckedChange={(checked) =>
                setCurrentItem((prev) => ({ ...prev, is_substitutable: checked === true }))
              }
            />
            <Label htmlFor="substitutable-form" className="text-sm cursor-pointer">
              Allow generic substitution
            </Label>
          </div>

          {/* Add button */}
          <Button onClick={handleAddItem} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add to Prescription
          </Button>
        </CardContent>
      </Card>

      {/* Prescription Items */}
      {items.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Prescription Items ({items.length})</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyToClipboard}
                disabled={items.length === 0}
              >
                {copied ? (
                  <Check className="h-4 w-4 mr-1 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4 mr-1" />
                )}
                {copied ? 'Copied!' : 'Copy'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                disabled={items.length === 0}
              >
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-start justify-between p-3 border rounded-lg bg-muted/30"
                >
                  <div className="space-y-1">
                    <div className="font-medium">{item.drug_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {item.dosage} • {item.frequency} • {item.duration} •{' '}
                      {item.route || 'PO'}
                    </div>
                    <div className="text-sm">
                      Qty: <strong>{item.quantity_prescribed}</strong>
                      {item.instructions && (
                        <span className="ml-2 text-muted-foreground">
                          • {item.instructions}
                        </span>
                      )}
                    </div>
                    {item.is_substitutable && (
                      <Badge variant="outline" className="text-xs">
                        Substitutable
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRemoveItem(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Clinical Notes & Dispensing Type */}
      <Card>
        <CardHeader>
          <CardTitle>Clinical Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Add any clinical notes or special instructions for the pharmacist..."
            value={clinicalNotes}
            onChange={(e) => setClinicalNotes(e.target.value)}
            rows={3}
          />
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
            <Label className="text-sm shrink-0">Dispensing</Label>
            <RadioGroup
              value={dispensingType}
              onValueChange={(v) => setDispensingType(v as 'INTERNAL' | 'EXTERNAL')}
              className="flex items-center gap-4"
            >
              <label className="flex items-center gap-1.5 cursor-pointer">
                <RadioGroupItem value="INTERNAL" />
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">Internal (Hospital Pharmacy)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <RadioGroupItem value="EXTERNAL" />
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">External (Outside Pharmacy)</span>
              </label>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="outline" className="w-full sm:w-auto" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <ShiftGate>
          <Button
            className="w-full sm:w-auto"
            onClick={handleSubmit}
            disabled={items.length === 0 || createPrescription.isPending || checkInteractions.isPending}
          >
            {createPrescription.isPending || checkInteractions.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Pill className="h-4 w-4 mr-2" />
            )}
            Create Prescription ({items.length} item{items.length !== 1 ? 's' : ''})
          </Button>
        </ShiftGate>
      </div>

      {/* Drug-Allergy Interaction Warning Dialog */}
      {pendingInteractions && (
        <PrescriptionAllergyWarning
          open={allergyWarningOpen}
          onOpenChange={setAllergyWarningOpen}
          interactions={pendingInteractions}
          onAcknowledge={handleAllergyAcknowledge}
          onCancel={handleAllergyCancel}
        />
      )}
    </div>
  );
}
