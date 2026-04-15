'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Search, Plus, Trash2, AlertCircle, Check, X, ChevronLeft, Pencil, BrainCircuit, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { ICD11Select } from '@/components/terminology';
import { useICD10Search } from '@/lib/hooks/use-encounter-form';
import { useAIEnabled, useAIICD10Suggest } from '@/lib/hooks/use-ai';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flags';
import { SmartSuggestion } from '@/components/shared/smart-suggestion';
import { encountersApi } from '@/lib/api/encounters';
import { cn } from '@/lib/utils/cn';
import type { SmartSuggestion as SmartSuggestionType } from '@/lib/hooks/use-smart-suggestions';
import type { DiagnosisFormData, ICD10SearchResult } from '@/lib/types/encounter-form';
import type { AIICD10Suggestion } from '@/lib/types/ai';
import type { SNOMEDSearchResult } from '@/lib/types/encounter';

type CodingSystem = 'icd10' | 'icd11' | 'snomed';

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
  const [codingSystem, setCodingSystem] = useState<CodingSystem>('icd11');
  const [icd11Value, setIcd11Value] = useState<{ code: string; title: string } | null>(null);
  const [snomedValue, setSnomedValue] = useState<{ concept_id: string; display: string } | null>(null);
  const [snomedQuery, setSnomedQuery] = useState('');
  const [snomedResults, setSnomedResults] = useState<SNOMEDSearchResult[]>([]);
  const [snomedSearching, setSnomedSearching] = useState(false);
  const [isSnomedOpen, setIsSnomedOpen] = useState(false);

  const [formData, setFormData] = useState<DiagnosisFormData>({
    icd10_code: null,
    diagnosis_type: existingDiagnoses.some(d => d.diagnosis_type === 'PRIMARY') ? 'SECONDARY' : 'PRIMARY',
    free_text_diagnosis: '',
    notes: '',
    is_confirmed: false,
    certainty: 'suspected',
  });

  const { data: searchResults, isLoading: isSearching } = useICD10Search(searchQuery);

  // AI ICD-10 suggestions
  const aiEnabled = useAIEnabled();
  const {
    mutate: suggestICD10,
    data: aiSuggestions,
    isPending: isAISuggesting,
    reset: resetAISuggestions,
  } = useAIICD10Suggest();
  const [dismissedAISuggestions, setDismissedAISuggestions] = useState<Set<string>>(new Set());
  const smartAutopopulate = useFeatureFlag('smart_autopopulate');
  const autoTriggerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAISuggest = useCallback(() => {
    const text = formData.free_text_diagnosis.trim();
    if (text.length >= 3) {
      setDismissedAISuggestions(new Set());
      suggestICD10(text);
    }
  }, [formData.free_text_diagnosis, suggestICD10]);

  // Auto-trigger AI suggestions when smart_autopopulate is enabled (debounced)
  useEffect(() => {
    if (!smartAutopopulate || !aiEnabled) return;
    const text = formData.free_text_diagnosis.trim();
    if (text.length < 3) return;
    if (autoTriggerTimer.current) clearTimeout(autoTriggerTimer.current);
    autoTriggerTimer.current = setTimeout(() => {
      setDismissedAISuggestions(new Set());
      suggestICD10(text);
    }, 800);
    return () => {
      if (autoTriggerTimer.current) clearTimeout(autoTriggerTimer.current);
    };
  }, [smartAutopopulate, aiEnabled, formData.free_text_diagnosis, suggestICD10]);

  // Build smart suggestion from top AI result (high confidence only)
  const topSmartSuggestion: SmartSuggestionType | null = useMemo(() => {
    if (!smartAutopopulate || !aiSuggestions?.suggestions?.length) return null;
    const top = aiSuggestions.suggestions[0]!;
    if (top.confidence < 0.85 || dismissedAISuggestions.has(top.code)) return null;
    return {
      id: `ai-icd10-${top.code}`,
      field_name: 'primary_diagnosis',
      value: top,
      confidence: top.confidence,
      reason: `AI suggests ${top.code} — ${top.description}`,
      source: 'ai',
      status: 'pending',
    };
  }, [smartAutopopulate, aiSuggestions, dismissedAISuggestions]);

  const handleDismissAISuggestion = useCallback((code: string) => {
    setDismissedAISuggestions(prev => new Set([...prev, code]));
  }, []);

  const handleAcceptAISuggestion = useCallback((suggestion: AIICD10Suggestion) => {
    // Convert AI suggestion to ICD10SearchResult-like selection
    const asResult: ICD10SearchResult = {
      id: 0, // Will be resolved via manual search or kept as code-only
      code: suggestion.code,
      description: suggestion.description,
      short_description: suggestion.description,
      category: '',
    };
    setSelectedCode(asResult);
    setIcd11Value(null);
    setSnomedValue(null);
    setFormData(prev => ({
      ...prev,
      icd10_code: null, // No DB id from AI — code-based selection
      icd10_display: `${suggestion.code} - ${suggestion.description}`,
      icd11_code: undefined,
      icd11_display: undefined,
      snomed_code: undefined,
      snomed_display: undefined,
    }));
    setSearchQuery('');
    setIsSearchOpen(false);
    setCodingSystem('icd10');
  }, []);

  // Filter out dismissed suggestions
  const visibleAISuggestions = aiSuggestions?.suggestions?.filter(
    s => !dismissedAISuggestions.has(s.code)
  ) || [];

  // Populate form when editing an existing diagnosis
  useEffect(() => {
    if (editingDiagnosis) {
      setFormData(editingDiagnosis.data);
      // Set coding system selection based on existing data
      if (editingDiagnosis.data.snomed_code) {
        setCodingSystem('snomed');
        setSnomedValue({
          concept_id: editingDiagnosis.data.snomed_code,
          display: editingDiagnosis.data.snomed_display || '',
        });
        setSelectedCode(null);
        setIcd11Value(null);
      } else if (editingDiagnosis.data.icd11_code) {
        setCodingSystem('icd11');
        setIcd11Value({
          code: editingDiagnosis.data.icd11_code,
          title: editingDiagnosis.data.icd11_display?.replace(`${editingDiagnosis.data.icd11_code} - `, '') || ''
        });
        setSelectedCode(null);
        setSnomedValue(null);
      } else if (editingDiagnosis.data.icd10_code) {
        setCodingSystem('icd10');
        setSelectedCode({
          id: editingDiagnosis.data.icd10_code,
          code: editingDiagnosis.data.icd10_display?.split(' - ')[0] || '',
          description: editingDiagnosis.data.icd10_display?.split(' - ')[1] || '',
          short_description: editingDiagnosis.data.icd10_display?.split(' - ')[1] || '',
          category: '',
        });
        setIcd11Value(null);
        setSnomedValue(null);
      }
    } else {
      // Reset form when not editing
      setSelectedCode(null);
      setIcd11Value(null);
      setSnomedValue(null);
      setFormData({
        icd10_code: null,
        diagnosis_type: existingDiagnoses.some(d => d.diagnosis_type === 'PRIMARY') ? 'SECONDARY' : 'PRIMARY',
        free_text_diagnosis: '',
        notes: '',
        is_confirmed: false,
        certainty: 'suspected',
      });
    }
  }, [editingDiagnosis, existingDiagnoses]);

  const handleSelectCode = useCallback((code: ICD10SearchResult) => {
    setSelectedCode(code);
    setIcd11Value(null);
    setSnomedValue(null);
    setFormData(prev => ({
      ...prev,
      icd10_code: code.id,
      icd10_display: `${code.code} - ${code.short_description || code.description}`,
      icd11_code: undefined,
      icd11_display: undefined,
      snomed_code: undefined,
      snomed_display: undefined,
    }));
    setSearchQuery('');
    setIsSearchOpen(false);
  }, []);

  const handleSelectICD11 = useCallback((code: { code: string; title: string }) => {
    setIcd11Value(code);
    setSelectedCode(null);
    setSnomedValue(null);
    setFormData(prev => ({
      ...prev,
      icd10_code: null,
      icd10_display: undefined,
      icd11_code: code.code,
      icd11_display: `${code.code} - ${code.title}`,
      snomed_code: undefined,
      snomed_display: undefined,
    }));
  }, []);

  const handleSelectSNOMED = useCallback((result: SNOMEDSearchResult) => {
    setSnomedValue({ concept_id: result.concept_id, display: result.display });
    setSelectedCode(null);
    setIcd11Value(null);
    setFormData(prev => ({
      ...prev,
      icd10_code: null,
      icd10_display: undefined,
      icd11_code: undefined,
      icd11_display: undefined,
      snomed_code: result.concept_id,
      snomed_display: result.display,
    }));
    setSnomedQuery('');
    setIsSnomedOpen(false);
    setSnomedResults([]);
  }, []);

  const handleSnomedSearch = useCallback(async (query: string) => {
    setSnomedQuery(query);
    if (query.length < 2) {
      setSnomedResults([]);
      return;
    }
    setSnomedSearching(true);
    try {
      const data = await encountersApi.searchSNOMED(query);
      setSnomedResults(data.results);
    } catch {
      setSnomedResults([]);
    } finally {
      setSnomedSearching(false);
    }
  }, []);

  const handleClearCode = useCallback(() => {
    setSelectedCode(null);
    setIcd11Value(null);
    setSnomedValue(null);
    setFormData(prev => ({
      ...prev,
      icd10_code: null,
      icd10_display: undefined,
      icd11_code: undefined,
      icd11_display: undefined,
      snomed_code: undefined,
      snomed_display: undefined,
    }));
  }, []);

  const handleAdd = useCallback(() => {
    if (!selectedCode && !icd11Value && !snomedValue && !formData.free_text_diagnosis.trim()) {
      return; // Need either a code or free text
    }

    const diagnosisData: DiagnosisFormData = {
      ...formData,
      icd10_display: selectedCode
        ? `${selectedCode.code} - ${selectedCode.short_description || selectedCode.description}`
        : formData.icd10_display,
      icd11_display: icd11Value
        ? `${icd11Value.code} - ${icd11Value.title}`
        : formData.icd11_display,
      snomed_code: snomedValue?.concept_id ?? formData.snomed_code,
      snomed_display: snomedValue?.display ?? formData.snomed_display,
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
    setSnomedValue(null);
    setFormData({
      icd10_code: null,
      diagnosis_type: 'SECONDARY', // Default to secondary for subsequent diagnoses
      free_text_diagnosis: '',
      notes: '',
      is_confirmed: false,
      certainty: 'suspected',
    });
  }, [formData, selectedCode, icd11Value, snomedValue, onAdd, onUpdate, editingDiagnosis]);

  const hasSelectedCode = selectedCode || icd11Value || snomedValue;

  return (
    <div className="space-y-4 border-b pb-4 last:border-0 last:pb-0">
      {/* ICD Code Search with ICD-10/ICD-11/SNOMED Tabs */}
      <div className="space-y-2">
        <Label>Diagnosis Code Search</Label>
        {hasSelectedCode ? (
          <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/50">
            <Badge variant="outline" className="font-mono">
              {selectedCode?.code || icd11Value?.code || snomedValue?.concept_id}
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
            {snomedValue && (
              <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                SNOMED
              </Badge>
            )}
            <span className="flex-1 text-sm truncate">
              {selectedCode?.short_description || selectedCode?.description || icd11Value?.title || snomedValue?.display}
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
            {/* Coding System Pill Selector */}
            <div className="flex gap-1 rounded-md border p-1 w-fit">
              <button
                type="button"
                onClick={() => setCodingSystem('icd10')}
                className={cn(
                  'px-3 py-1 rounded text-xs font-medium transition-colors',
                  codingSystem === 'icd10' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                )}
              >
                ICD-10
              </button>
              <button
                type="button"
                onClick={() => setCodingSystem('icd11')}
                className={cn(
                  'px-3 py-1 rounded text-xs font-medium transition-colors',
                  codingSystem === 'icd11' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                )}
              >
                ICD-11
              </button>
              <button
                type="button"
                onClick={() => setCodingSystem('snomed')}
                className={cn(
                  'px-3 py-1 rounded text-xs font-medium transition-colors',
                  codingSystem === 'snomed' ? 'bg-purple-600 text-white' : 'hover:bg-accent'
                )}
              >
                SNOMED
              </button>
            </div>

            {/* ICD-10 Search */}
            {codingSystem === 'icd10' && (
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
            {codingSystem === 'icd11' && (
              <ICD11Select
                value={icd11Value}
                onSelect={handleSelectICD11}
                placeholder="Search ICD-11 codes (e.g., malaria, diabetes)..."
                disabled={disabled}
              />
            )}

            {/* SNOMED CT Search */}
            {codingSystem === 'snomed' && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search SNOMED CT (e.g., diabetes mellitus, fracture)..."
                  value={snomedQuery}
                  onChange={(e) => {
                    handleSnomedSearch(e.target.value);
                    setIsSnomedOpen(true);
                  }}
                  onFocus={() => setIsSnomedOpen(true)}
                  onBlur={() => {
                    setTimeout(() => setIsSnomedOpen(false), 200);
                  }}
                  className="pl-9"
                  disabled={disabled}
                />

                {isSnomedOpen && snomedQuery.length >= 2 && (
                  <Card className="absolute z-50 mt-1 w-full shadow-lg max-h-64 overflow-y-auto">
                    <CardContent className="p-2">
                      {snomedSearching ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center gap-2 p-2">
                              <Skeleton className="h-5 w-20" />
                              <Skeleton className="h-4 flex-1" />
                            </div>
                          ))}
                        </div>
                      ) : snomedResults.length > 0 ? (
                        <ul className="space-y-1">
                          {snomedResults.map((result) => (
                            <li key={result.concept_id}>
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleSelectSNOMED(result);
                                }}
                                className="w-full flex items-start gap-2 p-2 rounded-md hover:bg-accent transition-colors text-left"
                              >
                                <Badge variant="outline" className="font-mono shrink-0 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400">
                                  {result.concept_id}
                                </Badge>
                                <div className="min-w-0">
                                  <span className="text-sm">{result.display}</span>
                                  {result.semantic_tag && (
                                    <span className="text-xs text-muted-foreground ml-1">
                                      ({result.semantic_tag})
                                    </span>
                                  )}
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-center text-muted-foreground py-4 text-sm">
                          No SNOMED CT concepts found for &quot;{snomedQuery}&quot;
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Free Text Diagnosis with inline AI Suggest button */}
      <div className="space-y-2">
        <Label htmlFor="free_text_diagnosis">
          {hasSelectedCode ? 'Additional Description (Optional)' : 'Free Text Diagnosis'}
        </Label>
        <div className="relative">
          <Input
            id="free_text_diagnosis"
            placeholder={hasSelectedCode ? 'Additional notes about this diagnosis...' : 'Enter diagnosis if code not available...'}
            value={formData.free_text_diagnosis}
            onChange={(e) => setFormData(prev => ({ ...prev, free_text_diagnosis: e.target.value }))}
            disabled={disabled}
            className={cn(aiEnabled && formData.free_text_diagnosis.trim().length >= 3 && 'pr-28 sm:pr-36')}
          />
          {/* AI Suggest button — rendered inside input when sufficient text */}
          {aiEnabled && formData.free_text_diagnosis.trim().length >= 3 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAISuggest}
              disabled={disabled || isAISuggesting}
              className="absolute right-1 top-1/2 -translate-y-1/2 gap-1 h-7 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:text-purple-300 dark:hover:bg-purple-950/40"
            >
              {isAISuggesting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <BrainCircuit className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">
                {isAISuggesting ? 'Suggesting...' : 'AI Suggest'}
              </span>
            </Button>
          )}
        </div>

        {/* Smart Suggestion — high-confidence auto-suggested (smart_autopopulate only) */}
        {topSmartSuggestion && (
          <SmartSuggestion
            suggestion={topSmartSuggestion}
            onAccept={() => {
              const s = topSmartSuggestion.value as AIICD10Suggestion;
              handleAcceptAISuggestion(s);
            }}
            onReject={() => {
              const s = topSmartSuggestion.value as AIICD10Suggestion;
              handleDismissAISuggestion(s.code);
            }}
            variant="inline"
            formatValue={(v) => {
              const s = v as AIICD10Suggestion;
              return `${s.code} — ${s.description}`;
            }}
            disabled={disabled}
          />
        )}

        {/* AI Suggestion Results */}
        {visibleAISuggestions.length > 0 && (
          <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700 dark:text-purple-400">
              <BrainCircuit className="h-3.5 w-3.5" />
              AI Suggested Codes
              <span className="text-muted-foreground font-normal">(click to accept)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {visibleAISuggestions.map((suggestion) => (
                <div
                  key={suggestion.code}
                  className="group flex items-center gap-1 rounded-md border border-purple-200 dark:border-purple-700 bg-white dark:bg-purple-950/40 px-2 py-1 text-sm transition-colors hover:border-purple-400 dark:hover:border-purple-500"
                >
                  <button
                    type="button"
                    onClick={() => handleAcceptAISuggestion(suggestion)}
                    className="flex items-center gap-1.5 text-left"
                    disabled={disabled}
                  >
                    <Badge variant="outline" className="font-mono text-xs shrink-0">
                      {suggestion.code}
                    </Badge>
                    <span className="text-xs truncate max-w-[180px]">
                      {suggestion.description}
                    </span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] shrink-0",
                        suggestion.confidence >= 0.8
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : suggestion.confidence >= 0.5
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      )}
                    >
                      {Math.round(suggestion.confidence * 100)}%
                    </Badge>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDismissAISuggestion(suggestion.code)}
                    className="ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
                    title="Dismiss suggestion"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Error/Unavailable Message */}
        {aiSuggestions?.error && visibleAISuggestions.length === 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {aiSuggestions.error}
          </p>
        )}
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
              certainty: value as 'suspected' | 'probable' | 'confirmed' | 'ruled_out'
            }))}
            disabled={disabled}
            className="flex flex-wrap gap-3"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="suspected" id="certainty-suspected" />
              <Label htmlFor="certainty-suspected" className="cursor-pointer font-normal">Suspected</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="probable" id="certainty-probable" />
              <Label htmlFor="certainty-probable" className="cursor-pointer font-normal">Probable</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="confirmed" id="certainty-confirmed" />
              <Label htmlFor="certainty-confirmed" className="cursor-pointer font-normal">Confirmed</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="ruled_out" id="certainty-ruled-out" />
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
            certainty: checked === true ? 'confirmed' : prev.certainty,
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
          disabled={disabled || (!selectedCode && !icd11Value && !snomedValue && !formData.free_text_diagnosis.trim())}
          className={editingDiagnosis ? "flex-1" : "w-full"}
          variant={editingDiagnosis ? "default" : hasSelectedCode || formData.free_text_diagnosis.trim() ? "default" : "outline"}
        >
          {editingDiagnosis ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Update Diagnosis
            </>
          ) : hasSelectedCode || formData.free_text_diagnosis.trim() ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Save Diagnosis
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
      {(isSearchOpen || isSnomedOpen) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setIsSearchOpen(false);
            setIsSnomedOpen(false);
          }}
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
    WORKING: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  };

  const certaintyColors = {
    suspected: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    probable: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    confirmed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    ruled_out: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 line-through',
    provisional: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
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
              diagnosis.certainty === 'ruled_out' && "opacity-60"
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge className={typeColors[diagnosis.diagnosis_type]}>
                  {diagnosis.diagnosis_type}
                </Badge>
                <Badge className={certaintyColors[diagnosis.certainty]}>
                  {diagnosis.certainty === 'ruled_out' ? 'RULED OUT' : diagnosis.certainty}
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
                diagnosis.certainty === 'ruled_out' && "line-through text-muted-foreground"
              )}>
                {diagnosis.snomed_display
                  ? `${diagnosis.snomed_display}`
                  : diagnosis.icd11_display || diagnosis.icd10_display || diagnosis.free_text_diagnosis}
              </p>
              {diagnosis.snomed_code && (
                <Badge variant="secondary" className="text-[10px] mt-1 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                  SNOMED: {diagnosis.snomed_code}
                </Badge>
              )}
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
