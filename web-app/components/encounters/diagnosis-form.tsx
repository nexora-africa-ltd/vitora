'use client';

import { useState, useCallback, useEffect } from 'react';
import { Search, Plus, Trash2, AlertCircle, Check, X, ChevronLeft, Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { ICD11Select } from '@/components/terminology';
import { useICD10Search } from '@/lib/hooks/use-encounter-form';
import { cn } from '@/lib/utils/cn';
import type { DiagnosisFormData, ICD10SearchResult } from '@/lib/types/encounter-form';

interface DiagnosisEntryProps {
  onAdd: (diagnosis: DiagnosisFormData) => void;
  onUpdate?: (index: number, diagnosis: DiagnosisFormData) => void;
  existingDiagnoses: DiagnosisFormData[];
  editingDiagnosis?: { index: number; data: DiagnosisFormData } | null;
  onCancelEdit?: () => void;
  disabled?: boolean;
}

export function DiagnosisEntry({ 
  onAdd, 
  onUpdate,
  existingDiagnoses, 
  editingDiagnosis,
  onCancelEdit,
  disabled = false 
}: DiagnosisEntryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedCode, setSelectedCode] = useState<ICD10SearchResult | null>(null);
  const [useICD11, setUseICD11] = useState(true); // Default to ICD-11
  const [icd11Value, setIcd11Value] = useState<{ code: string; title: string } | null>(null);

  const [formData, setFormData] = useState<DiagnosisFormData>({
    icd10_code: null,
    diagnosis_type: existingDiagnoses.some(d => d.diagnosis_type === 'PRIMARY') ? 'SECONDARY' : 'PRIMARY',
    free_text_diagnosis: '',
    notes: '',
    is_confirmed: false,
    certainty: 'SUSPECTED',
  });

  const { data: searchResults, isLoading: isSearching } = useICD10Search(searchQuery);

  // Populate form when editing an existing diagnosis
  useEffect(() => {
    if (editingDiagnosis) {
      setFormData(editingDiagnosis.data);
      // Set ICD-11 or ICD-10 selection based on existing data
      if (editingDiagnosis.data.icd11_code) {
        setUseICD11(true);
        setIcd11Value({ 
          code: editingDiagnosis.data.icd11_code, 
          title: editingDiagnosis.data.icd11_display?.replace(`${editingDiagnosis.data.icd11_code} - `, '') || '' 
        });
        setSelectedCode(null);
      } else if (editingDiagnosis.data.icd10_code) {
        setUseICD11(false);
        setSelectedCode({
          id: editingDiagnosis.data.icd10_code,
          code: editingDiagnosis.data.icd10_display?.split(' - ')[0] || '',
          description: editingDiagnosis.data.icd10_display?.split(' - ')[1] || '',
          short_description: editingDiagnosis.data.icd10_display?.split(' - ')[1] || '',
          category: '',
        });
        setIcd11Value(null);
      }
    } else {
      // Reset form when not editing
      setSelectedCode(null);
      setIcd11Value(null);
      setFormData({
        icd10_code: null,
        diagnosis_type: existingDiagnoses.some(d => d.diagnosis_type === 'PRIMARY') ? 'SECONDARY' : 'PRIMARY',
        free_text_diagnosis: '',
        notes: '',
        is_confirmed: false,
        certainty: 'SUSPECTED',
      });
    }
  }, [editingDiagnosis, existingDiagnoses]);

  const handleSelectCode = useCallback((code: ICD10SearchResult) => {
    setSelectedCode(code);
    setIcd11Value(null);
    setFormData(prev => ({
      ...prev,
      icd10_code: code.id,
      icd10_display: `${code.code} - ${code.short_description || code.description}`,
      icd11_code: undefined,
      icd11_display: undefined,
    }));
    setSearchQuery('');
    setIsSearchOpen(false);
  }, []);

  const handleSelectICD11 = useCallback((code: { code: string; title: string }) => {
    setIcd11Value(code);
    setSelectedCode(null);
    setFormData(prev => ({
      ...prev,
      icd10_code: null,
      icd10_display: undefined,
      icd11_code: code.code,
      icd11_display: `${code.code} - ${code.title}`,
    }));
  }, []);

  const handleClearCode = useCallback(() => {
    setSelectedCode(null);
    setIcd11Value(null);
    setFormData(prev => ({
      ...prev,
      icd10_code: null,
      icd10_display: undefined,
      icd11_code: undefined,
      icd11_display: undefined,
    }));
  }, []);

  const handleAdd = useCallback(() => {
    if (!selectedCode && !icd11Value && !formData.free_text_diagnosis.trim()) {
      return; // Need either ICD code or free text
    }

    const diagnosisData: DiagnosisFormData = {
      ...formData,
      icd10_display: selectedCode
        ? `${selectedCode.code} - ${selectedCode.short_description || selectedCode.description}`
        : formData.icd10_display,
      icd11_display: icd11Value
        ? `${icd11Value.code} - ${icd11Value.title}`
        : formData.icd11_display,
    };

    // If editing, update the existing diagnosis
    if (editingDiagnosis && onUpdate) {
      onUpdate(editingDiagnosis.index, diagnosisData);
    } else {
      onAdd(diagnosisData);
    }

    // Reset form for next entry
    setSelectedCode(null);
    setIcd11Value(null);
    setFormData({
      icd10_code: null,
      diagnosis_type: 'SECONDARY', // Default to secondary for subsequent diagnoses
      free_text_diagnosis: '',
      notes: '',
      is_confirmed: false,
      certainty: 'SUSPECTED',
    });
  }, [formData, selectedCode, icd11Value, onAdd, onUpdate, editingDiagnosis]);

  const hasSelectedCode = selectedCode || icd11Value;

  return (
    <div className="space-y-4 border-b pb-4 last:border-0 last:pb-0">
      {/* ICD Code Search with ICD-10/ICD-11 Tabs */}
      <div className="space-y-2">
        <Label>Diagnosis Code Search</Label>
        {hasSelectedCode ? (
          <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/50">
            <Badge variant="outline" className="font-mono">
              {selectedCode?.code || icd11Value?.code}
            </Badge>
            {icd11Value && (
              <Badge variant="secondary" className="text-xs">
                ICD-11
              </Badge>
            )}
            {selectedCode && (
              <Badge variant="secondary" className="text-xs">
                ICD-10
              </Badge>
            )}
            <span className="flex-1 text-sm truncate">
              {selectedCode?.short_description || selectedCode?.description || icd11Value?.title}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleClearCode}
              disabled={disabled}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* ICD Version Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn("text-sm", !useICD11 && "font-medium")}>ICD-10</span>
                <Switch
                  checked={useICD11}
                  onCheckedChange={setUseICD11}
                  disabled={disabled}
                />
                <span className={cn("text-sm", useICD11 && "font-medium")}>ICD-11</span>
              </div>
            </div>

            {/* ICD-10 Search */}
            {!useICD11 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search ICD-10 codes (e.g., malaria, J18, diabetes)..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  onFocus={() => setIsSearchOpen(true)}
                  className="pl-9"
                  disabled={disabled}
                />

                {/* Search Results Dropdown */}
                {isSearchOpen && searchQuery.length >= 2 && (
                  <Card className="absolute z-50 mt-1 w-full shadow-lg max-h-64 overflow-y-auto">
                    <CardContent className="p-2">
                      {isSearching ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center gap-2 p-2">
                              <Skeleton className="h-5 w-16" />
                              <Skeleton className="h-4 flex-1" />
                            </div>
                          ))}
                        </div>
                      ) : searchResults && searchResults.length > 0 ? (
                        <ul className="space-y-1">
                          {searchResults.map((code) => (
                            <li key={code.id}>
                              <button
                                type="button"
                                onClick={() => handleSelectCode(code)}
                                className="w-full flex items-start gap-2 p-2 rounded-md hover:bg-accent transition-colors text-left"
                              >
                                <Badge variant="outline" className="font-mono shrink-0">
                                  {code.code}
                                </Badge>
                                <span className="text-sm">
                                  {code.short_description || code.description}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-center text-muted-foreground py-4 text-sm">
                          No ICD-10 codes found for &quot;{searchQuery}&quot;
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* ICD-11 Search */}
            {useICD11 && (
              <ICD11Select
                value={icd11Value}
                onSelect={handleSelectICD11}
                placeholder="Search ICD-11 codes (e.g., malaria, diabetes)..."
                disabled={disabled}
              />
            )}
          </div>
        )}
      </div>

      {/* Free Text Diagnosis (alternative) */}
      <div className="space-y-2">
        <Label htmlFor="free_text_diagnosis">
          {selectedCode ? 'Additional Description (Optional)' : 'Free Text Diagnosis'}
        </Label>
        <Input
          id="free_text_diagnosis"
          placeholder={selectedCode ? 'Additional notes about this diagnosis...' : 'Enter diagnosis if ICD code not available...'}
          value={formData.free_text_diagnosis}
          onChange={(e) => setFormData(prev => ({ ...prev, free_text_diagnosis: e.target.value }))}
          disabled={disabled}
        />
      </div>

      {/* Diagnosis Type & Certainty */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <Label>Type</Label>
          <RadioGroup
            value={formData.diagnosis_type}
            onValueChange={(value) => setFormData(prev => ({
              ...prev,
              diagnosis_type: value as 'PRIMARY' | 'SECONDARY' | 'DIFFERENTIAL'
            }))}
            disabled={disabled}
            className="flex flex-wrap gap-3"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="PRIMARY" id="type-primary" />
              <Label htmlFor="type-primary" className="cursor-pointer font-normal">Primary</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="SECONDARY" id="type-secondary" />
              <Label htmlFor="type-secondary" className="cursor-pointer font-normal">Secondary</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="DIFFERENTIAL" id="type-differential" />
              <Label htmlFor="type-differential" className="cursor-pointer font-normal">Differential</Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-3">
          <Label>Certainty</Label>
          <RadioGroup
            value={formData.certainty}
            onValueChange={(value) => setFormData(prev => ({
              ...prev,
              certainty: value as 'SUSPECTED' | 'PROBABLE' | 'CONFIRMED' | 'RULED_OUT'
            }))}
            disabled={disabled}
            className="flex flex-wrap gap-3"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="SUSPECTED" id="certainty-suspected" />
              <Label htmlFor="certainty-suspected" className="cursor-pointer font-normal">Suspected</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="PROBABLE" id="certainty-probable" />
              <Label htmlFor="certainty-probable" className="cursor-pointer font-normal">Probable</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="CONFIRMED" id="certainty-confirmed" />
              <Label htmlFor="certainty-confirmed" className="cursor-pointer font-normal">Confirmed</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="RULED_OUT" id="certainty-ruled-out" />
              <Label htmlFor="certainty-ruled-out" className="cursor-pointer font-normal text-muted-foreground">Ruled Out</Label>
            </div>
          </RadioGroup>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="is_confirmed"
          checked={formData.is_confirmed}
          onCheckedChange={(checked) => setFormData(prev => ({
            ...prev,
            is_confirmed: checked === true,
            certainty: checked === true ? 'CONFIRMED' : prev.certainty,
          }))}
          disabled={disabled}
        />
        <label htmlFor="is_confirmed" className="text-sm leading-none cursor-pointer">
          Diagnostics Confirmed
        </label>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="diagnosis_notes">Diagnosis Notes</Label>
        <Textarea
          id="diagnosis_notes"
          placeholder="Notes specific to this diagnosis (e.g., clinical reasoning, supporting evidence)..."
          value={formData.notes}
          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          disabled={disabled}
          rows={2}
          className="resize-none"
        />
      </div>

      {/* Add/Update Button */}
      <div className="flex gap-2">
        {editingDiagnosis && onCancelEdit && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancelEdit}
            disabled={disabled}
            className="flex-1"
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        )}
        <Button
          type="button"
          onClick={handleAdd}
          disabled={disabled || (!selectedCode && !icd11Value && !formData.free_text_diagnosis.trim())}
          className={editingDiagnosis ? "flex-1" : "w-full"}
          variant={editingDiagnosis ? "default" : "default"}
        >
          {editingDiagnosis ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Update Diagnosis
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              Add Diagnosis
            </>
          )}
        </Button>
      </div>

      {/* Click outside to close search */}
      {isSearchOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsSearchOpen(false)}
        />
      )}
    </div>
  );
}

