'use client';

import { useCallback, useMemo, useState } from 'react';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { useFacility } from '@/lib/context/facility-context';
import { facilitiesApi, toUserFacility } from '@/lib/api/facilities';
import type { FacilityDetail } from '@/lib/types/facility';
import { cn } from '@/lib/utils/cn';

/**
 * Facility switcher for the header.
 *
 * - Shows current facility name
 * - For multi-facility users: dropdown to switch between accessible facilities
 * - For single-facility users: static display, no dropdown
 */
export function FacilitySwitcher() {
  const { facility, switchFacility, organization } = useFacility();
  const [open, setOpen] = useState(false);

  // Fetch all facilities in the user's organization
  const { data: facilitiesData } = useQuery({
    queryKey: ['org-facilities', organization?.id],
    queryFn: () => facilitiesApi.list({ page_size: 100, is_active: true }),
    enabled: organization?.id != null,
    staleTime: 5 * 60 * 1000,
  });

  const facilities = useMemo(
    () => facilitiesData?.results ?? [],
    [facilitiesData],
  );

  const handleSelect = useCallback(
    async (facilityId: number) => {
      if (facilityId === facility?.id) {
        setOpen(false);
        return;
      }
      // Fetch detail to get modules for UserFacility shape
      const detail: FacilityDetail = await facilitiesApi.get(facilityId);
      switchFacility(toUserFacility(detail));
      setOpen(false);
    },
    [facility, switchFacility],
  );

  if (!facility) return null;

  // Single facility — static display
  if (facilities.length <= 1) {
    return (
      <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate max-w-[120px] xl:max-w-[180px]">{facility.name}</span>
      </div>
    );
  }

  // Multi-facility — dropdown
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Switch facility"
          className="hidden sm:flex items-center gap-1.5 h-9 px-2.5 text-xs max-w-[160px] xl:max-w-[220px]"
        >
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{facility.name}</span>
          <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search facilities..." />
          <CommandList>
            <CommandEmpty>No facility found.</CommandEmpty>
            {organization && (
              <CommandGroup heading={organization.name}>
                {facilities.map((f) => (
                  <CommandItem
                    key={f.id}
                    value={f.name}
                    onSelect={() => handleSelect(f.id)}
                    className="flex items-center gap-2"
                  >
                    <Check
                      className={cn(
                        'h-3.5 w-3.5 shrink-0',
                        f.id === facility.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate text-sm">{f.name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {f.mfl_code} · Level {f.level}
                      </span>
                    </div>
                    {f.is_headquarters && (
                      <Badge variant="secondary" className="ml-auto text-[10px] px-1 h-4 shrink-0">
                        HQ
                      </Badge>
                    )}
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
