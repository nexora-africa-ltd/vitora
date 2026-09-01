'use client';

/**
 * Enhanced FHIR R4 Resource Explorer
 *
 * Provides a comprehensive FHIR resource browser with:
 * 1. Extended resource types (Patient, Encounter, Condition, Observation, DiagnosticReport,
 *    MedicationStatement, AllergyIntolerance, Procedure, Immunization, CarePlan, ServiceRequest)
 * 2. Raw JSON toggle
 * 3. Export (copy JSON, download as FHIR Bundle)
 * 4. FHIR Validator integration
 * 5. External FHIR server query
 * 6. Resource count stats
 * 7. Cross-reference navigation
 */

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Search,
  Copy,
  Download,
  Code2,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Link2,
  BarChart3,
} from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { useToast } from '@/lib/hooks/use-toast';

// =============================================================================
// Types
// =============================================================================

interface FHIRResource {
  resourceType: string;
  id: string;
  [key: string]: unknown;
}

interface FHIRBundle {
  resourceType: string;
  type: string;
  total: number;
  entry?: { resource: FHIRResource }[];
}

interface ResourceStats {
  [resourceType: string]: number;
}

// =============================================================================
// Constants
// =============================================================================

const RESOURCE_TYPES = [
  { value: 'Patient', label: 'Patient', description: 'Demographics, identifiers' },
  { value: 'Encounter', label: 'Encounter', description: 'Visits, admissions' },
  { value: 'Condition', label: 'Condition', description: 'Diagnoses, problems' },
  { value: 'Observation', label: 'Observation', description: 'Vitals, lab results' },
  { value: 'DiagnosticReport', label: 'DiagnosticReport', description: 'Lab reports' },
  { value: 'MedicationStatement', label: 'MedicationStatement', description: 'Active meds' },
  { value: 'AllergyIntolerance', label: 'AllergyIntolerance', description: 'Allergies' },
  { value: 'Procedure', label: 'Procedure', description: 'Surgeries, procedures' },
  { value: 'Immunization', label: 'Immunization', description: 'Vaccinations' },
  { value: 'CarePlan', label: 'CarePlan', description: 'Treatment plans' },
  { value: 'ServiceRequest', label: 'ServiceRequest', description: 'Lab/imaging orders' },
];

const PLACEHOLDER_MAP: Record<string, string> = {
  Patient: 'Search by name, MRN, or ID...',
  Encounter: 'Patient ID or date (ge2024-01-01)...',
  Condition: 'Patient ID or ICD/SNOMED code...',
  Observation: 'Patient ID or category (vital-signs, laboratory)...',
  DiagnosticReport: 'Patient ID or status (final, preliminary)...',
  AllergyIntolerance: 'Patient ID...',
  Procedure: 'Patient ID or code...',
  Immunization: 'Patient ID...',
  CarePlan: 'Patient ID or status (active, completed)...',
  ServiceRequest: 'Patient ID or status...',
  MedicationStatement: 'Patient ID...',
};

// =============================================================================
// Component
// =============================================================================

