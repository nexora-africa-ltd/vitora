'use client';

import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { apiClient } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

interface SHATariffResult {
  code: string;
  name: string;
  category?: string;
  price?: number | null;
}

interface SHATariffComboboxProps {
  value?: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function SHATariffCombobox({ value, onValueChange, disabled }: SHATariffComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['sha-interventions-search', debouncedSearch],
    queryFn: async (): Promise<SHATariffResult[]> => {
      if (!debouncedSearch || debouncedSearch.length < 2) return [];
      const response = await apiClient.get(
        `/api/billing/terminology/interventions/?search=${encodeURIComponent(debouncedSearch)}&limit=30`
      );
      const results = (response.data?.results || []) as Array<Record<string, unknown>>;
      return results.map((r) => ({
        code: String(r.code || ''),
        name: String(r.name || ''),
        category: r.category ? String(r.category) : undefined,
        price: typeof r.price === 'number' ? r.price : null,
      }));
    },
    enabled: open && debouncedSearch.length >= 2,
  });

  const tariffs = useMemo(() => data || [], [data]);

  // Find the display label for the current value
  const selectedLabel = useMemo(() => {
    if (!value) return '';
    const match = tariffs.find((t) => t.code === value);
    return match ? `${match.code} — ${match.name}` : value;
  }, [value, tariffs]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
          )}
        >
          <span className="truncate">
            {value ? selectedLabel : 'Select SHA tariff...'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by code or name..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[250px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
              </div>
            ) : tariffs.length === 0 ? (
              <CommandEmpty>
                {debouncedSearch && debouncedSearch.length >= 2 ? 'No interventions found.' : 'Type at least 2 characters to search...'}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {tariffs.map((tariff) => (
                  <CommandItem
                    key={tariff.code}
                    value={tariff.code}
                    onSelect={() => {
                      onValueChange(tariff.code);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 shrink-0',
                        value === tariff.code ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate font-medium">{tariff.code}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {tariff.name}{tariff.price ? ` · KES ${tariff.price.toLocaleString()}` : ''}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