interface DiagnosisListDisplayProps {
  diagnoses: DiagnosisFormData[];
  onRemove: (index: number) => void;
  onEdit?: (index: number) => void;
  editingIndex?: number | null;
  disabled?: boolean;
}

export function DiagnosisListDisplay({ 
  diagnoses, 
  onRemove, 
  onEdit,
  editingIndex,
  disabled = false 
}: DiagnosisListDisplayProps) {
  if (diagnoses.length === 0) return null;

  const typeColors = {
    PRIMARY: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    SECONDARY: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    DIFFERENTIAL: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  };

  const certaintyColors = {
    SUSPECTED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    PROBABLE: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    CONFIRMED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    RULED_OUT: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 line-through',
  };

  return (
    <div className="space-y-3">
      <h4 className="font-medium text-sm">Added Diagnoses ({diagnoses.length})</h4>
      <ul className="space-y-2">
        {diagnoses.map((diagnosis, index) => (
          <li
            key={index}
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border bg-card transition-colors",
              editingIndex === index && "ring-2 ring-primary border-primary",
              diagnosis.certainty === 'RULED_OUT' && "opacity-60"
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge className={typeColors[diagnosis.diagnosis_type]}>
                  {diagnosis.diagnosis_type}
                </Badge>
                <Badge className={certaintyColors[diagnosis.certainty]}>
                  {diagnosis.certainty === 'RULED_OUT' ? 'RULED OUT' : diagnosis.certainty}
                </Badge>
                {diagnosis.is_confirmed && (
                  <Badge variant="outline" className="gap-1">
                    <Check className="h-3 w-3" />
                    Lab Confirmed
                  </Badge>
                )}
              </div>
              <p className={cn(
                "font-medium text-sm",
                diagnosis.certainty === 'RULED_OUT' && "line-through text-muted-foreground"
              )}>
                {diagnosis.icd11_display || diagnosis.icd10_display || diagnosis.free_text_diagnosis}
              </p>
              {diagnosis.notes && (
                <p className="text-sm text-muted-foreground mt-1">{diagnosis.notes}</p>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              {onEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(index)}
                  disabled={disabled || editingIndex === index}
                  className="text-muted-foreground hover:text-foreground"
                  title="Edit diagnosis"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRemove(index)}
                disabled={disabled}
                className="text-destructive hover:text-destructive"
                title="Remove diagnosis"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface DiagnosisFormContentProps {
  diagnoses: DiagnosisFormData[];
  onAdd: (diagnosis: DiagnosisFormData) => void;
  onRemove: (index: number) => void;
  onUpdate?: (index: number, diagnosis: DiagnosisFormData) => void;
  disabled?: boolean;
}

/**
 * Content-only version of the Diagnosis form (no Card wrapper)
 * Used in accordion-based layouts
 */
export function DiagnosisFormContent({ 
  diagnoses, 
  onAdd, 
  onRemove, 
  onUpdate,
  disabled = false 
}: DiagnosisFormContentProps) {
  const [editingDiagnosis, setEditingDiagnosis] = useState<{ index: number; data: DiagnosisFormData } | null>(null);

  const handleEdit = useCallback((index: number) => {
    const diagnosis = diagnoses[index];

    if (!diagnosis) return;

    setEditingDiagnosis({ index, data: { ...diagnosis } });
  }, [diagnoses]);

  const handleCancelEdit = useCallback(() => {
    setEditingDiagnosis(null);
  }, []);

  const handleUpdate = useCallback((index: number, data: DiagnosisFormData) => {
    if (onUpdate) {
      onUpdate(index, data);
    }
    setEditingDiagnosis(null);
  }, [onUpdate]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Add diagnoses using ICD-10/ICD-11 codes. Click the pencil icon to update certainty after lab results.
      </p>

      {/* List of added diagnoses */}
      <DiagnosisListDisplay
        diagnoses={diagnoses}
        onRemove={onRemove}
        onEdit={onUpdate ? handleEdit : undefined}
        editingIndex={editingDiagnosis?.index ?? null}
        disabled={disabled}
      />

      {/* Diagnosis entry form - Always visible for adding more */}
      <div className="pt-2">
        {editingDiagnosis ? (
          <div className="p-3 border-2 border-primary rounded-lg bg-primary/5">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Editing Diagnosis
            </h4>
            <DiagnosisEntry
              onAdd={onAdd}
              onUpdate={handleUpdate}
              existingDiagnoses={diagnoses}
              editingDiagnosis={editingDiagnosis}
              onCancelEdit={handleCancelEdit}
              disabled={disabled}
            />
          </div>
        ) : (
          <>
            {diagnoses.length > 0 && (
              <h4 className="text-sm font-medium mb-3 text-muted-foreground">Add Another Diagnosis</h4>
            )}
            <DiagnosisEntry
              onAdd={onAdd}
              existingDiagnoses={diagnoses}
              disabled={disabled}
            />
          </>
        )}
      </div>
    </div>
  );
}

interface DiagnosisFormProps {
  diagnoses: DiagnosisFormData[];
  onAdd: (diagnosis: DiagnosisFormData) => void;
  onRemove: (index: number) => void;
  onUpdate?: (index: number, diagnosis: DiagnosisFormData) => void;
  disabled?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
}

/**
 * Card-wrapped version of the Diagnosis form
 * Used in tab-based layouts (legacy)
 */
export function DiagnosisForm({ 
  diagnoses, 
  onAdd, 
  onRemove, 
  onUpdate,
  disabled = false, 
  onPrevious, 
  onNext 
}: DiagnosisFormProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Diagnosis (Dx)
          {diagnoses.length > 0 && (
            <Badge variant="secondary" className="ml-2">{diagnoses.length}</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Add diagnoses using ICD-10/ICD-11 codes. Click the pencil icon to update certainty after lab results.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DiagnosisFormContent
          diagnoses={diagnoses}
          onAdd={onAdd}
          onRemove={onRemove}
          onUpdate={onUpdate}
          disabled={disabled}
        />
      </CardContent>

      {/* Navigation Footer */}
      {(onPrevious || onNext) && (
        <CardFooter className="border-t pt-4">
          <div className="flex justify-between w-full">
            {onPrevious ? (
              <Button onClick={onPrevious} variant="secondary">
                ← Back to HPI
              </Button>
            ) : <div />}
            {onNext ? (
              <Button onClick={onNext} variant="secondary">
                Continue to Labs →
              </Button>
            ) : (
              <div className="text-sm text-muted-foreground flex items-center">
                Add diagnoses using the form above
              </div>
            )}
          </div>
        </CardFooter>
      )}
    </Card>
  );
}

export default DiagnosisForm;
