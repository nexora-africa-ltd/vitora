/**
 * New Prescription Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Allows clinicians to create prescriptions for patients during encounters.
 * Features smart dosage suggestions based on selected drug properties.
 * Accessed from the encounter edit page's prescription tab.
 *
 * Supports both:
 * - URL params (encounter=X&patient=Y)
 * - Context providers (PatientContext, EncounterContext)
 */

'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Pill,
  Loader2,
  AlertTriangle,
  Search,
  User,
  FileText,
  Info,
  Printer,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Switch } from '@/components/ui/switch';
import { DrugProductSelect as DrugSelect } from '@/components/terminology';
import { useToast } from '@/lib/hooks/use-toast';
import { usePatient } from '@/lib/hooks/use-patients';
import { useEncounter } from '@/lib/hooks/use-encounters';
import { useDrugs, useCreatePrescription } from '@/lib/hooks/use-pharmacy';
import { useAuth } from '@/lib/auth';
import { useOptionalPatientContext } from '@/lib/context/patient-context';
import { useOptionalEncounterContext } from '@/lib/context/encounter-context';
import {
  generateDosageSuggestions,
  getSuggestedRoute,
  getRouteOptions,
  getFrequencyOptions,
  getDurationOptions,
  type DosageSuggestion,
} from '@/lib/utils/dosage';
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

