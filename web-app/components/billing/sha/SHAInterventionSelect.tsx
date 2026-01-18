/**
 * SHA Intervention Select Component
 * Searchable dropdown for selecting SHA interventions/procedures
 *
 * @see docs/sha-frontend-integration-guide.md - Flow 3
 */
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import type { SHAIntervention } from '@/lib/types/sha';
import { formatCurrency } from '@/lib/utils/format';

// ============================================================================
// Types
// ============================================================================

interface SHAInterventionSelectProps {
  /** Callback when an intervention is selected */
  onSelect: (intervention: SHAIntervention) => void;
  /** Currently selected intervention */
  value?: SHAIntervention | null;
  /** Facility level to filter by (1-6) */
  facilityLevel?: number;
  /** Category to filter by */
  category?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the select is disabled */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
  /** Whether to show price in the dropdown */
  showPrice?: boolean;
  /** Whether to show facility level in the dropdown */
  showFacilityLevel?: boolean;
}

// ============================================================================
// Intervention Item Component
// ============================================================================

interface InterventionItemProps {
  intervention: SHAIntervention;
  isSelected: boolean;
  showPrice?: boolean;
  showFacilityLevel?: boolean;
  onSelect: () => void;
}

function InterventionItem({
  intervention,
  isSelected,
  showPrice = true,
  showFacilityLevel = false,
  onSelect,
}: InterventionItemProps) {
  return (
    <CommandItem
      value={`${intervention.code}-${intervention.name}`}
      onSelect={onSelect}
      className="flex items-start gap-2 py-2"
    >
      <Check
        className={cn(
          'h-4 w-4 mt-0.5',
          isSelected ? 'opacity-100' : 'opacity-0'
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {intervention.code}
          </span>
          {intervention.requires_preauthorization && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
              Pre-auth
            </Badge>
          )}
        </div>
        <p className="text-sm font-medium truncate">{intervention.name}</p>
        {intervention.description && (
          <p className="text-xs text-muted-foreground truncate">
            {intervention.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1">
          {showPrice && intervention.price > 0 && (
            <span className="text-xs text-green-600 font-medium">
              {formatCurrency(intervention.price)}
            </span>
          )}
          {showFacilityLevel && intervention.facility_level && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
              Level {intervention.facility_level}
            </Badge>
          )}
          {intervention.category && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
              {intervention.category}
            </Badge>
          )}
        </div>
      </div>
    </CommandItem>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SHAInterventionSelect({
  onSelect,
  value,
  facilityLevel,
  category,
  placeholder = 'Search SHA interventions...',
  disabled = false,
  className,
  showPrice = true,
  showFacilityLevel = false,
}: SHAInterventionSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SHAIntervention[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await shaApi.searchInterventions({
          search: searchQuery,
          facility_level: facilityLevel,
          category: category,
          page_size: 20,
        });
        setResults(response.results);
      } catch (error) {
        console.error('Intervention search failed:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, facilityLevel, category]);

  const handleSelect = useCallback((intervention: SHAIntervention) => {
    onSelect(intervention);
    setOpen(false);
    setSearchQuery('');
  }, [onSelect]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null as unknown as SHAIntervention);
  }, [onSelect]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between h-auto min-h-10 py-2',
            !value && 'text-muted-foreground',
            className
          )}
        >
          {value ? (
            <div className="flex items-center gap-2 text-left flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {value.code}
                  </span>
                  {showPrice && value.price > 0 && (
                    <span className="text-xs text-green-600 font-medium">
                      {formatCurrency(value.price)}
                    </span>
                  )}
                </div>
                <p className="text-sm truncate">{value.name}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 shrink-0"
                onClick={handleClear}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              placeholder="Search SHA interventions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          <CommandList>
            {searchQuery.length < 2 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Type at least 2 characters to search...
              </div>
            ) : isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-1">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ))}
              </div>
            ) : results.length === 0 ? (
              <CommandEmpty>No interventions found.</CommandEmpty>
            ) : (
              <CommandGroup>
                <ScrollArea className="h-[300px]">
                  {results.map((intervention) => (
                    <InterventionItem
                      key={intervention.id}
                      intervention={intervention}
                      isSelected={value?.id === intervention.id}
                      showPrice={showPrice}
                      showFacilityLevel={showFacilityLevel}
                      onSelect={() => handleSelect(intervention)}
                    />
                  ))}
                </ScrollArea>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// ICD-11 Select Component
// ============================================================================

interface ICD11SelectProps {
  onSelect: (code: { code: string; title: string }) => void;
  value?: { code: string; title: string } | null;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ICD11Select({
  onSelect,
  value,
  placeholder = 'Search ICD-11 codes...',
  disabled = false,
  className,
}: ICD11SelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: number; code: string; title: string; description?: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await shaApi.searchICD11({ search: searchQuery, page_size: 20 });
        setResults(response.results);
      } catch (error) {
        console.error('ICD-11 search failed:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between h-auto min-h-10 py-2',
            !value && 'text-muted-foreground',
            className
          )}
        >
          {value ? (
            <div className="flex items-center gap-2 text-left flex-1 min-w-0">
              <span className="font-mono text-xs">{value.code}</span>
              <span className="text-sm truncate">{value.title}</span>
            </div>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              placeholder="Search ICD-11 codes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          <CommandList>
            {searchQuery.length < 2 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Type at least 2 characters to search...
              </div>
            ) : isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <CommandEmpty>No ICD-11 codes found.</CommandEmpty>
            ) : (
              <CommandGroup>
                <ScrollArea className="h-[300px]">
                  {results.map((code) => (
                    <CommandItem
                      key={code.id}
                      value={`${code.code}-${code.title}`}
                      onSelect={() => {
                        onSelect({ code: code.code, title: code.title });
                        setOpen(false);
                        setSearchQuery('');
                      }}
                      className="flex items-start gap-2 py-2"
                    >
                      <Check
                        className={cn(
                          'h-4 w-4 mt-0.5',
                          value?.code === code.code ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-xs text-muted-foreground">
                          {code.code}
                        </span>
                        <p className="text-sm font-medium">{code.title}</p>
                        {code.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {code.description}
                          </p>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </ScrollArea>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// LOINC Select Component
// ============================================================================

interface LOINCSelectProps {
  onSelect: (code: { code: string; name: string }) => void;
  value?: { code: string; name: string } | null;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function LOINCSelect({
  onSelect,
  value,
  placeholder = 'Search LOINC lab codes...',
  disabled = false,
  className,
}: LOINCSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: number; code: string; long_common_name: string; component: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await shaApi.searchLOINC({ search: searchQuery, page_size: 20 });
        setResults(response.results);
      } catch (error) {
        console.error('LOINC search failed:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between h-auto min-h-10 py-2',
            !value && 'text-muted-foreground',
            className
          )}
        >
          {value ? (
            <div className="flex items-center gap-2 text-left flex-1 min-w-0">
              <span className="font-mono text-xs">{value.code}</span>
              <span className="text-sm truncate">{value.name}</span>
            </div>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              placeholder="Search LOINC codes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          <CommandList>
            {searchQuery.length < 2 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Type at least 2 characters to search...
              </div>
            ) : isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <CommandEmpty>No LOINC codes found.</CommandEmpty>
            ) : (
              <CommandGroup>
                <ScrollArea className="h-[300px]">
                  {results.map((code) => (
                    <CommandItem
                      key={code.id}
                      value={`${code.code}-${code.long_common_name}`}
                      onSelect={() => {
                        onSelect({ code: code.code, name: code.long_common_name });
                        setOpen(false);
                        setSearchQuery('');
                      }}
                      className="flex items-start gap-2 py-2"
                    >
                      <Check
                        className={cn(
                          'h-4 w-4 mt-0.5',
                          value?.code === code.code ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-xs text-muted-foreground">
                          {code.code}
                        </span>
                        <p className="text-sm font-medium">{code.long_common_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {code.component}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </ScrollArea>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Drug Select Component
// ============================================================================

interface DrugSelectProps {
  onSelect: (drug: { code: string; name: string; price?: number }) => void;
  value?: { code: string; name: string; price?: number } | null;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showPrice?: boolean;
}

export function DrugSelect({
  onSelect,
  value,
  placeholder = 'Search drugs...',
  disabled = false,
  className,
  showPrice = true,
}: DrugSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<Array<{
    id: number;
    code: string;
    name: string;
    generic_name?: string;
    dosage_form?: string;
    strength?: string;
    price?: number;
    currency?: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await shaApi.searchDrugs({ search: searchQuery, page_size: 20 });
        setResults(response.results);
      } catch (error) {
        console.error('Drug search failed:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between h-auto min-h-10 py-2',
            !value && 'text-muted-foreground',
            className
          )}
        >
          {value ? (
            <div className="flex items-center gap-2 text-left flex-1 min-w-0">
              <span className="font-mono text-xs">{value.code}</span>
              <span className="text-sm truncate">{value.name}</span>
              {showPrice && value.price && (
                <span className="text-xs text-green-600">
                  {formatCurrency(value.price)}
                </span>
              )}
            </div>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              placeholder="Search drugs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          <CommandList>
            {searchQuery.length < 2 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Type at least 2 characters to search...
              </div>
            ) : isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <CommandEmpty>No drugs found.</CommandEmpty>
            ) : (
              <CommandGroup>
                <ScrollArea className="h-[300px]">
                  {results.map((drug) => (
                    <CommandItem
                      key={drug.id}
                      value={`${drug.code}-${drug.name}`}
                      onSelect={() => {
                        onSelect({
                          code: drug.code,
                          name: drug.name,
                          price: drug.price,
                        });
                        setOpen(false);
                        setSearchQuery('');
                      }}
                      className="flex items-start gap-2 py-2"
                    >
                      <Check
                        className={cn(
                          'h-4 w-4 mt-0.5',
                          value?.code === drug.code ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-xs text-muted-foreground">
                          {drug.code}
                        </span>
                        <p className="text-sm font-medium">{drug.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {drug.generic_name && <span>{drug.generic_name}</span>}
                          {drug.dosage_form && <span>• {drug.dosage_form}</span>}
                          {drug.strength && <span>• {drug.strength}</span>}
                        </div>
                        {showPrice && drug.price && (
                          <span className="text-xs text-green-600 font-medium">
                            {formatCurrency(drug.price)}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </ScrollArea>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default SHAInterventionSelect;
