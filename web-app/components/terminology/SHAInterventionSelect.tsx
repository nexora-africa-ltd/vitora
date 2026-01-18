/**
 * SHA Intervention Select Component
 *
 * Searchable dropdown for selecting SHA (Social Health Authority)
 * intervention/procedure codes with pricing information.
 *
 * @example
 * <SHAInterventionSelect
 *   onSelect={(intervention) => console.log(intervention)}
 *   facilityLevel={4}
 *   showPrice
 * />
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
import type { SHAIntervention, InterventionSearchParams } from '@/lib/terminology';

// ============================================================================
// Types
// ============================================================================

export interface SHAInterventionSelectProps {
  /** Callback when an intervention is selected */
  onSelect: (intervention: SHAIntervention | null) => void;
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
  /** Whether to allow clearing selection */
  allowClear?: boolean;
  /** Minimum characters to trigger search */
  minSearchLength?: number;
  /** Debounce delay in ms */
  debounceMs?: number;
}

// ============================================================================
// Intervention Item Sub-Component
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
  allowClear = true,
  minSearchLength = 2,
  debounceMs = 300,
}: SHAInterventionSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SHAIntervention[]>([]);
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
        const params: InterventionSearchParams = {
          search: searchQuery,
          facility_level: facilityLevel,
          category: category,
          page_size: 20,
        };
        const response = await terminologyApi.searchInterventions(params);
        setResults(response.results);
      } catch (error) {
        console.error('Intervention search failed:', error);
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
  }, [searchQuery, facilityLevel, category, minSearchLength, debounceMs]);

  const handleSelect = useCallback((intervention: SHAIntervention) => {
    onSelect(intervention);
    setOpen(false);
    setSearchQuery('');
  }, [onSelect]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
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
              {allowClear && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 shrink-0"
                  onClick={handleClear}
                >
                  <X className="h-3 w-3" />
                </Button>
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
              placeholder="Search SHA interventions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
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

export default SHAInterventionSelect;
