'use client';

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FlaskConical, Check, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { PageHeader } from '@/components/shared/page-header';
import { useCreateCulture, useSearchLabResults } from '@/lib/hooks/use-laboratory';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { IncubationAtmosphere, LabResult } from '@/lib/types/laboratory';
import { toast } from 'sonner';

const ATMOSPHERE_OPTIONS: { value: IncubationAtmosphere; label: string }[] = [
  { value: 'AEROBIC', label: 'Aerobic' },
  { value: 'ANAEROBIC', label: 'Anaerobic' },
  { value: 'CO2', label: 'CO₂ Enriched' },
  { value: 'MICROAEROPHILIC', label: 'Microaerophilic' },
];

function formatResultLabel(result: LabResult): string {
  const parts: string[] = [];
  if (result.test_name) parts.push(result.test_name);
  if (result.patient_name) parts.push(result.patient_name);
  if (result.order_number) parts.push(`#${result.order_number}`);
  if (parts.length === 0) return `Result #${result.id}`;
  return parts.join(' — ');
}

export default function NewCulturePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createCulture = useCreateCulture();

  const labResultParam = searchParams.get('lab_result');

  const [selectedResultId, setSelectedResultId] = useState<number | null>(
    labResultParam ? Number(labResultParam) : null
  );
  const [selectedResultLabel, setSelectedResultLabel] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const { data: searchResults, isLoading: isSearching } = useSearchLabResults(debouncedSearch);

  const [cultureMedium, setCultureMedium] = useState('');
  const [incubationTemperature, setIncubationTemperature] = useState('');
  const [incubationAtmosphere, setIncubationAtmosphere] = useState<IncubationAtmosphere | ''>('AEROBIC');
  const [incubationHours, setIncubationHours] = useState('');

  const resultOptions = useMemo(() => {
    return searchResults?.results ?? [];
  }, [searchResults]);

  const handleSelectResult = (result: LabResult) => {
    setSelectedResultId(result.id);
    setSelectedResultLabel(formatResultLabel(result));
    setSearchOpen(false);
    setSearchQuery('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedResultId) {
      toast.error('Please select a lab result');
      return;
    }

    createCulture.mutate(
      {
        lab_result: selectedResultId,
        culture_medium: cultureMedium || undefined,
        incubation_temperature: incubationTemperature ? Number(incubationTemperature) : undefined,
        incubation_atmosphere: incubationAtmosphere || undefined,
        incubation_hours: incubationHours ? Number(incubationHours) : undefined,
      },
      {
        onSuccess: (culture) => {
          toast.success('Culture inoculated successfully');
          router.push(`/laboratory/microbiology/${culture.id}`);
        },
        onError: (error: Error) => {
          toast.error(error.message || 'Failed to create culture');
        },
      }
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Culture"
        helpContent="Inoculate a new culture from a lab result. The culture will be created in INOCULATED status."
      />

      <form onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:gap-6 max-w-2xl mx-auto">
          {/* Lab Result */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FlaskConical className="h-4 w-4" />
                Source Lab Result
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Lab Result *</Label>
                <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={searchOpen}
                      className="w-full justify-between font-normal"
                    >
                      {selectedResultLabel ? (
                        <span className="truncate">{selectedResultLabel}</span>
                      ) : (
                        <span className="text-muted-foreground">Search by patient, test, or order number...</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Type to search lab results..."
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                      />
                      <CommandList>
                        {isSearching && (
                          <div className="py-6 text-center text-sm text-muted-foreground">
                            Searching...
                          </div>
                        )}
                        {!isSearching && debouncedSearch.length < 2 && (
                          <div className="py-6 text-center text-sm text-muted-foreground">
                            <Search className="mx-auto h-4 w-4 mb-1 opacity-50" />
                            Type at least 2 characters to search
                          </div>
                        )}
                        {!isSearching && debouncedSearch.length >= 2 && resultOptions.length === 0 && (
                          <CommandEmpty>No results found.</CommandEmpty>
                        )}
                        {resultOptions.length > 0 && (
                          <CommandGroup>
                            {resultOptions.map((result) => (
                              <CommandItem
                                key={result.id}
                                value={String(result.id)}
                                onSelect={() => handleSelectResult(result)}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    selectedResultId === result.id ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                <div className="flex flex-col min-w-0">
                                  <span className="truncate font-medium">
                                    {result.test_name || `Result #${result.id}`}
                                  </span>
                                  <span className="text-xs text-muted-foreground truncate">
                                    {[result.patient_name, result.order_number ? `#${result.order_number}` : null]
                                      .filter(Boolean)
                                      .join(' • ') || `ID: ${result.id}`}
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
                <p className="text-xs text-muted-foreground">
                  Search by patient name, test name, or order number.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Culture Setup */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Culture Setup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="culture_medium">Culture Medium</Label>
                <Input
                  id="culture_medium"
                  value={cultureMedium}
                  onChange={(e) => setCultureMedium(e.target.value)}
                  placeholder="e.g., Blood Agar, MacConkey, Chocolate Agar"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature (°C)</Label>
                  <Input
                    id="temperature"
                    type="number"
                    step="0.1"
                    min={20}
                    max={45}
                    value={incubationTemperature}
                    onChange={(e) => setIncubationTemperature(e.target.value)}
                    placeholder="37"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="atmosphere">Atmosphere</Label>
                  <Select
                    value={incubationAtmosphere}
                    onValueChange={(v) => setIncubationAtmosphere(v as IncubationAtmosphere)}
                  >
                    <SelectTrigger id="atmosphere">
                      <SelectValue placeholder="Select atmosphere" />
                    </SelectTrigger>
                    <SelectContent>
                      {ATMOSPHERE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hours">Incubation Hours</Label>
                  <Input
                    id="hours"
                    type="number"
                    min={1}
                    max={168}
                    value={incubationHours}
                    onChange={(e) => setIncubationHours(e.target.value)}
                    placeholder="24"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/laboratory/microbiology')}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createCulture.isPending || !selectedResultId}>
              {createCulture.isPending ? 'Creating...' : 'Inoculate Culture'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
