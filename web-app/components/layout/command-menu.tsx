'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  Search,
  LayoutDashboard,
  Settings,
  UserPlus2,
  Stethoscope,
  Pill,
  Microscope,
  BedDouble,
  CreditCard,
  CalendarDays,
  Syringe,
  Baby,
  FileText,
  BarChart3,
  Thermometer,
  Siren,
  Activity,
  Scissors,
  Flag,
} from 'lucide-react';
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

  const runCommand = useCallback(
    (command: () => void) => {
      setOpen(false);
      command();
    },
    []
  );

  const patients = patientResults?.results ?? [];

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search patients, navigate..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>
          {isSearching ? 'Searching...' : 'No results found.'}
        </CommandEmpty>

        {/* Patient search results */}
        {patients.length > 0 && (
          <CommandGroup heading="Patients">
            {patients.map((patient) => (
              <CommandItem
                key={patient.id}
                value={`patient-${patient.id}-${patient.first_name}-${patient.last_name}-${patient.mrn}`}
                onSelect={() =>
                  runCommand(() => router.push(`/patients/${patient.id}`))
                }
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
                    router.push(
                      `/patients?search=${encodeURIComponent(debouncedSearch)}`
                    )
                  )
                }
              >
                <Search className="mr-2 h-4 w-4" />
                <span>
                  Search all patients for &ldquo;{debouncedSearch}&rdquo;
                </span>
              </CommandItem>
            )}
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* Quick navigation */}
        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() => runCommand(() => router.push('/'))}
          >
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push('/patients'))}
          >
            <Users className="mr-2 h-4 w-4" />
            All Patients
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push('/patients/new'))}
          >
            <UserPlus2 className="mr-2 h-4 w-4" />
            New Patient
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push('/encounters'))}
          >
            <Stethoscope className="mr-2 h-4 w-4" />
            Encounters
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push('/encounters/new'))}
          >
            <FileText className="mr-2 h-4 w-4" />
            New Encounter
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push('/triage'))}
          >
            <Thermometer className="mr-2 h-4 w-4" />
            Triage Queue
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push('/emergency'))}
          >
            <Siren className="mr-2 h-4 w-4" />
            Emergency
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push('/scheduling'))}
          >
            <CalendarDays className="mr-2 h-4 w-4" />
            Scheduling
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push('/clinics'))}
          >
            <Activity className="mr-2 h-4 w-4" />
            Clinics
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push('/pharmacy'))}
          >
            <Pill className="mr-2 h-4 w-4" />
            Pharmacy
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push('/laboratory'))}
          >
            <Microscope className="mr-2 h-4 w-4" />
            Laboratory
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => router.push('/inpatient/bed-board'))
            }
          >
            <BedDouble className="mr-2 h-4 w-4" />
            Inpatient Bed Board
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => router.push('/transactions/invoices'))
            }
          >
            <CreditCard className="mr-2 h-4 w-4" />
            Invoices
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push('/surveillance'))}
          >
            <Flag className="mr-2 h-4 w-4" />
            Surveillance
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push('/immunizations'))}
          >
            <Syringe className="mr-2 h-4 w-4" />
            Immunizations
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push('/mch'))}
          >
            <Baby className="mr-2 h-4 w-4" />
            MCH
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push('/theatre/schedule'))}
          >
            <Scissors className="mr-2 h-4 w-4" />
            Theatre
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => router.push('/reports'))
            }
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            Reports
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push('/settings'))}
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </CommandItem>
        </CommandGroup>
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
      className="hidden md:inline-flex items-center gap-2 text-sm text-muted-foreground w-48 lg:w-56 xl:w-64 justify-start border border-border/40"
      onClick={() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'k', metaKey: true })
        );
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
