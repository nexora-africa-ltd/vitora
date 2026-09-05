'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
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

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

interface SearchableSelectProps
  extends Pick<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    'id' | 'aria-describedby' | 'aria-invalid'
  > {
  options: SearchableSelectOption[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
  isLoading?: boolean;
  maxVisibleOptions?: number;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found.',
  className,
  disabled,
  isLoading = false,
  maxVisibleOptions = 150,
  id,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const deferredQuery = React.useDeferredValue(query);

  const selected = options.find((o) => o.value === value);

  const filteredOptions = React.useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return options.slice(0, maxVisibleOptions);
    return options
      .filter((option) => {
        const haystack = `${option.label} ${option.sublabel || ''} ${option.value}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, maxVisibleOptions);
  }, [deferredQuery, options, maxVisibleOptions]);

  const truncated = filteredOptions.length < options.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-busy={isLoading}
          disabled={disabled || isLoading}
          className={cn(
            'w-full justify-between font-normal dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100 dark:hover:border-teal-600/70 dark:hover:bg-teal-400/10 dark:focus-visible:ring-teal-300/70',
            !selected && 'text-muted-foreground',
            className
          )}
        >
          <span className="truncate">
            {isLoading ? 'Loading...' : selected ? selected.label : placeholder}
          </span>
          {isLoading && <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" />}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] border-border p-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        align="start"
      >
        <Command
          shouldFilter={false}
          className="dark:bg-transparent dark:[&_[cmdk-input-wrapper]]:border-slate-700 dark:[&_[cmdk-item][data-selected=true]]:bg-teal-400/15 dark:[&_[cmdk-item][data-selected=true]]:text-teal-100"
        >
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  onSelect={() => {
                    if (option.disabled) return;
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      value === option.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="min-w-0">
                    <span className="truncate">{option.label}</span>
                    {option.sublabel && (
                      <span className="ml-2 text-xs text-muted-foreground">{option.sublabel}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
              {truncated && (
                <CommandItem disabled value="__searchable_select_truncated__">
                  Showing first {maxVisibleOptions} matches. Keep typing to narrow results.
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
