'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { Search, Globe, Upload, Activity, FileText, Network, FlaskConical } from 'lucide-react';
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

  // LOINC Search
  const [loincQuery, setLoincQuery] = useState('');
  const [loincResults, setLoincResults] = useState<LOINCResult[]>([]);
  const [loincSearchLoading, setLoincSearchLoading] = useState(false);
  const [loincExternalAvailable, setLoincExternalAvailable] = useState(false);

  // SDMX Import
  const [sdmxFile, setSdmxFile] = useState<File | null>(null);
  const [sdmxImporting, setSdmxImporting] = useState(false);
  const [sdmxResult, setSdmxResult] = useState<{ imported: number; dataset_id: string } | null>(null);
  const [sdmxError, setSdmxError] = useState('');

  // Benchmarks
  const [benchmarks, setBenchmarks] = useState<BenchmarkResult[]>([]);
  const [benchmarksLoading, setBenchmarksLoading] = useState(false);

  const searchFHIRPatients = async () => {
    if (!patientSearchQuery.trim()) return;
    setPatientSearchLoading(true);
    setPatientSearchError('');
    try {
      const params: Record<string, string> = {};

      if (fhirResourceType === 'Patient') {
        if (patientSearchQuery.startsWith('MRN-')) {
          params.identifier = patientSearchQuery;
        } else {
          params.name = patientSearchQuery;
        }
      } else if (fhirResourceType === 'Encounter') {
        // Search by patient ID or date
        if (/^\d+$/.test(patientSearchQuery)) {
          params.patient = patientSearchQuery;
        } else {
          params.date = patientSearchQuery;
        }
      } else if (fhirResourceType === 'DiagnosticReport') {
        if (/^\d+$/.test(patientSearchQuery)) {
          params.patient = patientSearchQuery;
        } else {
          params.status = patientSearchQuery;
        }
      } else if (fhirResourceType === 'Condition') {
        if (/^\d+$/.test(patientSearchQuery)) {
          params.patient = patientSearchQuery;
        } else {
          params.code = patientSearchQuery;
        }
      } else if (fhirResourceType === 'Observation') {
        if (/^\d+$/.test(patientSearchQuery)) {
          params.patient = patientSearchQuery;
        } else {
          params.category = patientSearchQuery;
        }
      } else {
        params.patient = patientSearchQuery;
      }

      const response = await apiClient.get<FHIRBundle>(`/fhir/${fhirResourceType}`, { params });
      setPatientResults(response.data.entry?.map((e) => e.resource) || []);
    } catch (err: unknown) {
      setPatientSearchError(err instanceof Error ? err.message : 'Search failed');
      setPatientResults([]);
    } finally {
      setPatientSearchLoading(false);
    }
  };

  const searchLOINC = async () => {
    if (!loincQuery.trim() || loincQuery.length < 2) return;
    setLoincSearchLoading(true);
    try {
      const response = await apiClient.get<{
        count: number;
        external_available: boolean;
        results: LOINCResult[];
      }>('/api/laboratory/loinc-search/', { params: { q: loincQuery } });
      setLoincResults(response.data.results);
      setLoincExternalAvailable(response.data.external_available);
    } catch {
      setLoincResults([]);
    } finally {
      setLoincSearchLoading(false);
    }
  };

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
                    onKeyDown={(e) => e.key === 'Enter' && searchFHIRPatients()}
                    className="flex-1"
                  />
                  <Button onClick={searchFHIRPatients} disabled={patientSearchLoading}>
                    {patientSearchLoading ? 'Searching...' : 'Search'}
                  </Button>
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
                <div className="flex gap-2">
                  <Input
                    placeholder="Search LOINC codes (e.g. hemoglobin, glucose)..."
                    value={loincQuery}
                    onChange={(e) => setLoincQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchLOINC()}
                    className="flex-1"
                  />
                  <Button onClick={searchLOINC} disabled={loincSearchLoading}>
                    {loincSearchLoading ? 'Searching...' : 'Search'}
                  </Button>
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
