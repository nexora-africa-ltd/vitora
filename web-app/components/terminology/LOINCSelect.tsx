/**
 * LOINC Select Component
 *
 * Searchable dropdown for selecting LOINC laboratory test codes.
 * Uses Kenya DHA API via our backend proxy with debounced search.
 *
 * @example
 * <LOINCSelect
 *   onSelect={(code) => console.log(code.code, code.name)}
 *   value={selectedTest}
 *   placeholder="Search lab tests..."
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
import { terminologyApi } from '@/lib/terminology';
import type { LOINCSelectValue, LOINCCode } from '@/lib/terminology';

// ============================================================================
// Types
// ============================================================================

export interface LOINCSelectProps {
  /** Callback when a code is selected */
  onSelect: (code: LOINCSelectValue) => void;
  /** Currently selected value */
  value?: LOINCSelectValue | null;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the select is disabled */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
  /** Minimum characters to trigger search */
  minSearchLength?: number;
  /** Debounce delay in ms */
  debounceMs?: number;
}

// ============================================================================
// Component
// ============================================================================

export function LOINCSelect({
  onSelect,
  value,
  placeholder = 'Search LOINC lab codes...',
  disabled = false,
  className,
  minSearchLength = 2,
  debounceMs = 300,
}: LOINCSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<LOINCCode[]>([]);
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
        const response = await terminologyApi.searchLOINC({
          search: searchQuery,
          page_size: 20
        });
        setResults(response.results);
      } catch (error) {
        console.error('LOINC search failed:', error);
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

  const handleSelect = (code: LOINCCode) => {
    onSelect({ code: code.code, name: code.long_common_name });
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
              <CommandEmpty>No LOINC codes found.</CommandEmpty>
            ) : (
              <CommandGroup>
                <ScrollArea className="h-[300px]">
                  {results.map((code) => (
                    <CommandItem
                      key={code.id}
                      value={`${code.code}-${code.long_common_name}`}
                      onSelect={() => handleSelect(code)}
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

export default LOINCSelect;
