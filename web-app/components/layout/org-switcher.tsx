'use client';

import { useState } from 'react';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
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
import { useAuth } from '@/lib/auth/context';
import { useFacility } from '@/lib/context/facility-context';
import { cn } from '@/lib/utils/cn';

/**
 * Organization switcher for multi-org users.
 *
 * - Shows current org name derived from facility context
 * - Multi-org users (>1 membership): dropdown to switch orgs
 * - Single-org users: static display, no dropdown
 * - On org switch: finds the first facility in that org and switches to it
 */
export function OrgSwitcher() {
  const { user } = useAuth();
  const { organization, switchFacility } = useFacility();
  const [open, setOpen] = useState(false);

  const memberships = user?.memberships ?? [];

  // Single org or no memberships — show nothing (org derived from facility)
  if (memberships.length <= 1) {
    return null;
  }

  const currentOrgId = organization?.id;

  const handleSelect = (membership: typeof memberships[0]) => {
    if (membership.organization_id === currentOrgId) {
      setOpen(false);
      return;
    }
    // Switch to the first facility in the selected org
    const firstFacility = membership.facilities[0];
    if (firstFacility) {
      // We need full UserFacility shape — do a lightweight switch
      // The facility switcher / context will fetch full detail
      switchFacility({
        id: firstFacility.id,
        mfl_code: firstFacility.mfl_code,
        name: firstFacility.name,
        level: '',
        modules: {} as import('@/lib/auth/context').FacilityModules,
        sha_contracted: false,
      });
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          aria-label="Switch organization"
          className="hidden sm:flex items-center gap-1.5 h-9 px-2.5 text-xs max-w-[160px] xl:max-w-[200px] border border-border/40"
        >
          <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">{organization?.name ?? 'Organization'}</span>
          <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search organizations..." />
          <CommandList>
            <CommandEmpty>No organization found.</CommandEmpty>
            <CommandGroup heading="Your Organizations">
              {memberships.map((m) => (
                <CommandItem
                  key={m.id}
                  value={m.organization_name}
                  onSelect={() => handleSelect(m)}
                  className="flex items-center gap-2"
                >
                  <Check
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      m.organization_id === currentOrgId ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-sm">{m.organization_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {m.role_name} · {m.facilities.length} facilit{m.facilities.length === 1 ? 'y' : 'ies'}
                    </span>
                  </div>
                  {m.is_primary && (
                    <Badge variant="secondary" className="ml-auto text-[10px] px-1 h-4 shrink-0">
                      Primary
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
