/**
 * ICD-11 Select Component
 *
 * Searchable dropdown for selecting ICD-11 diagnosis codes.
 * Uses Kenya DHA API via our backend proxy with debounced search.
 *
 * @example
 * <ICD11Select
 *   onSelect={(code) => console.log(code.code, code.title)}
 *   value={selectedDiagnosis}
 *   placeholder="Search diagnosis..."
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
import type { ICD11SelectValue, ICD11Code } from '@/lib/terminology';

// ============================================================================
// Types
// ============================================================================

export interface ICD11SelectProps {
  /** Callback when a code is selected */
  onSelect: (code: ICD11SelectValue) => void;
  /** Currently selected value */
  value?: ICD11SelectValue | null;
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

export function ICD11Select({
  onSelect,
  value,
  placeholder = 'Search ICD-11 codes...',
  disabled = false,
  className,
  minSearchLength = 2,
  debounceMs = 300,
}: ICD11SelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<ICD11Code[]>([]);
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
        const response = await terminologyApi.searchICD11({
          search: searchQuery,
          page_size: 20
        });
        setResults(response.results);
      } catch (error) {
        console.error('ICD-11 search failed:', error);
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

  const handleSelect = (code: ICD11Code) => {
    onSelect({ code: code.code, title: code.title });
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
            'w-full justify-between h-auto min-h-10 py-2 text-foreground',
            !value && 'text-muted-foreground',
            className
          )}
        >
          {value ? (
            <div className="flex flex-col items-start gap-0.5 text-left flex-1 min-w-0 sm:flex-row sm:items-center sm:gap-2">
              <span className="font-mono text-xs text-primary shrink-0">{value.code}</span>
              <span className="text-sm text-foreground truncate">{value.title}</span>
            </div>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[280px] max-w-[min(450px,calc(100vw-1rem))] p-0"
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={8}
        avoidCollisions={true}
      >
        <Command shouldFilter={false}>
          <div className="flex items-center border-b border-border px-3 bg-background">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              placeholder="Search ICD-11 codes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <CommandList className="max-h-[50vh] sm:max-h-[300px]">
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
              <CommandEmpty className="text-muted-foreground">No ICD-11 codes found.</CommandEmpty>
            ) : (
              <CommandGroup>
                <ScrollArea className="h-[45vh] sm:h-[280px]">
                  {results.map((code, idx) => (
                    <CommandItem
                      key={code.code || code.id || idx}
                      value={`${code.code}-${code.title}`}
                      onSelect={() => handleSelect(code)}
                      className="flex items-start gap-2 py-2.5 px-3 cursor-pointer"
                    >
                      <Check
                        className={cn(
                          'h-4 w-4 mt-0.5 shrink-0 text-primary',
                          value?.code === code.code ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-xs text-primary">
                          {code.code}
                        </span>
                        <p className="text-sm font-medium text-foreground leading-snug">{code.title}</p>
                        {code.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
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

export default ICD11Select;
