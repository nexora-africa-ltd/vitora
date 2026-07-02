'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { Search, Globe, Upload, Activity, FileText, Network, FlaskConical, BookOpen, Stethoscope } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiClient } from '@/lib/api/client';

interface FHIRPatientResult {
  resourceType: string;
  id: string;
  identifier?: { system?: string; value?: string }[];
  name?: { family?: string; given?: string[] }[];
  gender?: string;
  birthDate?: string;
  status?: string;
  class?: { code?: string };
  subject?: { reference?: string };
  period?: { start?: string };
  reasonCode?: { text?: string }[];
  code?: { coding?: { code?: string; display?: string }[] };
  conclusion?: string;
  issued?: string;
}

interface FHIRBundle {
  resourceType: string;
  type: string;
  total: number;
  entry?: { resource: FHIRPatientResult }[];
}

interface LOINCResult {
  code: string;
  component?: string;
  display?: string;
}

interface BenchmarkResult {
  indicator_code: string;
  time_period: string;
  facility_code: string;
  source: string;
  value: number;
  imported_at: string;
}

export default function InteroperabilityPage() {
  const { refresh, isRefreshing } = usePageRefresh();

  // FHIR Patient Search
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [fhirResourceType, setFhirResourceType] = useState('Patient');
  const [patientResults, setPatientResults] = useState<FHIRPatientResult[]>([]);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [patientSearchError, setPatientSearchError] = useState('');
  const debouncedFhirQuery = useDebounce(patientSearchQuery, 400);

  // LOINC Search
  const [loincQuery, setLoincQuery] = useState('');
  const [loincResults, setLoincResults] = useState<LOINCResult[]>([]);
  const [loincSearchLoading, setLoincSearchLoading] = useState(false);
  const [loincExternalAvailable, setLoincExternalAvailable] = useState(false);
  const debouncedLoincQuery = useDebounce(loincQuery, 400);

  // SDMX Import
  const [sdmxFile, setSdmxFile] = useState<File | null>(null);
  const [sdmxImporting, setSdmxImporting] = useState(false);
  const [sdmxResult, setSdmxResult] = useState<{ imported: number; dataset_id: string } | null>(null);
  const [sdmxError, setSdmxError] = useState('');

  // Benchmarks
  const [benchmarks, setBenchmarks] = useState<BenchmarkResult[]>([]);
  const [benchmarksLoading, setBenchmarksLoading] = useState(false);

  // SNOMED CT Search
  const [snomedQuery, setSnomedQuery] = useState('');
  const [snomedResults, setSnomedResults] = useState<Array<{ concept_id: string; display: string; semantic_tag?: string }>>([]);
  const [snomedLoading, setSnomedLoading] = useState(false);
  const debouncedSnomedQuery = useDebounce(snomedQuery, 400);

  // ICD-10 Search
  const [icd10Query, setIcd10Query] = useState('');
  const [icd10Results, setIcd10Results] = useState<Array<{ id: number; code: string; description: string }>>([]);
  const [icd10Loading, setIcd10Loading] = useState(false);
  const debouncedIcd10Query = useDebounce(icd10Query, 400);

  // ICD-11 Search
  const [icd11Query, setIcd11Query] = useState('');
  const [icd11Results, setIcd11Results] = useState<Array<{ code: string; title: string; definition?: string }>>([]);
  const [icd11Loading, setIcd11Loading] = useState(false);
  const debouncedIcd11Query = useDebounce(icd11Query, 400);

  const searchFHIRPatients = useCallback(async (query: string) => {
    if (!query.trim()) {
      setPatientResults([]);
      return;
    }
    setPatientSearchLoading(true);
    setPatientSearchError('');
    try {
      const params: Record<string, string> = {};

      if (fhirResourceType === 'Patient') {
        if (query.startsWith('MRN-')) {
          params.identifier = query;
        } else {
          params.name = query;
        }
      } else if (fhirResourceType === 'Encounter') {
        if (/^\d+$/.test(query)) {
          params.patient = query;
        } else {
          params.date = query;
        }
      } else if (fhirResourceType === 'DiagnosticReport') {
        if (/^\d+$/.test(query)) {
          params.patient = query;
        } else {
          params.status = query;
        }
      } else if (fhirResourceType === 'Condition') {
        if (/^\d+$/.test(query)) {
          params.patient = query;
        } else {
          params.code = query;
        }
      } else if (fhirResourceType === 'Observation') {
        if (/^\d+$/.test(query)) {
          params.patient = query;
        } else {
          params.category = query;
        }
      } else {
        params.patient = query;
      }

      const response = await apiClient.get<FHIRBundle>(`/fhir/${fhirResourceType}`, { params });
      setPatientResults(response.data.entry?.map((e) => e.resource) || []);
    } catch (err: unknown) {
      setPatientSearchError(err instanceof Error ? err.message : 'Search failed');
      setPatientResults([]);
    } finally {
      setPatientSearchLoading(false);
    }
  }, [fhirResourceType]);

  // Auto-search on debounced query change
  useEffect(() => {
    if (debouncedFhirQuery.length >= 2) {
      searchFHIRPatients(debouncedFhirQuery);
    } else {
      setPatientResults([]);
    }
  }, [debouncedFhirQuery, searchFHIRPatients]);

  const searchLOINC = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setLoincResults([]);
      return;
    }
    setLoincSearchLoading(true);
    try {
      const response = await apiClient.get<{
        count: number;
        external_available: boolean;
        results: LOINCResult[];
      }>('/api/lab/loinc-search/', { params: { q: query } });
      setLoincResults(response.data.results);
      setLoincExternalAvailable(response.data.external_available);
    } catch {
      setLoincResults([]);
    } finally {
      setLoincSearchLoading(false);
    }
  }, []);

  // Auto-search LOINC on debounced query change
  useEffect(() => {
    if (debouncedLoincQuery.length >= 2) {
      searchLOINC(debouncedLoincQuery);
    } else {
      setLoincResults([]);
    }
  }, [debouncedLoincQuery, searchLOINC]);

  const importSDMX = async () => {
    if (!sdmxFile) return;
    setSdmxImporting(true);
    setSdmxError('');
    setSdmxResult(null);
    try {
      const formData = new FormData();
      formData.append('file', sdmxFile);
      formData.append('source', 'KHIS');
      const response = await apiClient.post<{ imported: number; dataset_id: string }>(
        '/api/quality/sdmx/import/',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setSdmxResult(response.data);
    } catch (err: unknown) {
      setSdmxError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setSdmxImporting(false);
    }
  };

  const loadBenchmarks = async () => {
    setBenchmarksLoading(true);
    try {
      const response = await apiClient.get<{ count: number; results: BenchmarkResult[] }>(
        '/api/quality/benchmarks/'
      );
      setBenchmarks(response.data.results);
    } catch {
      setBenchmarks([]);
    } finally {
      setBenchmarksLoading(false);
    }
  };

  // SNOMED CT search
  const searchSNOMED = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) { setSnomedResults([]); return; }
    setSnomedLoading(true);
    try {
      const response = await apiClient.get<{ results: Array<{ concept_id: string; display: string; semantic_tag?: string }> }>(
        '/api/encounters/snomed/search/', { params: { q: query, limit: 20 } }
      );
      setSnomedResults(response.data.results || []);
    } catch { setSnomedResults([]); }
    finally { setSnomedLoading(false); }
  }, []);

  useEffect(() => {
    if (debouncedSnomedQuery.length >= 2) searchSNOMED(debouncedSnomedQuery);
    else setSnomedResults([]);
  }, [debouncedSnomedQuery, searchSNOMED]);

  // ICD-10 search
  const searchICD10 = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) { setIcd10Results([]); return; }
    setIcd10Loading(true);
    try {
      const response = await apiClient.get<{ results: Array<{ id: number; code: string; description: string }> }>(
        '/api/icd10-codes/', { params: { search: query, page_size: 20 } }
      );
      setIcd10Results(response.data.results || []);
    } catch { setIcd10Results([]); }
    finally { setIcd10Loading(false); }
  }, []);

  useEffect(() => {
    if (debouncedIcd10Query.length >= 2) searchICD10(debouncedIcd10Query);
    else setIcd10Results([]);
  }, [debouncedIcd10Query, searchICD10]);

  // ICD-11 search
  const searchICD11 = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) { setIcd11Results([]); return; }
    setIcd11Loading(true);
    try {
      const response = await apiClient.get<{ results: Array<{ code: string; title: string; definition?: string }> }>(
        '/api/sha/terminology/search/', { params: { type: 'icd11', search: query, page_size: 20 } }
      );
      setIcd11Results(response.data.results || []);
    } catch { setIcd11Results([]); }
    finally { setIcd11Loading(false); }
  }, []);

  useEffect(() => {
    if (debouncedIcd11Query.length >= 2) searchICD11(debouncedIcd11Query);
    else setIcd11Results([]);
  }, [debouncedIcd11Query, searchICD11]);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-6">
        <PageHeader
          title="Health Information Exchange"
          helpContent="Search external FHIR registries, validate LOINC/SNOMED terminology codes, import SDMX benchmark data from KHIS, and monitor interoperability connections."
        />

        {/* Connection Status Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Globe className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">FHIR R4</p>
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Active</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Network className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">HL7 v2.5.1</p>
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Active</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <FlaskConical className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">LOINC</p>
                  <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">Local</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">SNOMED CT</p>
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Active</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="fhir-search" className="space-y-4">
          <TabsList className="w-full flex overflow-x-auto">
            <TabsTrigger value="fhir-search" className="gap-2">
              <Search className="h-4 w-4" />
              <span className="sm:hidden">FHIR</span>
              <span className="hidden sm:inline">FHIR Patient Search</span>
            </TabsTrigger>
            <TabsTrigger value="loinc" className="gap-2">
              <FlaskConical className="h-4 w-4" />
              <span className="sm:hidden">LOINC</span>
              <span className="hidden sm:inline">LOINC Lookup</span>
            </TabsTrigger>
            <TabsTrigger value="snomed" className="gap-2">
              <Stethoscope className="h-4 w-4" />
              <span className="sm:hidden">SNOMED</span>
              <span className="hidden sm:inline">SNOMED CT</span>
            </TabsTrigger>
            <TabsTrigger value="icd" className="gap-2">
              <BookOpen className="h-4 w-4" />
              <span className="sm:hidden">ICD</span>
              <span className="hidden sm:inline">ICD-10/11</span>
            </TabsTrigger>
            <TabsTrigger value="sdmx" className="gap-2">
              <Upload className="h-4 w-4" />
              <span className="sm:hidden">SDMX</span>
              <span className="hidden sm:inline">SDMX Import</span>
            </TabsTrigger>
            <TabsTrigger value="benchmarks" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="sm:hidden">Bench</span>
              <span className="hidden sm:inline">Benchmarks</span>
            </TabsTrigger>
          </TabsList>

          {/* FHIR Patient Search Tab */}
          <TabsContent value="fhir-search" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">FHIR R4 Resource Search</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select value={fhirResourceType} onValueChange={setFhirResourceType}>
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Patient">Patient</SelectItem>
                      <SelectItem value="Encounter">Encounter</SelectItem>
                      <SelectItem value="Condition">Condition</SelectItem>
                      <SelectItem value="Observation">Observation</SelectItem>
                      <SelectItem value="DiagnosticReport">DiagnosticReport</SelectItem>
                      <SelectItem value="MedicationStatement">MedicationStatement</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={
                        fhirResourceType === 'Patient'
                          ? 'Search by name or MRN...'
                          : fhirResourceType === 'Encounter'
                            ? 'Patient ID or date (ge2024-01-01)...'
                            : fhirResourceType === 'Condition'
                              ? 'Patient ID or ICD-10/SNOMED code...'
                              : fhirResourceType === 'Observation'
                                ? 'Patient ID or category (vital-signs, laboratory)...'
                                : fhirResourceType === 'DiagnosticReport'
                                  ? 'Patient ID or status (final, preliminary)...'
                                  : 'Patient ID...'
                      }
                      value={patientSearchQuery}
                      onChange={(e) => setPatientSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                    {patientSearchLoading && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Supports FHIR date prefixes: <code>ge</code> (≥), <code>le</code> (≤), <code>gt</code> (&gt;), <code>lt</code> (&lt;).
                  Example: <code>ge2024-01-01</code>
                </p>

                {patientSearchError && (
                  <p className="text-sm text-destructive">{patientSearchError}</p>
                )}

                {patientResults.length > 0 && (
                  <div className="border rounded-lg divide-y">
                    {patientResults.map((resource, i) => (
                      <div key={resource.id || i} className="p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {resource.resourceType === 'Patient' ? (
                            <>
                              <p className="font-medium truncate">
                                {resource.name?.[0]?.given?.join(' ')}{' '}
                                {resource.name?.[0]?.family}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {resource.identifier?.[0]?.value} &bull;{' '}
                                {resource.gender} &bull; DOB: {resource.birthDate}
                              </p>
                            </>
                          ) : resource.resourceType === 'Encounter' ? (
                            <>
                              <p className="font-medium truncate">
                                Encounter #{resource.id} — {resource.status}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Class: {resource.class?.code} &bull;{' '}
                                {resource.period?.start} &bull;{' '}
                                {resource.reasonCode?.[0]?.text || 'No reason'}
                              </p>
                            </>
                          ) : resource.resourceType === 'DiagnosticReport' ? (
                            <>
                              <p className="font-medium truncate">
                                Report #{resource.id} — {resource.status}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {resource.code?.coding?.[0]?.display || 'Lab report'} &bull;{' '}
                                Issued: {resource.issued || '—'}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="font-medium truncate">
                                {resource.resourceType} #{resource.id}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Status: {resource.status || '—'} &bull;{' '}
                                {resource.subject?.reference || ''}
                              </p>
                            </>
                          )}
                        </div>
                        <Badge variant="outline" className="shrink-0">{resource.resourceType}</Badge>
                      </div>
                    ))}
                  </div>
                )}

                {patientResults.length === 0 && !patientSearchLoading && patientSearchQuery && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No results found. Try a different search term.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">FHIR Write Endpoints</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { resource: 'Patient', desc: 'Create patient from external system' },
                    { resource: 'Observation', desc: 'Receive vital signs / lab results' },
                    { resource: 'Condition', desc: 'Receive diagnoses (ICD-10/SNOMED)' },
                    { resource: 'Encounter', desc: 'Receive referral encounters' },
                    { resource: 'MedicationRequest', desc: 'Receive prescriptions' },
                    { resource: 'DiagnosticReport', desc: 'Receive external lab reports' },
                  ].map(({ resource, desc }) => (
                    <div key={resource} className="border rounded-lg p-3">
                      <p className="font-medium text-sm">POST /fhir/{resource}/</p>
                      <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* LOINC Lookup Tab */}
          <TabsContent value="loinc" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">LOINC Terminology Search</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search LOINC codes (e.g. hemoglobin, glucose)..."
                    value={loincQuery}
                    onChange={(e) => setLoincQuery(e.target.value)}
                    className="pl-9"
                  />
                  {loincSearchLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  )}
                </div>

                {loincExternalAvailable && (
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                    External LOINC FHIR server connected
                  </Badge>
                )}

                {loincResults.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
                    {loincResults.map((result, i) => (
                      <div key={result.code || i} className="p-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="font-mono text-xs">
                            {result.code}
                          </Badge>
                          <span className="text-sm font-medium">{result.display || result.component}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SNOMED CT Search Tab */}
          <TabsContent value="snomed" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">SNOMED CT Concept Search</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search SNOMED CT concepts (e.g., diabetes, fracture, hypertension)..."
                    value={snomedQuery}
                    onChange={(e) => setSnomedQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>

                {snomedLoading && <p className="text-sm text-muted-foreground">Searching...</p>}

                {snomedResults.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
                    {snomedResults.map((r) => (
                      <div key={r.concept_id} className="p-3 hover:bg-muted/50">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs shrink-0">{r.concept_id}</Badge>
                          <span className="text-sm font-medium">{r.display}</span>
                        </div>
                        {r.semantic_tag && (
                          <span className="text-xs text-muted-foreground ml-[88px]">{r.semantic_tag}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!snomedLoading && snomedResults.length === 0 && debouncedSnomedQuery.length >= 2 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No concepts found</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ICD-10/11 Search Tab */}
          <TabsContent value="icd" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* ICD-10 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">ICD-10 Search</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search ICD-10 codes (e.g., malaria, E11)..."
                      value={icd10Query}
                      onChange={(e) => setIcd10Query(e.target.value)}
                      className="pl-8"
                    />
                  </div>

                  {icd10Loading && <p className="text-sm text-muted-foreground">Searching...</p>}

                  {icd10Results.length > 0 && (
                    <div className="border rounded-lg divide-y max-h-[350px] overflow-y-auto">
                      {icd10Results.map((r) => (
                        <div key={r.id} className="p-2.5 hover:bg-muted/50">
                          <div className="flex items-center gap-2">
                            <Badge className="font-mono text-xs shrink-0 bg-blue-100 text-blue-800">{r.code}</Badge>
                            <span className="text-sm">{r.description}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!icd10Loading && icd10Results.length === 0 && debouncedIcd10Query.length >= 2 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No codes found</p>
                  )}
                </CardContent>
              </Card>

              {/* ICD-11 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">ICD-11 Search</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search ICD-11 codes (e.g., diabetes, BA00)..."
                      value={icd11Query}
                      onChange={(e) => setIcd11Query(e.target.value)}
                      className="pl-8"
                    />
                  </div>

                  {icd11Loading && <p className="text-sm text-muted-foreground">Searching...</p>}

                  {icd11Results.length > 0 && (
                    <div className="border rounded-lg divide-y max-h-[350px] overflow-y-auto">
                      {icd11Results.map((r, i) => (
                        <div key={`${r.code}-${i}`} className="p-2.5 hover:bg-muted/50">
                          <div className="flex items-center gap-2">
                            <Badge className="font-mono text-xs shrink-0 bg-purple-100 text-purple-800">{r.code}</Badge>
                            <span className="text-sm">{r.title}</span>
                          </div>
                          {r.definition && (
                            <p className="text-xs text-muted-foreground mt-1 ml-[72px] line-clamp-2">{r.definition}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {!icd11Loading && icd11Results.length === 0 && debouncedIcd11Query.length >= 2 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No codes found</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* SDMX Import Tab */}
          <TabsContent value="sdmx" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">SDMX-ML Benchmark Import</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload SDMX-ML 2.1 files from KHIS/DHIS2 to import benchmark data for facility comparison.
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    type="file"
                    accept=".xml,.sdmx"
                    onChange={(e) => setSdmxFile(e.target.files?.[0] || null)}
                    className="flex-1"
                  />
                  <Button onClick={importSDMX} disabled={!sdmxFile || sdmxImporting}>
                    {sdmxImporting ? 'Importing...' : 'Import'}
                  </Button>
                </div>

                {sdmxError && (
                  <p className="text-sm text-destructive">{sdmxError}</p>
                )}

                {sdmxResult && (
                  <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/20">
                    <p className="text-sm font-medium text-green-700 dark:text-green-300">
                      Successfully imported {sdmxResult.imported} observations
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Dataset: {sdmxResult.dataset_id}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Benchmarks Tab */}
          <TabsContent value="benchmarks" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Imported Benchmarks</CardTitle>
                <Button size="sm" onClick={loadBenchmarks} disabled={benchmarksLoading}>
                  {benchmarksLoading ? 'Loading...' : 'Load'}
                </Button>
              </CardHeader>
              <CardContent>
                {benchmarks.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[500px]">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2">Indicator</th>
                          <th className="text-left py-2 px-2">Period</th>
                          <th className="text-left py-2 px-2">Facility</th>
                          <th className="text-left py-2 px-2">Source</th>
                          <th className="text-right py-2 px-2">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {benchmarks.map((b, i) => (
                          <tr key={i}>
                            <td className="py-2 px-2 font-mono text-xs">{b.indicator_code}</td>
                            <td className="py-2 px-2">{b.time_period}</td>
                            <td className="py-2 px-2">{b.facility_code || '—'}</td>
                            <td className="py-2 px-2">
                              <Badge variant="outline" className="text-xs">{b.source}</Badge>
                            </td>
                            <td className="py-2 px-2 text-right font-medium">{b.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No benchmarks imported yet. Use the SDMX Import tab to upload data.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PullToRefresh>
  );
}
