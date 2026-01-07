/**
 * New Prescription Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Allows clinicians to create prescriptions for patients during encounters.
 * Features smart dosage suggestions based on selected drug properties.
 * Accessed from the encounter edit page's prescription tab.
 */

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
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
import { useToast } from '@/lib/hooks/use-toast';
import { usePatient } from '@/lib/hooks/use-patients';
import { useEncounter } from '@/lib/hooks/use-encounters';
import { useDrugs, useCreatePrescription } from '@/lib/hooks/use-pharmacy';
import {
  generateDosageSuggestions,
  getSuggestedRoute,
  getRouteOptions,
  getFrequencyOptions,
  getDurationOptions,
  type DosageSuggestion,
} from '@/lib/utils/dosage';
import type { Drug, PrescriptionItemCreateData } from '@/lib/types/pharmacy';

// Get options from utilities
const FREQUENCY_OPTIONS = getFrequencyOptions();
const DURATION_OPTIONS = getDurationOptions();
const ROUTE_OPTIONS = getRouteOptions();

interface PrescriptionItemForm extends PrescriptionItemCreateData {
  drug_name?: string;
  drug_strength?: string;
  drug_form?: string;
}

export default function NewPrescriptionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // Get encounter and patient IDs from URL params
  const encounterId = searchParams.get('encounter')
    ? parseInt(searchParams.get('encounter')!)
    : undefined;
  const patientId = searchParams.get('patient')
    ? parseInt(searchParams.get('patient')!)
    : undefined;

  // Fetch patient and encounter data
  const { data: patient, isLoading: patientLoading } = usePatient(patientId || 0);
  const { data: encounter, isLoading: encounterLoading } = useEncounter(encounterId || 0);

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

  // Generate smart dosage suggestions based on selected drug
  const dosageSuggestions = useMemo<DosageSuggestion[]>(() => {
    if (!selectedDrug) return [];
    return generateDosageSuggestions(selectedDrug);
  }, [selectedDrug]);

  // Create prescription mutation
  const createPrescription = useCreatePrescription();

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

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

    // Get smart defaults based on drug form
    const suggestedRoute = getSuggestedRoute(drug.form);
    const suggestions = generateDosageSuggestions(drug);
    const defaultDosage = suggestions.find((s) => s.isDefault)?.value || '';

    setCurrentItem((prev) => ({
      ...prev,
      drug: drug.id,
      drug_name: displayName,
      route: suggestedRoute.value,
      dosage: defaultDosage,
    }));
    setDrugSearch(displayName);
    setShowDrugSearch(false);
    setCustomDosage('');
    setShowCustomDosage(false);
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
            {/* Drug Search */}
            <div className="space-y-2">
              <Label htmlFor="drug-search">
                Drug <span className="text-destructive">*</span>
              </Label>
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
              {errors.drug && <p className="text-sm text-destructive">{errors.drug}</p>}
              
              {/* Selected drug info panel */}
              {selectedDrug && (
                <div className="mt-2 p-3 rounded-lg bg-muted/50 border">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-sm">
                        {selectedDrug.brand_names?.[0] || selectedDrug.generic_name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {selectedDrug.generic_name} • {selectedDrug.form} • <strong>{selectedDrug.strength}</strong>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {selectedDrug.requires_prescription && (
                        <Badge variant="outline" className="text-xs">Rx</Badge>
                      )}
                      {selectedDrug.is_controlled && (
                        <Badge variant="destructive" className="text-xs">Controlled</Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}
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
            <CardHeader>
              <CardTitle>Prescription Items ({items.length})</CardTitle>
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
