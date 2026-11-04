/**
 * Drug Product Select Component
 *
 * Searchable dropdown for selecting drugs from Kenya drug registry.
 * Uses Kenya DHA API via our backend proxy with debounced search.
 *
 * @example
 * <DrugProductSelect
 *   onSelect={(drug) => console.log(drug.code, drug.name)}
 *   value={selectedDrug}
 *   showPrice
 * />
 */
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';
import type { DrugSelectValue } from '@/lib/terminology';
import { pharmacyApi } from '@/lib/api/pharmacy';
import type { HptSearchResult } from '@/lib/types/pharmacy';

// ============================================================================
// Types
// ============================================================================

export interface DrugProductSelectProps {
  /** Callback when a drug is selected */
  onSelect: (drug: DrugSelectValue) => void;
  /** Currently selected value */
  value?: DrugSelectValue | null;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the select is disabled */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
  /** Whether to show price in the dropdown */
  showPrice?: boolean;
  /** Filter by dosage form */
  dosageForm?: string;
  /** Filter by controlled status */
  isControlled?: boolean;
  /** Minimum characters to trigger search */
  minSearchLength?: number;
  /** Debounce delay in ms */
  debounceMs?: number;
}

// ============================================================================
// Component
// ============================================================================

export function DrugProductSelect({
  onSelect,
  value,
  placeholder = 'Search drugs...',
  disabled = false,
  className,
  showPrice = true,
  minSearchLength = 2,
  debounceMs = 300,
}: DrugProductSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<HptSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < minSearchLength) {
      setResults([]);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await pharmacyApi.hptSearch(searchQuery);
        setResults(response.results);
      } catch (error) {
        console.error('Drug search failed:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, debounceMs);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, minSearchLength, debounceMs]);

  const handleSelect = (drug: HptSearchResult) => {
    if (!drug.local_drug_id || !drug.is_stocked) return;
    onSelect({
      code: drug.code,
      name: drug.display,
      localDrugId: drug.local_drug_id,
      isStocked: drug.is_stocked,
      system: drug.system,
    });
    setOpen(false);
    setSearchQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-auto min-h-10 w-full justify-between py-2',
            !value && 'text-muted-foreground',
            className
          )}
        >
          {value ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <span className="font-mono text-xs">{value.code}</span>
              <span className="truncate text-sm">{value.name}</span>
              {showPrice && value.price && (
                <span className="text-xs text-green-600">{formatCurrency(value.price)}</span>
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
              placeholder="Search DHA HPT concepts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          <CommandList>
            {searchQuery.length < minSearchLength ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Type at least {minSearchLength} characters to search...
              </div>
            ) : isLoading ? (
              <div className="space-y-2 p-4">
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
                      key={drug.code}
                      value={`${drug.code}-${drug.display}`}
                      onSelect={() => handleSelect(drug)}
                      disabled={!drug.local_drug_id || !drug.is_stocked}
                      className="flex items-start gap-2 py-2"
                    >
                      <Check
                        className={cn(
                          'mt-0.5 h-4 w-4',
                          value?.code === drug.code ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-xs text-muted-foreground">{drug.code}</span>
                          <p className="text-sm font-medium">{drug.display}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{drug.owner} • {drug.source}</span>
                          </div>
                        <span className="text-xs font-medium text-muted-foreground">
                          {drug.is_stocked
                            ? 'Stocked locally'
                            : drug.local_drug_id
                              ? 'Catalogued, not stocked'
                              : 'Not in local catalog'}
                        </span>
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

export default DrugProductSelect;