export function FHIRResourceExplorer() {
  const { toast } = useToast();
  const [resourceType, setResourceType] = useState('Patient');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<FHIRResource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRawJson, setShowRawJson] = useState(false);
  const [selectedResource, setSelectedResource] = useState<FHIRResource | null>(null);
  const [useExternalServer, setUseExternalServer] = useState(false);
  const [externalServerUrl, setExternalServerUrl] = useState('');
  const [resourceStats, setResourceStats] = useState<ResourceStats>({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    issues: string[];
  } | null>(null);
  const [validating, setValidating] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 400);

  // Fetch resource stats on mount
  useEffect(() => {
    loadResourceStats();
  }, []);

  const loadResourceStats = async () => {
    setStatsLoading(true);
    const stats: ResourceStats = {};
    // Query a few key resource types for counts
    const types = ['Patient', 'Encounter', 'Condition', 'Observation', 'DiagnosticReport'];
    await Promise.all(
      types.map(async (type) => {
        try {
          const resp = await apiClient.get<FHIRBundle>(`/fhir/${type}`, {
            params: { _summary: 'count' },
          });
          stats[type] = resp.data.total ?? 0;
        } catch {
          stats[type] = 0;
        }
      })
    );
    setResourceStats(stats);
    setStatsLoading(false);
  };

  // Search FHIR resources
  const searchResources = useCallback(
    async (query: string) => {
      if (!query.trim() || query.length < 2) {
        setResults([]);
        return;
      }
      setIsLoading(true);
      setError('');
      setSelectedResource(null);
      setValidationResult(null);

      try {
        const params: Record<string, string> = {};
        if (resourceType === 'Patient') {
          params[query.startsWith('MRN-') ? 'identifier' : /^\d+$/.test(query) ? '_id' : 'name'] =
            query;
        } else if (/^\d+$/.test(query)) {
          params.patient = query;
        } else if (
          query.startsWith('ge') ||
          query.startsWith('le') ||
          query.startsWith('gt') ||
          query.startsWith('lt')
        ) {
          params.date = query;
        } else {
          // Try code or status
          params[resourceType === 'Observation' ? 'category' : 'code'] = query;
        }

        const baseUrl =
          useExternalServer && externalServerUrl ? externalServerUrl.replace(/\/$/, '') : '';
        const url = baseUrl ? `${baseUrl}/${resourceType}` : `/fhir/${resourceType}`;

        const resp =
          useExternalServer && externalServerUrl
            ? await fetch(`${url}?${new URLSearchParams(params)}`, {
                headers: { Accept: 'application/fhir+json' },
              }).then((r) => r.json())
            : (await apiClient.get<FHIRBundle>(url, { params })).data;

        setResults(resp.entry?.map((e: { resource: FHIRResource }) => e.resource) || []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [resourceType, useExternalServer, externalServerUrl]
  );

  // Auto-search
  useEffect(() => {
    if (debouncedSearch.length >= 2) searchResources(debouncedSearch);
    else setResults([]);
  }, [debouncedSearch, searchResources]);

  // Copy resource as JSON
  const copyAsJson = (resource: FHIRResource) => {
    navigator.clipboard.writeText(JSON.stringify(resource, null, 2));
    toast({ title: 'Copied', description: 'FHIR resource JSON copied to clipboard.' });
  };

  // Download as FHIR Bundle
  const downloadBundle = () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: results.length,
      entry: results.map((r) => ({ resource: r })),
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/fhir+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${resourceType}-bundle-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Validate resource against FHIR profile
  const validateResource = async (resource: FHIRResource) => {
    setValidating(true);
    setValidationResult(null);
    try {
      const resp = await apiClient.post<{
        valid: boolean;
        issues: Array<{ severity: string; message: string }>;
      }>('/fhir/$validate', resource, { headers: { 'Content-Type': 'application/fhir+json' } });
      setValidationResult({
        valid: resp.data.valid,
        issues: resp.data.issues?.map((i) => `[${i.severity}] ${i.message}`) || [],
      });
    } catch {
      // If no validator endpoint exists, do basic client-side check
      const issues: string[] = [];
      if (!resource.resourceType) issues.push('[error] Missing resourceType');
      if (!resource.id) issues.push('[warning] Missing id');
      setValidationResult({
        valid: issues.length === 0,
        issues:
          issues.length > 0
            ? issues
            : ['Resource structure looks valid (no server validator available)'],
      });
    } finally {
      setValidating(false);
    }
  };

  // Cross-reference: navigate to related resources
  const crossReference = (ref: string) => {
    // ref format: "Patient/123" or "Encounter/456"
    const parts = ref.split('/');
    if (parts.length === 2) {
      setResourceType(parts[0]!);
      setSearchQuery(parts[1]!);
    }
  };

  // Extract references from a resource
  const extractReferences = (resource: FHIRResource): string[] => {
    const refs: string[] = [];
    const walk = (obj: unknown) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        obj.forEach(walk);
        return;
      }
      const record = obj as Record<string, unknown>;
      if (typeof record.reference === 'string') refs.push(record.reference);
      Object.values(record).forEach(walk);
    };
    walk(resource);
    return [...new Set(refs)];
  };

  // Get resource summary display
  const getResourceSummary = (resource: FHIRResource): { title: string; subtitle: string } => {
    const r = resource as Record<string, unknown>;
    switch (resource.resourceType) {
      case 'Patient': {
        const names = r.name as Array<{ family?: string; given?: string[] }> | undefined;
        const ids = r.identifier as Array<{ value?: string }> | undefined;
        return {
          title: names?.[0]
            ? `${names[0].given?.join(' ') || ''} ${names[0].family || ''}`.trim()
            : `Patient/${resource.id}`,
          subtitle: `${ids?.[0]?.value || ''} • ${(r.gender as string) || ''} • DOB: ${(r.birthDate as string) || ''}`,
        };
      }
      case 'Encounter': {
        const cls = r.class as { code?: string } | undefined;
        const period = r.period as { start?: string } | undefined;
        return {
          title: `Encounter #${resource.id} — ${(r.status as string) || ''}`,
          subtitle: `Class: ${cls?.code || ''} • ${period?.start || ''}`,
        };
      }
      case 'Condition': {
        const code = r.code as { coding?: Array<{ code?: string; display?: string }> } | undefined;
        return {
          title: code?.coding?.[0]?.display || `Condition #${resource.id}`,
          subtitle: `${code?.coding?.[0]?.code || ''} • Status: ${(r.clinicalStatus as { coding?: Array<{ code?: string }> })?.coding?.[0]?.code || ''}`,
        };
      }
      case 'Observation': {
        const code = r.code as { coding?: Array<{ display?: string; code?: string }> } | undefined;
        return {
          title: code?.coding?.[0]?.display || `Observation #${resource.id}`,
          subtitle: `Code: ${code?.coding?.[0]?.code || ''} • Status: ${(r.status as string) || ''}`,
        };
      }
      default:
        return {
          title: `${resource.resourceType} #${resource.id}`,
          subtitle: `Status: ${(r.status as string) || '—'}`,
        };
    }
  };

  return (
    <div className="space-y-4">
      {/* Enhancement #6: Resource Count Stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {RESOURCE_TYPES.slice(0, 5).map((rt) => (
          <button
            key={rt.value}
            onClick={() => {
              setResourceType(rt.value);
              setSearchQuery('');
              setResults([]);
            }}
            className={`rounded-lg border p-2 text-center transition-colors ${
              resourceType === rt.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
            }`}
          >
            <p className="text-lg font-bold">
              {statsLoading ? (
                <Skeleton className="mx-auto h-6 w-8" />
              ) : (
                (resourceStats[rt.value] ?? '—')
              )}
            </p>
            <p className="text-xs text-muted-foreground">{rt.label}s</p>
          </button>
        ))}
      </div>

      {/* Search Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">FHIR R4 Resource Explorer</CardTitle>
            <div className="flex items-center gap-3">
              {/* Enhancement #2: Raw JSON toggle */}
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5">
                      <Code2 className="h-4 w-4 text-muted-foreground" />
                      <Switch checked={showRawJson} onCheckedChange={setShowRawJson} />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Toggle raw JSON view</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Enhancement #3: Export buttons */}
              {results.length > 0 && (
                <Button variant="outline" size="sm" onClick={downloadBundle} className="gap-1">
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Bundle</span>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Enhancement #5: External FHIR server toggle */}
          <div className="flex items-center gap-2 text-sm">
            <Switch checked={useExternalServer} onCheckedChange={setUseExternalServer} />
            <span className="text-muted-foreground">Query external server</span>
            {useExternalServer && (
              <Input
                placeholder="https://hapi.fhir.org/baseR4"
                value={externalServerUrl}
                onChange={(e) => setExternalServerUrl(e.target.value)}
                className="h-8 flex-1 text-sm"
              />
            )}
          </div>

          {/* Enhancement #1: Extended resource type selector */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              value={resourceType}
              onValueChange={(v) => {
                setResourceType(v);
                setResults([]);
                setSelectedResource(null);
              }}
            >
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_TYPES.map((rt) => (
                  <SelectItem key={rt.value} value={rt.value}>
                    <span className="flex items-center gap-2">
                      <span>{rt.label}</span>
                      <span className="text-xs text-muted-foreground">({rt.description})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={PLACEHOLDER_MAP[resourceType] || 'Search...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              {isLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Supports FHIR date prefixes: <code className="rounded bg-muted px-1">ge</code>,{' '}
            <code className="rounded bg-muted px-1">le</code>,{' '}
            <code className="rounded bg-muted px-1">gt</code>,{' '}
            <code className="rounded bg-muted px-1">lt</code>.
            {useExternalServer && ' • Querying external FHIR server.'}
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {results.length} result{results.length !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="max-h-[500px] divide-y overflow-y-auto rounded-lg border">
                {results.map((resource, i) => {
                  const summary = getResourceSummary(resource);
                  const refs = extractReferences(resource);
                  const isSelected = selectedResource?.id === resource.id;

                  return (
                    <div
                      key={resource.id || i}
                      className={`cursor-pointer p-3 transition-colors ${isSelected ? 'border-l-2 border-l-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                      onClick={() => setSelectedResource(isSelected ? null : resource)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="shrink-0 text-xs">
                              {resource.resourceType}
                            </Badge>
                            <p className="truncate text-sm font-medium">{summary.title}</p>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">{summary.subtitle}</p>

                          {/* Enhancement #7: Cross-references */}
                          {isSelected && refs.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {refs.slice(0, 8).map((ref) => (
                                <button
                                  key={ref}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    crossReference(ref);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs transition-colors hover:bg-primary/10"
                                >
                                  <Link2 className="h-3 w-3" />
                                  {ref}
                                </button>
                              ))}
                              {refs.length > 8 && (
                                <span className="text-xs text-muted-foreground">
                                  +{refs.length - 8} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex shrink-0 items-center gap-1">
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyAsJson(resource);
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy JSON</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    validateResource(resource);
                                    setSelectedResource(resource);
                                  }}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Validate</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>

                      {/* Enhancement #2: Raw JSON view */}
                      {isSelected && showRawJson && (
                        <pre className="mt-3 max-h-[300px] overflow-x-auto overflow-y-auto rounded-md bg-muted p-3 font-mono text-xs">
                          {JSON.stringify(resource, null, 2)}
                        </pre>
                      )}

                      {/* Enhancement #4: Validation result */}
                      {isSelected && validationResult && (
                        <div
                          className={`mt-3 rounded-md p-3 text-sm ${validationResult.valid ? 'bg-green-50 dark:bg-green-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}
                        >
                          <div className="mb-1 flex items-center gap-2">
                            {validationResult.valid ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                            )}
                            <span className="font-medium">
                              {validationResult.valid ? 'Valid' : 'Validation Issues'}
                            </span>
                          </div>
                          {validationResult.issues.length > 0 && (
                            <ul className="ml-6 space-y-0.5 text-xs">
                              {validationResult.issues.map((issue, idx) => (
                                <li key={idx} className="text-muted-foreground">
                                  {issue}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                      {isSelected && validating && (
                        <p className="mt-2 text-xs text-muted-foreground">Validating...</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!isLoading && results.length === 0 && debouncedSearch.length >= 2 && !error && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No {resourceType} resources found.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
