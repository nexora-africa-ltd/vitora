'use client';

import { useState, useCallback } from 'react';
import { Search, Plus, Trash2, AlertCircle, Check, X, ChevronLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
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
    setFormData(prev => ({
      ...prev,
      icd10_code: code.id,
      icd10_display: `${code.code} - ${code.short_description || code.description}`,
    }));
    setSearchQuery('');
    setIsSearchOpen(false);
  }, []);
  
  const handleClearCode = useCallback(() => {
    setSelectedCode(null);
    setFormData(prev => ({
      ...prev,
      icd10_code: null,
      icd10_display: undefined,
    }));
  }, []);
  
  const handleAdd = useCallback(() => {
    if (!selectedCode && !formData.free_text_diagnosis.trim()) {
      return; // Need either ICD-10 code or free text
    }
    
    onAdd({
      ...formData,
      icd10_display: selectedCode 
        ? `${selectedCode.code} - ${selectedCode.short_description || selectedCode.description}`
        : undefined,
    });
    
    // Reset form for next entry
    setSelectedCode(null);
    setFormData({
      icd10_code: null,
      diagnosis_type: 'SECONDARY', // Default to secondary for subsequent diagnoses
      free_text_diagnosis: '',
      notes: '',
      is_confirmed: false,
      certainty: 'SUSPECTED',
    });
  }, [formData, selectedCode, onAdd]);
  
  return (
    <div className="space-y-4 border-b pb-4 last:border-0 last:pb-0">
      {/* ICD-10 Search */}
      <div className="space-y-2">
        <Label>ICD-10 Code Search</Label>
        {selectedCode ? (
          <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/50">
            <Badge variant="outline" className="font-mono">
              {selectedCode.code}
            </Badge>
            <span className="flex-1 text-sm truncate">
              {selectedCode.short_description || selectedCode.description}
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
      </div>
      
      {/* Free Text Diagnosis (alternative) */}
      <div className="space-y-2">
        <Label htmlFor="free_text_diagnosis">
          {selectedCode ? 'Additional Description (Optional)' : 'Free Text Diagnosis'}
        </Label>
        <Input
          id="free_text_diagnosis"
          placeholder={selectedCode ? 'Additional notes about this diagnosis...' : 'Enter diagnosis if ICD-10 code not available...'}
          value={formData.free_text_diagnosis}
          onChange={(e) => setFormData(prev => ({ ...prev, free_text_diagnosis: e.target.value }))}
          disabled={disabled}
        />
      </div>
      
      {/* Diagnosis Type & Certainty */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select
            value={formData.diagnosis_type}
            onValueChange={(value) => setFormData(prev => ({ 
              ...prev, 
              diagnosis_type: value as 'PRIMARY' | 'SECONDARY' | 'DIFFERENTIAL' 
            }))}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PRIMARY">Primary</SelectItem>
              <SelectItem value="SECONDARY">Secondary</SelectItem>
              <SelectItem value="DIFFERENTIAL">Differential</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label>Certainty</Label>
          <Select
            value={formData.certainty}
            onValueChange={(value) => setFormData(prev => ({ 
              ...prev, 
              certainty: value as 'SUSPECTED' | 'PROBABLE' | 'CONFIRMED' 
            }))}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SUSPECTED">Suspected</SelectItem>
              <SelectItem value="PROBABLE">Probable</SelectItem>
              <SelectItem value="CONFIRMED">Confirmed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label>&nbsp;</Label>
          <div className="flex items-center space-x-2 h-10">
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
            <label htmlFor="is_confirmed" className="text-sm leading-none">
              Lab/Test Confirmed
            </label>
          </div>
        </div>
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
}

export function DiagnosisForm({ diagnoses, onAdd, onRemove, disabled = false, onPrevious }: DiagnosisFormProps) {
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
      {onPrevious && (
        <CardFooter className="border-t pt-4">
          <div className="flex justify-between w-full">
            <Button onClick={onPrevious} variant="outline">
              <ChevronLeft className="mr-2 h-4 w-4" />
              Previous: Clinical Notes
            </Button>
            <div className="text-sm text-muted-foreground flex items-center">
              Use the buttons above to create your encounter
            </div>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}

export default DiagnosisForm;