export default function NewPrescriptionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();

  // Try to get from context first (if within patient/encounter shell)
  const patientContext = useOptionalPatientContext();
  const encounterContext = useOptionalEncounterContext();

  // Get encounter and patient IDs from URL params (fallback)
  const urlEncounterId = searchParams.get('encounter')
    ? parseInt(searchParams.get('encounter')!)
    : undefined;
  const urlPatientId = searchParams.get('patient')
    ? parseInt(searchParams.get('patient')!)
    : undefined;

  // Resolve IDs: context takes priority over URL params
  const resolvedPatientId = patientContext?.patient?.id || urlPatientId;
  const resolvedEncounterId = encounterContext?.encounter?.id || urlEncounterId;

  // Fetch patient and encounter data (only if not from context)
  const { data: fetchedPatient, isLoading: patientLoading } = usePatient(
    !patientContext?.patient && resolvedPatientId ? resolvedPatientId : 0
  );
  const { data: fetchedEncounter, isLoading: encounterLoading } = useEncounter(
    !encounterContext?.encounter && resolvedEncounterId ? resolvedEncounterId : 0
  );

  // Use context data if available, otherwise fetched data
  const patient = patientContext?.patient || fetchedPatient;
  const encounter = encounterContext?.encounter || fetchedEncounter;
  const patientId = resolvedPatientId;
  const encounterId = resolvedEncounterId;

  // Check if orders can be placed (from encounter context)
  const canPlaceOrders = encounterContext?.canPlaceOrders ?? true;

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

  // Copy to clipboard state
  const [copied, setCopied] = useState(false);

  // Generate smart dosage suggestions based on selected drug
  const dosageSuggestions = useMemo<DosageSuggestion[]>(() => {
    if (!selectedDrug) return [];
    return generateDosageSuggestions(selectedDrug);
  }, [selectedDrug]);

  // Create prescription mutation
  const createPrescription = useCreatePrescription();

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Generate prescription text for printing/copying
  const generatePrescriptionText = useCallback(() => {
    if (!patient || items.length === 0) return '';

    const today = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    let text = `
═══════════════════════════════════════════════════════
                      PRESCRIPTION
═══════════════════════════════════════════════════════

Date: ${today}
Prescriber: ${prescriberName}

PATIENT INFORMATION
───────────────────
Name: ${patient.first_name} ${patient.last_name}
MRN: ${patient.mrn}
${encounter ? `Encounter: #${encounterId}` : ''}

MEDICATIONS
───────────────────
`;

    items.forEach((item, index) => {
      text += `
${index + 1}. ${item.drug_name}
   Dosage: ${item.dosage}
   Frequency: ${FREQUENCY_OPTIONS.find(f => f.value === item.frequency)?.label || item.frequency}
   Duration: ${item.duration}
   Route: ${ROUTE_OPTIONS.find(r => r.value === item.route)?.label || item.route || 'Oral'}
   Quantity: ${item.quantity_prescribed}
   ${item.instructions ? `Instructions: ${item.instructions}` : ''}
   ${item.is_substitutable ? '[Substitution Allowed]' : '[No Substitution]'}
`;
    });

    if (clinicalNotes) {
      text += `
CLINICAL NOTES
───────────────────
${clinicalNotes}
`;
    }

    text += `
───────────────────
Prescribed by: ${prescriberName}

═══════════════════════════════════════════════════════
                    Vitora HMIS
═══════════════════════════════════════════════════════
`;

    return text;
  }, [patient, items, encounter, encounterId, clinicalNotes, prescriberName]);

  // Copy prescription to clipboard
  const handleCopyToClipboard = useCallback(async () => {
    const text = generatePrescriptionText();
    if (!text) {
      toast({
        title: 'No Items',
        description: 'Add items to the prescription first',
        variant: 'destructive',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: 'Copied!',
        description: 'Prescription copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
      });
    }
  }, [generatePrescriptionText, toast]);

  // Print prescription
  const handlePrint = useCallback(() => {
    if (items.length === 0) {
      toast({
        title: 'No Items',
        description: 'Add items to the prescription first',
        variant: 'destructive',
      });
      return;
    }

    const today = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Prescription - ${patient?.mrn}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            padding: 20mm;
            max-width: 210mm;
            font-size: 11pt;
            line-height: 1.4;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #333;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .header h1 { font-size: 18pt; margin-bottom: 5px; }
          .header p { color: #666; font-size: 10pt; }
          .section { margin-bottom: 20px; }
          .section-title {
            font-weight: bold;
            font-size: 11pt;
            border-bottom: 1px solid #ccc;
            padding-bottom: 5px;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .patient-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }
          .patient-info p { margin: 3px 0; }
          .medication {
            border: 1px solid #ddd;
            padding: 12px;
            margin-bottom: 10px;
            border-radius: 5px;
            background: #fafafa;
          }
          .medication-name {
            font-weight: bold;
            font-size: 12pt;
            color: #1a1a1a;
            margin-bottom: 8px;
          }
          .medication-details {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 5px;
            font-size: 10pt;
          }
          .medication-details span { color: #666; }
          .medication-instructions {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px dashed #ddd;
            font-style: italic;
          }
          .badge {
            display: inline-block;
            background: #e0f2fe;
            color: #0369a1;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 9pt;
            margin-top: 5px;
          }
          .notes {
            background: #fffbeb;
            padding: 12px;
            border-radius: 5px;
            border-left: 3px solid #f59e0b;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 2px solid #333;
            display: flex;
            justify-content: space-between;
          }
          .signature-line {
            border-top: 1px solid #333;
            width: 200px;
            padding-top: 5px;
            margin-top: 40px;
            font-size: 10pt;
          }
          @media print {
            body { padding: 10mm; }
            .medication { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>℞ PRESCRIPTION</h1>
          <p>Date: ${today}</p>
        </div>

        <div class="section">
          <div class="section-title">Prescriber Information</div>
          <div class="patient-info">
            <p><strong>Prescriber:</strong> ${prescriberName}</p>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Patient Information</div>
          <div class="patient-info">
            <p><strong>Name:</strong> ${patient?.first_name} ${patient?.last_name}</p>
            <p><strong>MRN:</strong> ${patient?.mrn}</p>
            ${encounter ? `<p><strong>Encounter:</strong> #${encounterId}</p>` : ''}
          </div>
        </div>

        <div class="section">
          <div class="section-title">Medications (${items.length})</div>
          ${items.map((item, index) => `
            <div class="medication">
              <div class="medication-name">${index + 1}. ${item.drug_name}</div>
              <div class="medication-details">
                <p><span>Dosage:</span> ${item.dosage}</p>
                <p><span>Frequency:</span> ${FREQUENCY_OPTIONS.find(f => f.value === item.frequency)?.label || item.frequency}</p>
                <p><span>Duration:</span> ${item.duration}</p>
                <p><span>Route:</span> ${ROUTE_OPTIONS.find(r => r.value === item.route)?.label || item.route || 'Oral'}</p>
                <p><span>Quantity:</span> <strong>${item.quantity_prescribed}</strong></p>
              </div>
              ${item.instructions ? `<div class="medication-instructions">📝 ${item.instructions}</div>` : ''}
              ${item.is_substitutable ? '<span class="badge">Substitution Allowed</span>' : ''}
            </div>
          `).join('')}
        </div>

        ${clinicalNotes ? `
        <div class="section">
          <div class="section-title">Clinical Notes</div>
          <div class="notes">${clinicalNotes}</div>
        </div>
        ` : ''}

        <div class="footer">
          <div>
            <p style="margin-bottom: 5px;"><strong>Prescribed by:</strong> ${prescriberName}</p>
            <div class="signature-line">Prescriber Signature</div>
          </div>
          <div class="signature-line">Date</div>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  }, [items, patient, encounter, encounterId, clinicalNotes, prescriberName, toast]);

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
    setDrugSearch('');
    setShowDrugSearch(false);
    setCustomDosage('');
    setShowCustomDosage(false);
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
    setSelectedSHADrug(null); // Clear SHA drug if local selected

    // Get smart defaults based on drug form
    const suggestedRoute = getSuggestedRoute(drug.form);
    const suggestions = generateDosageSuggestions(drug);
    const defaultDosage = suggestions.find((s) => s.isDefault)?.value || '';

    setCurrentItem((prev) => ({
      ...prev,
      drug: drug.id,
      drug_name: displayName,
      drug_strength: drug.strength,
      drug_form: drug.form,
      route: suggestedRoute.value,
      dosage: defaultDosage,
      sha_code: undefined, // Clear SHA code
    }));
    setDrugSearch(displayName);
    setShowDrugSearch(false);
    setCustomDosage('');
    setShowCustomDosage(false);
  }, []);

  // Select SHA drug from DrugSelect component
  const handleSelectSHADrug = useCallback((drug: { code: string; name: string; price?: number }) => {
    const shaDrug: SHADrugSelection = {
      code: drug.code,
      name: drug.name,
      price: drug.price,
    };
    setSelectedSHADrug(shaDrug);
    setSelectedDrug(null); // Clear local drug if SHA selected

    setCurrentItem((prev) => ({
      ...prev,
      drug: undefined, // SHA drugs may not have local ID
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

  // Submit prescription
  const handleSubmit = useCallback(async () => {
    if (items.length === 0) {
      toast({
        title: 'No Items',
        description: 'Please add at least one item to the prescription',
        variant: 'destructive',
      });
      return;
    }

    if (!patientId) {
      toast({
        title: 'Error',
        description: 'Patient ID is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createPrescription.mutateAsync({
        patient: patientId,
        encounter: encounterId,
        clinical_notes: clinicalNotes || undefined,
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

      // Navigate back to encounter if we came from one
      if (encounterId) {
        router.push(`/encounters/${encounterId}/edit`);
      } else {
        router.push('/pharmacy');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create prescription. Please try again.',
        variant: 'destructive',
      });
    }
  }, [items, patientId, encounterId, clinicalNotes, createPrescription, toast, router]);

  // Redirect if no patient ID
  useEffect(() => {
    if (!patientId) {
      toast({
        title: 'Error',
        description: 'Patient ID is required to create a prescription',
        variant: 'destructive',
      });
    }
  }, [patientId, toast]);

  if (patientLoading || encounterLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!patientId || !patient) {
    return (
      <div className="container mx-auto py-12 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-semibold">Patient Not Found</h2>
        <p className="text-muted-foreground mt-2">
          A valid patient ID is required to create a prescription.
        </p>
        <Button onClick={() => router.back()} className="mt-4">
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
          <span className="sr-only">Back</span>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Prescription</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            <span>
              {patient.first_name} {patient.last_name} ({patient.mrn})
            </span>
            {encounter && (
              <>
                <span>•</span>
                <FileText className="h-4 w-4" />
                <span>Encounter #{encounterId}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Add Medication Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pill className="h-5 w-5" />
              Add Medication
            </CardTitle>
            <CardDescription>
              Search for a drug and specify the prescription details
            </CardDescription>
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
                          <Badge variant="secondary" className="text-xs">
                            SHA
                          </Badge>
                        )}
                        {selectedDrug && (
                          <Badge variant="secondary" className="text-xs">
                            Local
                          </Badge>
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
                    <div className="flex gap-1 items-start">
                      {selectedDrug?.requires_prescription && (
                        <Badge variant="outline" className="text-xs">Rx</Badge>
                      )}
                      {selectedDrug?.is_controlled && (
                        <Badge variant="destructive" className="text-xs">Controlled</Badge>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
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
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${!useSHADrug ? 'font-medium' : ''}`}>Local Inventory</span>
                    <Switch
                      checked={useSHADrug}
                      onCheckedChange={setUseSHADrug}
                    />
                    <span className={`text-sm ${useSHADrug ? 'font-medium' : ''}`}>DHIS2 Formulary</span>
                  </div>

                  {/* Local Drug Search */}
                  {!useSHADrug && (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="drug-search"
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
                                  <Badge variant="outline" className="text-xs">
                                    Rx
                                  </Badge>
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

            {/* Dosage and Quantity - Smart dosage based on selected drug */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="dosage">
                    Dosage <span className="text-destructive">*</span>
                  </Label>
                  {selectedDrug && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setShowCustomDosage(!showCustomDosage)}
                    >
                      {showCustomDosage ? 'Show suggestions' : 'Custom dosage'}
                    </button>
                  )}
                </div>

                {showCustomDosage ? (
                  // Custom dosage input
                  <Input
                    id="custom-dosage"
                    placeholder="Enter custom dosage..."
                    value={customDosage}
                    onChange={(e) => {
                      setCustomDosage(e.target.value);
                      setCurrentItem((prev) => ({ ...prev, dosage: e.target.value }));
                    }}
                    className={errors.dosage ? 'border-destructive' : ''}
                  />
                ) : dosageSuggestions.length > 0 ? (
                  // Smart dosage suggestions based on drug
                  <Select
                    value={currentItem.dosage}
                    onValueChange={(value) =>
                      setCurrentItem((prev) => ({ ...prev, dosage: value }))
                    }
                  >
                    <SelectTrigger className={errors.dosage ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Select dosage..." />
                    </SelectTrigger>
                    <SelectContent>
                      {dosageSuggestions.map((suggestion) => (
                        <SelectItem key={suggestion.value} value={suggestion.value}>
                          <div className="flex items-center gap-2">
                            <span>{suggestion.label}</span>
                            {suggestion.isDefault && (
                              <Badge variant="secondary" className="text-xs">Suggested</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  // Fallback: free text input when no drug selected
                  <Input
                    id="dosage"
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
                <Label htmlFor="quantity">
                  Quantity <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  value={currentItem.quantity_prescribed || ''}
                  onChange={(e) =>
                    setCurrentItem((prev) => ({
                      ...prev,
                      quantity_prescribed: parseInt(e.target.value) || 0,
                    }))
                  }
                  className={errors.quantity ? 'border-destructive' : ''}
                />
                {errors.quantity && <p className="text-sm text-destructive">{errors.quantity}</p>}
              </div>
            </div>

            {/* Frequency and Duration */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="frequency">
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
                <Label htmlFor="duration">
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
                  <Label htmlFor="route">Route</Label>
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
                <Label htmlFor="instructions">Special Instructions</Label>
                <Input
                  id="instructions"
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
                id="substitutable"
                checked={currentItem.is_substitutable}
                onCheckedChange={(checked) =>
                  setCurrentItem((prev) => ({ ...prev, is_substitutable: checked === true }))
                }
              />
              <Label htmlFor="substitutable" className="text-sm cursor-pointer">
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

        {/* Clinical Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Clinical Notes</CardTitle>
            <CardDescription>
              Optional notes for the pharmacist
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Add any clinical notes or special instructions for the pharmacist..."
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={items.length === 0 || createPrescription.isPending}
          >
            {createPrescription.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Pill className="h-4 w-4 mr-2" />
            )}
            Create Prescription ({items.length} item{items.length !== 1 ? 's' : ''})
          </Button>
        </div>
      </div>
    </div>
  );
}
