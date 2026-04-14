'use client';

import { useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ICD11Select } from '@/components/terminology';
import { useICD10Search } from '@/lib/hooks/use-encounter-form';
import { encountersApi } from '@/lib/api/encounters';
import { cn } from '@/lib/utils/cn';
import type { ICD10SearchResult } from '@/lib/types/encounter-form';
import type { SNOMEDSearchResult } from '@/lib/types/encounter';

type CodingSystem = 'icd10' | 'icd11' | 'snomed';

export interface DiagnosisCodeValue {
  /** ICD-10 code ID (from database) */
  icd10Code: number | null;
  /** ICD-10 display string (e.g., "B50.0 - Malaria") */
  icd10Display: string;
  /** ICD-11 code string */
  icd11Code: string;
  /** ICD-11 display string (e.g., "1F40 - Malaria") */
  icd11Display: string;
  /** SNOMED CT concept ID */
  snomedCode?: string;
  /** SNOMED CT display (e.g., "Diabetes mellitus") */
  snomedDisplay?: string;
}

interface DiagnosisCodeInputProps {
  /** Current value */
  value: DiagnosisCodeValue;
  /** Callback when value changes */
  onChange: (value: DiagnosisCodeValue) => void;
  /** Label for the input */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Default to ICD-11 (default: true) */
  defaultToICD11?: boolean;
  /** Show the ICD version toggle (default: true) */
  showVersionToggle?: boolean;
  /** Show SNOMED CT search tab (default: true) */
  showSNOMED?: boolean;
  /** Optional className for the container */
  className?: string;
}

/**
 * Shared diagnosis code input that supports both ICD-10 and ICD-11 search.
 * Use this component anywhere you need to select a diagnosis code.
 */
export function DiagnosisCodeInput({
  value,
  onChange,
  label = 'Diagnosis Code',
  placeholder,
  disabled = false,
  defaultToICD11 = true,
  showVersionToggle = true,
  showSNOMED = true,
  className,
}: DiagnosisCodeInputProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [codingSystem, setCodingSystem] = useState<CodingSystem>(defaultToICD11 ? 'icd11' : 'icd10');
  const [snomedQuery, setSnomedQuery] = useState('');
  const [snomedResults, setSnomedResults] = useState<SNOMEDSearchResult[]>([]);
  const [snomedSearching, setSnomedSearching] = useState(false);
  const [isSnomedOpen, setIsSnomedOpen] = useState(false);

  const { data: searchResults, isLoading: isSearching } = useICD10Search(searchQuery);

  const hasSelectedCode = value.icd10Code || value.icd11Code || value.snomedCode;

  const handleSelectICD10 = useCallback((code: ICD10SearchResult) => {
    onChange({
      icd10Code: code.id,
      icd10Display: `${code.code} - ${code.short_description || code.description}`,
      icd11Code: '',
      icd11Display: '',
      snomedCode: value.snomedCode,
      snomedDisplay: value.snomedDisplay,
    });
    setSearchQuery('');
    setIsSearchOpen(false);
  }, [onChange, value.snomedCode, value.snomedDisplay]);

  const handleSelectICD11 = useCallback((code: { code: string; title: string }) => {
    onChange({
      icd10Code: null,
      icd10Display: '',
      icd11Code: code.code,
      icd11Display: `${code.code} - ${code.title}`,
      snomedCode: value.snomedCode,
      snomedDisplay: value.snomedDisplay,
    });
  }, [onChange, value.snomedCode, value.snomedDisplay]);

  const handleSelectSNOMED = useCallback((result: SNOMEDSearchResult) => {
    onChange({
      ...value,
      snomedCode: result.concept_id,
      snomedDisplay: result.display,
    });
    setSnomedQuery('');
    setIsSnomedOpen(false);
    setSnomedResults([]);
  }, [onChange, value]);

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

  const handleClear = useCallback(() => {
    onChange({
      icd10Code: null,
      icd10Display: '',
      icd11Code: '',
      icd11Display: '',
      snomedCode: '',
      snomedDisplay: '',
    });
  }, [onChange]);

  // Determine the display text and code to show
  const displayCode = value.icd10Display?.split(' - ')[0] || value.icd11Code || value.snomedCode;
  const displayText = value.icd10Display?.split(' - ').slice(1).join(' - ') ||
    value.icd11Display?.split(' - ').slice(1).join(' - ') ||
    value.snomedDisplay;
  const codeVersion = value.icd11Code ? 'ICD-11' : value.icd10Code ? 'ICD-10' : value.snomedCode ? 'SNOMED' : null;

  return (
    <div className={cn('space-y-2', className)}>
      {label && <Label>{label}</Label>}

      {hasSelectedCode ? (
        <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/50">
          <Badge variant="outline" className="font-mono shrink-0">
            {displayCode}
          </Badge>
          {codeVersion && (
            <Badge variant="secondary" className="text-xs shrink-0">
              {codeVersion}
            </Badge>
          )}
          {value.snomedCode && codeVersion !== 'SNOMED' && (
            <Badge variant="secondary" className="text-xs shrink-0 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
              SNOMED: {value.snomedCode}
            </Badge>
          )}
          <span className="flex-1 text-sm truncate">
            {displayText}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleClear}
            disabled={disabled}
            className="shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Coding System Selector */}
          {showVersionToggle && (
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
              {showSNOMED && (
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
              )}
            </div>
          )}

          {/* ICD-10 Search */}
          {codingSystem === 'icd10' && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder={placeholder || 'Search ICD-10 codes (e.g., malaria, J18, diabetes)...'}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                onBlur={() => {
                  // Delay closing to allow click on results
                  setTimeout(() => setIsSearchOpen(false), 200);
                }}
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
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectICD10(code);
                              }}
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
              value={value.icd11Code ? { code: value.icd11Code, title: displayText || '' } : null}
              onSelect={handleSelectICD11}
              placeholder={placeholder || 'Search ICD-11 codes (e.g., malaria, diabetes)...'}
              disabled={disabled}
            />
          )}

          {/* SNOMED CT Search */}
          {codingSystem === 'snomed' && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder={placeholder || 'Search SNOMED CT (e.g., diabetes mellitus, fracture)...'}
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
  );
}

/**
 * Create an empty DiagnosisCodeValue
 */
export function emptyDiagnosisCodeValue(): DiagnosisCodeValue {
  return {
    icd10Code: null,
    icd10Display: '',
    icd11Code: '',
    icd11Display: '',
    snomedCode: '',
    snomedDisplay: '',
  };
}
