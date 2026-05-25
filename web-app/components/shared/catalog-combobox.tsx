'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';

export type CatalogComboboxOption = {
  /** Stable code used as the form value (e.g., test_code, drug_code). */
  code: string;
  /** Primary display label. */
  label: string;
  /** Optional secondary text appended after the label. */
  description?: string;
};

interface CatalogComboboxProps {
  options: CatalogComboboxOption[];
  value: string;
  onValueChange: (code: string) => void;
  placeholder?: string;
  /** Singular noun used in default placeholders, e.g. "test", "drug", "procedure". */
  type?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Searchable combobox for selecting an item from a catalog of {code, label} pairs.
 *
 * Use this in place of `<Select>` whenever the catalog has more than ~20 entries
 * (lab tests, drugs, imaging procedures, etc.). Searches both label and code.
 */
export function CatalogCombobox({
  options,
  value,
  onValueChange,
  placeholder,
  type = 'item',
  className,
  disabled,
}: CatalogComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((opt) => opt.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className="truncate text-left">
            {selected
              ? selected.description
                ? `${selected.label} ${selected.description}`
                : selected.label
              : placeholder ?? `Select ${type}...`}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            // itemValue is the option.code; build a richer haystack to search.
            const opt = options.find((o) => o.code === itemValue);
            if (!opt) return 0;
            const haystack =
              `${opt.code} ${opt.label} ${opt.description ?? ''}`.toLowerCase();
            return haystack.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={`Search ${type}...`} />
          <CommandList>
            <CommandEmpty>No {type} found.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.code}
                  value={opt.code}
                  onSelect={() => {
                    onValueChange(opt.code === value ? '' : opt.code);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === opt.code ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">
                    {opt.label}
                    {opt.description && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        {opt.description}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
