'use client';

import { useState, useCallback } from 'react';
import {
  Search,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import { DhaResultCard } from '@/components/shared/dha-result-card';
import { KenyaCoatOfArms } from '@/components/ui/kenya-coat-of-arms';
import { shaApi } from '@/lib/api/sha';

type SearchStatus = 'idle' | 'searching' | 'found' | 'not-found' | 'error';

const IDENTIFIER_TYPES = [
  { value: 'fr-code', label: 'FR Code / MFL Code' },
  { value: 'fid', label: 'Facility ID (FID)' },
  { value: 'registration-number', label: 'Registration Number' },
] as const;

export default function FacilityLookupPage() {
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [errors, setErrors] = useState<string[]>([]);
  const [identifier, setIdentifier] = useState('');
  const [identifierType, setIdentifierType] = useState('fr-code');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const resetResults = () => {
    setStatus('idle');
    setResult(null);
    setErrors([]);
  };

  const handleSearch = useCallback(async () => {
    const value = identifier.trim();
    if (!value || value.length < 3) return;

    resetResults();
    setStatus('searching');

    try {
      const response = await shaApi.ilmFacilitySearch({
        identifier: value,
        identifier_type: identifierType,
      });

      if (response.http_status === 200 && response.data) {
        const raw = response.data as Record<string, unknown>;
        const facilityData = (raw.results ?? raw.data ?? raw) as Record<string, unknown>;
        const entry = Array.isArray(facilityData)
          ? (facilityData[0] as Record<string, unknown> | undefined)
          : facilityData;

        if (entry && (entry.officialName || entry.fidCode || entry.name)) {
          setResult(entry);
          setStatus('found');
        } else {
          setErrors(['No facility found matching the provided identifier.']);
          setStatus('not-found');
        }
      } else {
        setErrors(['Facility not found in the DHA registry.']);
        setStatus('not-found');
      }
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Search failed']);
      setStatus('error');
    }
  }, [identifier, identifierType]);

  const canSearch = identifier.trim().length >= 3 && status !== 'searching';

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Facility Lookup"
        helpContent="Search the DHA (Digital Health Authority) facility registry by MFL Code, Facility ID, or FR Code. View facility details including licensing, bed capacity, SHA contract status, and contact information."
      />

      {/* Search Card */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
            <KenyaCoatOfArms size={28} className="shrink-0 hidden sm:block self-center" />
            <div className="w-full sm:w-48 space-y-1.5">
              <Label>Identifier Type</Label>
              <Select value={identifierType} onValueChange={setIdentifierType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IDENTIFIER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1.5 w-full">
              <Label htmlFor="facility-identifier">Identifier</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="facility-identifier"
                  value={identifier}
                  onChange={(e) => { setIdentifier(e.target.value); if (status !== 'idle') resetResults(); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } }}
                  placeholder={
                    identifierType === 'fr-code'
                      ? 'Enter MFL or FR code (e.g., 24979 or FID-22-107992-6)'
                      : identifierType === 'fid'
                        ? 'Enter Facility ID (e.g., 107992)'
                        : 'Enter Registration Number'
                  }
                  className="pl-10"
                  autoFocus
                />
              </div>
            </div>
            <Button onClick={handleSearch} disabled={!canSearch} className="shrink-0 w-full sm:w-auto">
              {status === 'searching' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span className="ml-2">Search DHA</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Search the DHA facility registry by MFL code, Facility ID, or FR code.
          </p>
        </CardContent>
      </Card>

      {/* Error / Not Found */}
      {(status === 'not-found' || status === 'error') && errors.length > 0 && (
        <Alert variant={status === 'error' ? 'destructive' : 'default'}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{status === 'error' ? 'Error' : 'Not Found'}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside">
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {status === 'searching' && (
        <Card>
          <CardContent className="py-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Searching DHA registry...
            </p>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {status === 'found' && result && <DhaResultCard data={result} />}

      {/* Initial State */}
      {status === 'idle' && (
        <Card>
          <CardContent className="py-8 text-center">
            <KenyaCoatOfArms size={48} className="mx-auto opacity-40" />
            <p className="mt-3 text-sm text-muted-foreground">
              Enter a facility code or identifier to search
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
