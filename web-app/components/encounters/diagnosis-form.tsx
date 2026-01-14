'use client';

import { useState, useCallback } from 'react';
import { Search, Plus, Trash2, AlertCircle, Check, X, ChevronLeft } from 'lucide-react';
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
  existingDiagnoses: DiagnosisFormData[];
  disabled?: boolean;
}

export function DiagnosisEntry({ onAdd, existingDiagnoses, disabled = false }: DiagnosisEntryProps) {
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
    
    onAdd({
      ...formData,
      icd10_display: selectedCode 
        ? `${selectedCode.code} - ${selectedCode.short_description || selectedCode.description}`
        : undefined,
      icd11_display: icd11Value
        ? `${icd11Value.code} - ${icd11Value.title}`
        : undefined,
    });
    
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
  }, [formData, selectedCode, icd11Value, onAdd]);

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
              certainty: value as 'SUSPECTED' | 'PROBABLE' | 'CONFIRMED' 
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
        <Label htmlFor="diagnosis_notes">Clinical Notes</Label>
        <Textarea
          id="diagnosis_notes"
          placeholder="Additional clinical notes for this diagnosis..."
          value={formData.notes}
          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          disabled={disabled}
          rows={2}
          className="resize-none"
        />
      </div>
      
      {/* Add Button */}
      <Button
        type="button"
        onClick={handleAdd}
        disabled={disabled || (!selectedCode && !formData.free_text_diagnosis.trim())}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Diagnosis
      </Button>
      
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
  disabled?: boolean;
}

export function DiagnosisListDisplay({ diagnoses, onRemove, disabled = false }: DiagnosisListDisplayProps) {
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
  };
  
  return (
    <div className="space-y-3">
      <h4 className="font-medium text-sm">Added Diagnoses ({diagnoses.length})</h4>
      <ul className="space-y-2">
        {diagnoses.map((diagnosis, index) => (
          <li
            key={index}
            className="flex items-start gap-3 p-3 rounded-lg border bg-card"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge className={typeColors[diagnosis.diagnosis_type]}>
                  {diagnosis.diagnosis_type}
                </Badge>
                <Badge className={certaintyColors[diagnosis.certainty]}>
                  {diagnosis.certainty}
                </Badge>
                {diagnosis.is_confirmed && (
                  <Badge variant="outline" className="gap-1">
                    <Check className="h-3 w-3" />
                    Lab Confirmed
                  </Badge>
                )}
              </div>
              <p className="font-medium text-sm">
                {diagnosis.icd10_display || diagnosis.free_text_diagnosis}
              </p>
              {diagnosis.notes && (
                <p className="text-sm text-muted-foreground mt-1">{diagnosis.notes}</p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onRemove(index)}
              disabled={disabled}
              className="shrink-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface DiagnosisFormProps {
  diagnoses: DiagnosisFormData[];
  onAdd: (diagnosis: DiagnosisFormData) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
}

export function DiagnosisForm({ diagnoses, onAdd, onRemove, disabled = false, onPrevious, onNext }: DiagnosisFormProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Diagnoses
          {diagnoses.length > 0 && (
            <Badge variant="secondary" className="ml-2">{diagnoses.length}</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Add one or more diagnoses using ICD-10 codes. You can add comorbidities as secondary diagnoses.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* List of added diagnoses */}
        <DiagnosisListDisplay
          diagnoses={diagnoses}
          onRemove={onRemove}
          disabled={disabled}
        />
        
        {/* Diagnosis entry form - Always visible for adding more */}
        <div className="pt-2">
          {diagnoses.length > 0 && (
            <h4 className="text-sm font-medium mb-3 text-muted-foreground">Add Another Diagnosis</h4>
          )}
          <DiagnosisEntry
            onAdd={onAdd}
            existingDiagnoses={diagnoses}
            disabled={disabled}
          />
        </div>
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
