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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';
import { terminologyApi } from '@/lib/terminology';
import type { DrugSelectValue, DrugProduct, DrugSearchParams } from '@/lib/terminology';

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
  dosageForm,
  isControlled,
  minSearchLength = 2,
  debounceMs = 300,
}: DrugProductSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<DrugProduct[]>([]);
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
        const params: DrugSearchParams = {
          search: searchQuery,
          page_size: 20,
          dosage_form: dosageForm,
          is_controlled: isControlled,
        };
        const response = await terminologyApi.searchDrugs(params);
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
  }, [searchQuery, dosageForm, isControlled, minSearchLength, debounceMs]);

  const handleSelect = (drug: DrugProduct) => {
    onSelect({
      code: drug.code,
      name: drug.name,
      price: drug.price,
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
            {searchQuery.length < minSearchLength ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Type at least {minSearchLength} characters to search...
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
                      onSelect={() => handleSelect(drug)}
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

export default DrugProductSelect;
