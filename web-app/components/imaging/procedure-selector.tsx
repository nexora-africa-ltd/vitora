/**
 * Imaging procedure selector (combobox) component.
 * Provides searchable dropdown for selecting imaging procedures.
 */
'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
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
import { Badge } from '@/components/ui/badge';
import { useImagingProcedureSearch } from '@/lib/hooks/use-imaging';
import { ImagingProcedure, MODALITY_LABELS } from '@/lib/types/imaging';
import { ModalityBadge } from './modality-badge';
import { useDebounce } from '@/lib/hooks';

interface ProcedureSelectorProps {
  value?: ImagingProcedure;
  onSelect: (procedure: ImagingProcedure | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ProcedureSelector({
  value,
  onSelect,
  placeholder = 'Select procedure...',
  disabled = false,
  className,
}: ProcedureSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);

  const { data: procedures, isLoading } = useImagingProcedureSearch(debouncedQuery);

  const handleSelect = useCallback(
    (procedure: ImagingProcedure) => {
      onSelect(procedure);
      setOpen(false);
      setSearchQuery('');
    },
    [onSelect]
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(null);
    },
    [onSelect]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between',
            !value && 'text-muted-foreground',
            className
          )}
          disabled={disabled}
        >
          {value ? (
            <div className="flex items-center gap-2 truncate">
              <ModalityBadge modality={value.modality} size="sm" showIcon={false} />
              <span className="truncate">{value.name}</span>
            </div>
          ) : (
            placeholder
          )}
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {value && (
              <X
                className="h-4 w-4 opacity-50 hover:opacity-100"
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search procedures..."
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          <CommandList>
            {!isLoading && (!procedures || procedures.length === 0) && (
              <CommandEmpty>
                {searchQuery.length < 2
                  ? 'Type at least 2 characters to search...'
                  : 'No procedures found.'}
              </CommandEmpty>
            )}
            {procedures && procedures.length > 0 && (
              <CommandGroup>
                {procedures.map((procedure) => (
                  <CommandItem
                    key={procedure.id}
                    value={procedure.code}
                    onSelect={() => handleSelect(procedure)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value?.id === procedure.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <ModalityBadge modality={procedure.modality} size="sm" />
                        <span className="font-medium truncate">{procedure.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{procedure.code}</span>
                        <span>•</span>
                        <span>KES {procedure.cost.toLocaleString()}</span>
                        {procedure.sha_claimable && (
                          <>
                            <span>•</span>
                            <Badge variant="outline" className="h-4 text-[10px] px-1">
                              SHA
                            </Badge>
                          </>
                        )}
                      </div>
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

export default ProcedureSelector;
