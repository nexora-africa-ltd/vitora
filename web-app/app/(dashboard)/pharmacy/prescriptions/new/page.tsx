/**
 * New Prescription Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Allows clinicians to create prescriptions for patients during encounters.
 * Accessed from the encounter edit page's prescription tab.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
import { useToast } from '@/lib/hooks/use-toast';
import { usePatient } from '@/lib/hooks/use-patients';
import { useEncounter } from '@/lib/hooks/use-encounters';
import { useDrugs, useCreatePrescription } from '@/lib/hooks/use-pharmacy';
import type { Drug, PrescriptionItemCreateData } from '@/lib/types/pharmacy';

// Common dosage options
const DOSAGE_OPTIONS = [
  '5mg',
  '10mg',
  '25mg',
  '50mg',
  '100mg',
  '200mg',
  '250mg',
  '500mg',
  '1g',
  '5ml',
  '10ml',
  '15ml',
];

// Common frequency options
const FREQUENCY_OPTIONS = [
  { value: 'OD', label: 'Once daily (OD)' },
  { value: 'BD', label: 'Twice daily (BD)' },
  { value: 'TDS', label: 'Three times daily (TDS)' },
  { value: 'QID', label: 'Four times daily (QID)' },
  { value: 'STAT', label: 'Immediately (STAT)' },
  { value: 'PRN', label: 'As needed (PRN)' },
  { value: 'Q4H', label: 'Every 4 hours' },
  { value: 'Q6H', label: 'Every 6 hours' },
  { value: 'Q8H', label: 'Every 8 hours' },
  { value: 'Q12H', label: 'Every 12 hours' },
  { value: 'NOCTE', label: 'At night (NOCTE)' },
  { value: 'MANE', label: 'In the morning (MANE)' },
];

// Common duration options
const DURATION_OPTIONS = [
  '1 day',
  '3 days',
  '5 days',
  '7 days',
  '10 days',
  '14 days',
  '21 days',
  '30 days',
  '3 months',
  '6 months',
];

// Route options
const ROUTE_OPTIONS = [
  { value: 'PO', label: 'Oral (PO)' },
  { value: 'IV', label: 'Intravenous (IV)' },
  { value: 'IM', label: 'Intramuscular (IM)' },
  { value: 'SC', label: 'Subcutaneous (SC)' },
  { value: 'TOPICAL', label: 'Topical' },
  { value: 'INH', label: 'Inhaled' },
  { value: 'PR', label: 'Rectal (PR)' },
  { value: 'SL', label: 'Sublingual' },
  { value: 'OPTH', label: 'Ophthalmic' },
  { value: 'OTIC', label: 'Otic (Ear)' },
];

interface PrescriptionItemForm extends PrescriptionItemCreateData {
  drug_name?: string;
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
        quantity_prescribed: currentItem.quantity_prescribed!,
        dosage: currentItem.dosage!,
        frequency: currentItem.frequency!,
        duration: currentItem.duration!,
        route: currentItem.route,
        instructions: currentItem.instructions,
        is_substitutable: currentItem.is_substitutable,
      },
    ]);

    // Reset current item
    setCurrentItem({
      quantity_prescribed: 1,
      dosage: '',
      frequency: '',
      duration: '',
      route: 'PO',
      instructions: '',
      is_substitutable: true,
    });
    setDrugSearch('');
    setShowDrugSearch(false);
    setErrors({});
  }, [currentItem, validateItem]);

  // Remove item from prescription
  const handleRemoveItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Select drug from search results
  const handleSelectDrug = useCallback((drug: Drug) => {
    const displayName = drug.brand_names?.[0] || drug.generic_name;
    setCurrentItem((prev) => ({
      ...prev,
      drug: drug.id,
      drug_name: displayName,
    }));
    setDrugSearch(displayName);
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
              {currentItem.drug_name && (
                <Badge variant="secondary" className="mt-1">
                  Selected: {currentItem.drug_name}
                </Badge>
              )}
            </div>

            {/* Dosage and Quantity */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dosage">
                  Dosage <span className="text-destructive">*</span>
                </Label>
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
                    {DOSAGE_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                      <SelectItem key={d} value={d}>
                        {d}
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
                <Label htmlFor="route">Route</Label>
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
