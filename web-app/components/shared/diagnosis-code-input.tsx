'use client';

import { useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ICD11Select } from '@/components/terminology';
import { useICD10Search } from '@/lib/hooks/use-encounter-form';
import { cn } from '@/lib/utils/cn';
import type { ICD10SearchResult } from '@/lib/types/encounter-form';

export interface DiagnosisCodeValue {
  /** ICD-10 code ID (from database) */
  icd10Code: number | null;
  /** ICD-10 display string (e.g., "B50.0 - Malaria") */
  icd10Display: string;
  /** ICD-11 code string */
  icd11Code: string;
  /** ICD-11 display string (e.g., "1F40 - Malaria") */
  icd11Display: string;
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
  className,
}: DiagnosisCodeInputProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [useICD11, setUseICD11] = useState(defaultToICD11);

  const { data: searchResults, isLoading: isSearching } = useICD10Search(searchQuery);

  const hasSelectedCode = value.icd10Code || value.icd11Code;

  const handleSelectICD10 = useCallback((code: ICD10SearchResult) => {
    onChange({
      icd10Code: code.id,
      icd10Display: `${code.code} - ${code.short_description || code.description}`,
      icd11Code: '',
      icd11Display: '',
    });
    setSearchQuery('');
    setIsSearchOpen(false);
  }, [onChange]);

  const handleSelectICD11 = useCallback((code: { code: string; title: string }) => {
    onChange({
      icd10Code: null,
      icd10Display: '',
      icd11Code: code.code,
      icd11Display: `${code.code} - ${code.title}`,
    });
  }, [onChange]);

  const handleClear = useCallback(() => {
    onChange({
      icd10Code: null,
      icd10Display: '',
      icd11Code: '',
      icd11Display: '',
    });
  }, [onChange]);

  // Determine the display text and code to show
  const displayCode = value.icd10Display?.split(' - ')[0] || value.icd11Code;
  const displayText = value.icd10Display?.split(' - ').slice(1).join(' - ') || 
    value.icd11Display?.split(' - ').slice(1).join(' - ');
  const codeVersion = value.icd11Code ? 'ICD-11' : value.icd10Code ? 'ICD-10' : null;

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
          {/* ICD Version Toggle */}
          {showVersionToggle && (
            <div className="flex items-center gap-2">
              <span className={cn('text-sm', !useICD11 && 'font-medium')}>ICD-10</span>
              <Switch
                checked={useICD11}
                onCheckedChange={setUseICD11}
                disabled={disabled}
              />
              <span className={cn('text-sm', useICD11 && 'font-medium')}>ICD-11</span>
            </div>
          )}

          {/* ICD-10 Search */}
          {!useICD11 && (
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
                              onClick={() => handleSelectICD10(code)}
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
              value={value.icd11Code ? { code: value.icd11Code, title: displayText || '' } : null}
              onSelect={handleSelectICD11}
              placeholder={placeholder || 'Search ICD-11 codes (e.g., malaria, diabetes)...'}
              disabled={disabled}
            />
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
  };
}
