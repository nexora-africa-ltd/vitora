'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { patientsApi } from '@/lib/api/patients';
import { hasChildren } from '@/lib/config/navigation';
import { useNavigationItems } from '@/lib/hooks/use-navigation-items';

/**
 * Global command menu (⌘K / Ctrl+K).
 *
 * Provides:
 * - Patient search (type to search by name/MRN)
 * - Quick navigation to key pages
 */
export function CommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { items: navItems, utilityItems } = useNavigationItems();

  // Toggle with ⌘K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  // Patient search query
  const { data: patientResults, isLoading: isSearching } = useQuery({
    queryKey: ['command-patient-search', debouncedSearch],
    queryFn: () => patientsApi.getPatients({ search: debouncedSearch, page_size: 6 }),
    enabled: open && debouncedSearch.length >= 2,
  });

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  const patients = patientResults?.results ?? [];

  const navigationLinks = useMemo(() => {
    return navItems.flatMap((item) => {
      if (hasChildren(item)) {
        return item.children.map((child) => ({
          label: `${item.label} / ${child.label}`,
          href: child.href,
          icon: child.icon,
        }));
      }

      return [
        {
          label: item.label,
          href: item.href,
          icon: item.icon,
        },
      ];
    });
  }, [navItems]);

  const utilityLinks = useMemo(() => {
    return utilityItems.flatMap((item) => {
      if (hasChildren(item)) {
        return item.children.map((child) => ({
          label: `${item.label} / ${child.label}`,
          href: child.href,
          icon: child.icon,
        }));
      }

      return [
        {
          label: item.label,
          href: item.href,
          icon: item.icon,
        },
      ];
    });
  }, [utilityItems]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search patients, navigate..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>{isSearching ? 'Searching...' : 'No results found.'}</CommandEmpty>

        {/* Patient search results */}
        {patients.length > 0 && (
          <CommandGroup heading="Patients">
            {patients.map((patient) => (
              <CommandItem
                key={patient.id}
                value={`patient-${patient.id}-${patient.first_name}-${patient.last_name}-${patient.mrn}`}
                onSelect={() => runCommand(() => router.push(`/patients/${patient.id}`))}
              >
                <Users className="mr-2 h-4 w-4" />
                <span>
                  {patient.first_name} {patient.last_name}
                </span>
                <CommandShortcut>{patient.mrn}</CommandShortcut>
              </CommandItem>
            ))}
            {/* "View all" link when there are more results */}
            {debouncedSearch.length >= 2 && (
              <CommandItem
                value={`search-all-patients-${debouncedSearch}`}
                onSelect={() =>
                  runCommand(() =>
                    router.push(`/patients?search=${encodeURIComponent(debouncedSearch)}`)
                  )
                }
              >
                <Search className="mr-2 h-4 w-4" />
                <span>Search all patients for &ldquo;{debouncedSearch}&rdquo;</span>
              </CommandItem>
            )}
          </CommandGroup>
        )}

        {navigationLinks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Navigation">
              {navigationLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={`nav-${item.href}`}
                    value={`${item.label} ${item.href}`}
                    onSelect={() => runCommand(() => router.push(item.href))}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {item.label}
                    <CommandShortcut>{item.href}</CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {utilityLinks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Utility">
              {utilityLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={`utility-${item.href}`}
                    value={`${item.label} ${item.href}`}
                    onSelect={() => runCommand(() => router.push(item.href))}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {item.label}
                    <CommandShortcut>{item.href}</CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

/**
 * Detects whether the user is on macOS / iOS.
 * Returns '⌘' for Apple platforms, 'Ctrl' for everything else.
 */
function useModifierKey() {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // navigator.platform is deprecated but still the most reliable sync check;
    // fall back to userAgentData or userAgent string.
    const platform =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator as any).userAgentData?.platform ?? navigator.platform ?? '';
    setIsMac(/mac|iphone|ipad|ipod/i.test(platform));
  }, []);

  return isMac ? '⌘' : 'Ctrl';
}

/**
 * Header button that opens the command menu and shows the OS-appropriate
 * keyboard shortcut (⌘ K on Mac, Ctrl K elsewhere).
 */
export function CommandMenuTrigger() {
  const mod = useModifierKey();

  return (
    <Button
      variant="ghost"
      className="hidden w-48 items-center justify-start gap-2 border border-border/40 text-sm text-muted-foreground md:inline-flex lg:w-56 xl:w-64"
      onClick={() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
      }}
    >
      <Search className="h-4 w-4" />
      <span className="flex-1 text-left">Search...</span>
      <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
        <span className="text-xs">{mod}</span>K
      </kbd>
    </Button>
  );
}
