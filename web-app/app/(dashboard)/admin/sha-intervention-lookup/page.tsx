'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Search, Loader2, AlertCircle, FileSearch, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { PageHeader } from '@/components/shared/page-header';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { shaApi } from '@/lib/api/sha';
import type {
  SHAIntervention,
  InterventionSearchParams,
} from '@/lib/terminology/types';
import { INTERVENTION_CATEGORIES } from '@/lib/terminology/types';
import { formatCurrency } from '@/lib/utils/format';

type SearchStatus = 'idle' | 'searching' | 'found' | 'empty' | 'error';

const FACILITY_LEVELS = [
  { value: '2', label: 'Level 2 — Dispensary' },
  { value: '3', label: 'Level 3 — Health Centre' },
  { value: '4', label: 'Level 4 — Sub-County Hospital' },
  { value: '5', label: 'Level 5 — County Referral' },
  { value: '6', label: 'Level 6 — National Referral' },
] as const;

const PAGE_SIZE = 25;

function formatTariff(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(n)) return String(value);
  return formatCurrency(n);
}

function PreauthBadges({ item }: { item: SHAIntervention }) {
  const extras = (item.raw_data ?? {}) as Record<string, unknown>;
  const yes = (v: unknown) =>
    typeof v === 'boolean' ? v : typeof v === 'string' ? v.toLowerCase() === 'true' : false;
  const flags: string[] = [];
  if (item.is_surgical_preauth || yes(extras.requires_surgical_preauth)) flags.push('Surgical');
  if (item.is_renal_preauth || yes(extras.requires_renal_preauth)) flags.push('Renal');
  if (item.is_oncology_preauth || yes(extras.requires_oncology_preauth)) flags.push('Oncology');
  if (item.is_imaging_preauth || yes(extras.requires_radiology_preauth)) flags.push('Imaging');
  if (item.is_optical_preauth || yes(extras.requires_optical_preauth)) flags.push('Optical');
  if (item.needs_manual_preauth_approval || yes(extras.needs_manual_preauth_approval)) {
    flags.push('Manual approval');
  }
  if (!flags.length && (item.requires_preauthorization || item.needs_preauth)) {
    flags.push('Required');
  }
  if (!flags.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
      ))}
    </div>
  );
}

export default function SHAInterventionLookupPage() {
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [facilityLevel, setFacilityLevel] = useState<string>('all');
  const [requiresPreauth, setRequiresPreauth] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<SHAIntervention[]>([]);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [selected, setSelected] = useState<SHAIntervention | null>(null);

  // Debounce search input (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, facilityLevel, requiresPreauth]);

  const params = useMemo(() => {
    // Backend `/api/billing/terminology/interventions/` uses limit/offset, not page/page_size.
    const p: InterventionSearchParams & { limit?: number; offset?: number } = {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
    if (debouncedSearch) p.search = debouncedSearch;
    if (category !== 'all') p.category = category;
    if (facilityLevel !== 'all') p.facility_level = Number(facilityLevel);
    return p;
  }, [debouncedSearch, category, facilityLevel, page]);

  const fetchData = useCallback(async () => {
    // Backend requires either a 2+ char search or a facility_level filter.
    if (!params.search && params.facility_level === undefined) {
      setResults([]);
      setCount(0);
      setHasNext(false);
      setStatus('idle');
      return;
    }
    setStatus('searching');
    setError(null);
    try {
      const response = await shaApi.searchInterventions(
        params as InterventionSearchParams
      );
      let rows = response.results;
      // Client-side preauth filter (backend may not support it)
      if (requiresPreauth === 'yes') {
        rows = rows.filter(
          (r) => r.requires_preauthorization || r.needs_preauth
        );
      } else if (requiresPreauth === 'no') {
        rows = rows.filter(
          (r) => !r.requires_preauthorization && !r.needs_preauth
        );
      }
      setResults(rows);
      setCount(response.count);
      const offset = (params.offset as number) ?? 0;
      setHasNext(offset + rows.length < response.count);
      setStatus(rows.length ? 'found' : 'empty');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setStatus('error');
      setResults([]);
    }
  }, [params, requiresPreauth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const clearFilters = () => {
    setSearchInput('');
    setCategory('all');
    setFacilityLevel('all');
    setRequiresPreauth('all');
  };

  const hasActiveFilters =
    debouncedSearch !== '' ||
    category !== 'all' ||
    facilityLevel !== 'all' ||
    requiresPreauth !== 'all';

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="SHA Intervention Lookup"
        helpContent="Browse the SHA benefits & interventions catalog (sourced from MOH-KENYA OCL). View tariffs by facility level, preauthorization requirements, payment mechanism, and access point. Useful for pre-visit price quoting, coverage research, and SHA audit preparation."
      />

      {/* Filter Card */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Code or name (e.g., SHA-01, dialysis, immunotherapy)"
                  className="pl-10"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {INTERVENTION_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Facility Level</Label>
              <Select value={facilityLevel} onValueChange={setFacilityLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  {FACILITY_LEVELS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Preauthorization</Label>
              <Select value={requiresPreauth} onValueChange={setRequiresPreauth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  <SelectItem value="yes">Required</SelectItem>
                  <SelectItem value="no">Not required</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end justify-end lg:col-span-3">
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="gap-1"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear filters
                </Button>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {status === 'searching' && 'Searching...'}
            {status !== 'searching' && count > 0 && (
              <>
                Showing {results.length} of {count.toLocaleString()} intervention(s)
                {requiresPreauth !== 'all' && ' (preauth filter applied client-side)'}
              </>
            )}
            {status === 'empty' && 'No interventions match the current filters.'}
          </p>
        </CardContent>
      </Card>

      {/* Error */}
      {status === 'error' && error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Search failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {(status === 'searching' || status === 'found' || status === 'empty') && (
        <Card>
          <CardContent className="px-0 sm:px-6 pt-6">
            <ResponsiveTable<SHAIntervention>
              data={results}
              keyExtractor={(i) => i.id ?? i.code}
              isLoading={status === 'searching'}
              emptyMessage="No interventions match the current filters."
              onRowClick={(i) => setSelected(i)}
              defaultSortColumn="code"
              columns={[
                {
                  key: 'code',
                  header: 'Code',
                  sortable: true,
                  cell: (i) => <span className="font-mono text-xs">{i.code}</span>,
                },
                {
                  key: 'name',
                  header: 'Name',
                  sortable: true,
                  cell: (i) => <span className="font-medium">{i.name}</span>,
                },
                {
                  key: 'category',
                  header: 'Category',
                  sortable: true,
                  hideOnMobile: true,
                  cell: (i) => i.category || '—',
                },
                {
                  key: 'facility_level',
                  header: 'Min Level',
                  sortable: true,
                  sortType: 'number',
                  hideOnMobile: true,
                  cell: (i) => i.facility_level ? `L${i.facility_level}` : '—',
                },
                {
                  key: 'price',
                  header: 'Tariff',
                  sortable: true,
                  sortType: 'number',
                  cell: (i) => (
                    <span className="font-mono text-xs">{formatTariff(i.price)}</span>
                  ),
                },
                {
                  key: 'preauth',
                  header: 'Preauth',
                  hideOnMobile: true,
                  cell: (i) => <PreauthBadges item={i} />,
                },
                {
                  key: 'status',
                  header: 'Status',
                  hideOnMobile: true,
                  cell: (i) => (
                    <Badge variant={i.is_active ? 'default' : 'outline'}>
                      {i.is_active ? 'Active' : 'Retired'}
                    </Badge>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {status === 'found' && (page > 1 || hasNext) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || status !== 'found'}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNext || status !== 'found'}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Initial empty state */}
      {status === 'idle' && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileSearch className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              Type a code or name (min 2 characters), or pick a facility level to browse the catalog.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Detail Drawer */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={selected.is_active ? 'default' : 'outline'}>
                    {selected.is_active ? 'Active' : 'Retired'}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {selected.code}
                  </span>
                </div>
                <SheetTitle className="text-left">{selected.name}</SheetTitle>
                {selected.description && (
                  <SheetDescription className="text-left">
                    {selected.description}
                  </SheetDescription>
                )}
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {(() => {
                  const extras = (selected.raw_data ?? {}) as Record<string, unknown>;
                  const isProcedure = 'Tariff (KES)' in extras;
                  const isCodeRegimen = 'cost_per_cycle' in extras || 'regimen' in extras;

                  const accessPoint =
                    (extras.access_point as string) || selected.access_point || '—';
                  const paymentMechanism =
                    (extras.payment_mechanism as string) ||
                    selected.payment_mechanism?.replace(/_/g, ' ') ||
                    '—';
                  const benefit = extras.benefit as string | undefined;
                  const complexity = extras.complexity as string | undefined;
                  const coverageLevel = extras.coverage_level as string | undefined;
                  const isIntraMetro = extras.is_intra_metro as string | undefined;
                  const applicableGender = extras.applicable_gender as string | undefined;
                  const lowerAge = extras.lower_age_limit as string | number | undefined;
                  const upperAge = extras.upper_age_limit as string | number | undefined;
                  const activeForUhc = extras.active_for_uhc as string | undefined;
                  const retiredOn = extras.retired_on as string | undefined;
                  const comment = extras.comment as string | undefined;
                  const protocolUsed = extras.protocol_used as string | null | undefined;
                  const needsProtocols = extras.needs_protocols as string | undefined;
                  const numberOfDoctors = extras.number_of_doctors_required as
                    | string
                    | number
                    | undefined;
                  const needsDoctorAuth = extras.needs_doctor_authorization as
                    | string
                    | undefined;
                  const needsMemberAuth = extras.needs_member_authorization as
                    | string
                    | undefined;
                  const levelsApplicable = extras.levels_applicable as unknown;
                  const applicableSchemes = extras.applicable_schemes as unknown;
                  const applicableFacilityOwnership = extras.applicable_facility_ownership as unknown;
                  const applicableDocumentTypes = extras.applicable_document_types as unknown;
                  const diagnosisLists = extras.diagnosis_lists as unknown;
                  const diagnosisBlocks = extras.diagnosis_blocks as unknown;
                  const managementTariff = extras.management_tariff as number | undefined;
                  const investigationTariff = extras.investigation_tariff as number | undefined;
                  const tariffLimitPerIndividual = extras.tariff_limit_per_individual as
                    | number
                    | undefined;
                  const managementTariffHasLimit = extras.management_tariff_has_limit as
                    | string
                    | undefined;

                  const preauthFlags: { label: string; required: boolean }[] = [
                    { label: 'Surgical', required: yesString(extras.requires_surgical_preauth) },
                    { label: 'Renal', required: yesString(extras.requires_renal_preauth) },
                    { label: 'Oncology', required: yesString(extras.requires_oncology_preauth) },
                    { label: 'Optical', required: yesString(extras.requires_optical_preauth) },
                    { label: 'Radiology', required: yesString(extras.requires_radiology_preauth) },
                  ];
                  const anyPreauth = preauthFlags.some((f) => f.required);

                  return (
                    <>
                      {/* Summary */}
                      <section className="grid grid-cols-2 gap-3">
                        <DetailField label="Category" value={selected.category || '—'} />
                        <DetailField
                          label="Min Facility Level"
                          value={selected.facility_level ? `Level ${selected.facility_level}` : '—'}
                        />
                        <DetailField label="Access Point" value={accessPoint} />
                        <DetailField label="Payment Mechanism" value={paymentMechanism} />
                        {benefit && <DetailField label="Parent Benefit" value={<span className="font-mono text-xs">{benefit}</span>} />}
                        {complexity && <DetailField label="Complexity" value={complexity} />}
                        {coverageLevel && <DetailField label="Coverage Level" value={coverageLevel} />}
                        {applicableGender && (
                          <DetailField label="Applicable Gender" value={applicableGender} />
                        )}
                        {(lowerAge || upperAge) && (
                          <DetailField
                            label="Age Range"
                            value={`${lowerAge || '0'} – ${upperAge || '∞'}`}
                          />
                        )}
                        {isIntraMetro !== undefined && (
                          <DetailField
                            label="Intra-Metro Only"
                            value={yesString(isIntraMetro) ? 'Yes' : 'No'}
                          />
                        )}
                        {activeForUhc !== undefined && (
                          <DetailField
                            label="UHC Active"
                            value={yesString(activeForUhc) ? 'Yes' : 'No'}
                          />
                        )}
                      </section>

                      {/* Hospital Level Tariffs (from raw_data.level_X_tariff) */}
                      {!isProcedure && !isCodeRegimen && (
                        <section>
                          <h3 className="text-sm font-semibold mb-2">Hospital Level Tariffs</h3>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {[2, 3, 4, 5, 6].map((lvl) => {
                              const tariff = extras[`level_${lvl}_tariff`] as number | string | null | undefined;
                              const fallback = extras[`fall_back_level_${lvl}_tariff`] as number | string | null | undefined;
                              const hasFallback = fallback !== undefined && fallback !== null && Number(fallback) > 0;
                              return (
                                <div key={lvl} className="rounded-md border p-2 text-center">
                                  <div className="text-xs text-muted-foreground">L{lvl}</div>
                                  <div className="font-mono text-xs mt-1">{formatTariff(tariff)}</div>
                                  {hasFallback && (
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                      fb: {formatTariff(fallback)}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-2">
                            Many DHA records report 0.0 tariffs — payment may be governed by the
                            management / investigation tariff or sub-intervention pricing.
                          </p>
                        </section>
                      )}

                      {/* Aggregate tariffs (code-class) */}
                      {!isProcedure && !isCodeRegimen && (managementTariff !== undefined || investigationTariff !== undefined || tariffLimitPerIndividual !== undefined) && (
                        <section className="grid grid-cols-2 gap-3">
                          {managementTariff !== undefined && (
                            <DetailField
                              label="Management Tariff"
                              value={
                                <span className="font-mono text-sm">
                                  {formatTariff(managementTariff)}
                                  {managementTariffHasLimit === 'True' && (
                                    <span className="ml-1 text-xs text-muted-foreground">(limited)</span>
                                  )}
                                </span>
                              }
                            />
                          )}
                          {investigationTariff !== undefined && (
                            <DetailField
                              label="Investigation Tariff"
                              value={<span className="font-mono text-sm">{formatTariff(investigationTariff)}</span>}
                            />
                          )}
                          {tariffLimitPerIndividual !== undefined && (
                            <DetailField
                              label="Per-Individual Limit"
                              value={<span className="font-mono text-sm">{formatTariff(tariffLimitPerIndividual)}</span>}
                            />
                          )}
                        </section>
                      )}

                      {/* Procedure-type sub-intervention pricing */}
                      {isProcedure && (
                        <section>
                          <h3 className="text-sm font-semibold mb-2">Sub-Intervention Pricing</h3>
                          <div className="grid grid-cols-2 gap-3">
                            <DetailField
                              label="Tariff per Test"
                              value={
                                <span className="font-mono text-sm">
                                  {formatTariff(extras['Tariff (KES)'] as string | number)}
                                </span>
                              }
                            />
                            <DetailField
                              label="Max per Year"
                              value={
                                <span className="font-mono text-sm">
                                  {formatTariff(extras['Total Maximum Amount per test'] as string | number)}
                                </span>
                              }
                            />
                            <DetailField
                              label="Quantity per Year"
                              value={selected.quantity_per_year ?? '—'}
                            />
                            {extras.Protocol ? (
                              <DetailField
                                label="Protocol"
                                value={String(extras.Protocol)}
                              />
                            ) : null}
                          </div>
                        </section>
                      )}

                      {/* Drug regimen (Code class) */}
                      {isCodeRegimen && (
                        <section>
                          <h3 className="text-sm font-semibold mb-2">Drug Regimen</h3>
                          <div className="grid grid-cols-2 gap-3">
                            {extras.regimen !== undefined && (
                              <DetailField label="Regimen" value={String(extras.regimen)} />
                            )}
                            {extras.cancer !== undefined && (
                              <DetailField label="Indication" value={String(extras.cancer)} />
                            )}
                            {extras.dosage !== undefined && (
                              <DetailField label="Dosage" value={String(extras.dosage)} />
                            )}
                            {extras.cycles !== undefined && (
                              <DetailField label="Cycles" value={String(extras.cycles)} />
                            )}
                            {extras.cost_per_cycle ? (
                              <DetailField
                                label="Cost per Cycle"
                                value={
                                  <span className="font-mono text-sm">
                                    {formatTariff(extras.cost_per_cycle as string)}
                                  </span>
                                }
                              />
                            ) : null}
                          </div>
                        </section>
                      )}

                      {/* Applicable scope */}
                      {(toArray(levelsApplicable).length ||
                        toArray(applicableSchemes).length ||
                        toArray(applicableFacilityOwnership).length) > 0 && (
                        <section className="space-y-2">
                          <h3 className="text-sm font-semibold">Applicable Scope</h3>
                          <ChipList label="Facility Levels" items={levelsApplicable} />
                          <ChipList label="Schemes" items={applicableSchemes} />
                          <ChipList label="Facility Ownership" items={applicableFacilityOwnership} />
                        </section>
                      )}

                      {/* Preauthorization */}
                      <section>
                        <h3 className="text-sm font-semibold mb-2">Preauthorization</h3>
                        {anyPreauth ? (
                          <div className="flex flex-wrap gap-1">
                            {preauthFlags
                              .filter((f) => f.required)
                              .map((f) => (
                                <Badge key={f.label} variant="secondary" className="text-xs">
                                  {f.label}
                                </Badge>
                              ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Not required.</p>
                        )}
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          {needsProtocols !== undefined && (
                            <DetailField
                              label="Needs Protocols"
                              value={yesString(needsProtocols) ? 'Yes' : 'No'}
                            />
                          )}
                          {needsDoctorAuth !== undefined && (
                            <DetailField
                              label="Doctor Authorization"
                              value={yesString(needsDoctorAuth) ? 'Required' : 'Not required'}
                            />
                          )}
                          {needsMemberAuth !== undefined && (
                            <DetailField
                              label="Member Authorization"
                              value={yesString(needsMemberAuth) ? 'Required (OTP)' : 'Not required'}
                            />
                          )}
                          {numberOfDoctors !== undefined && numberOfDoctors !== '' && (
                            <DetailField
                              label="Doctors Required"
                              value={String(numberOfDoctors)}
                            />
                          )}
                          {protocolUsed ? (
                            <DetailField label="Protocol Used" value={String(protocolUsed)} />
                          ) : null}
                        </div>
                      </section>

                      {/* Document requirements */}
                      {toArray(applicableDocumentTypes).length > 0 && (
                        <section>
                          <h3 className="text-sm font-semibold mb-2">Required Documents</h3>
                          <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                            {toArray(applicableDocumentTypes).map((doc) => (
                              <li key={doc}>{doc}</li>
                            ))}
                          </ul>
                        </section>
                      )}

                      {/* Diagnosis filtering */}
                      {(toArray(diagnosisLists).length || toArray(diagnosisBlocks).length) > 0 && (
                        <section className="space-y-2">
                          <h3 className="text-sm font-semibold">Diagnosis Filtering</h3>
                          <ChipList label="Diagnosis Lists" items={diagnosisLists} />
                          <ChipList label="Diagnosis Blocks" items={diagnosisBlocks} />
                        </section>
                      )}

                      {/* Retirement / comments */}
                      {(retiredOn || comment) && (
                        <section className="grid grid-cols-1 gap-3">
                          {retiredOn ? (
                            <DetailField label="Retired On" value={retiredOn} />
                          ) : null}
                          {comment ? (
                            <DetailField label="Comment" value={comment} />
                          ) : null}
                        </section>
                      )}

                      {/* Combination rule warning for ALONE packages */}
                      {isAlonePackage(selected.code) && (
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>ALONE package</AlertTitle>
                          <AlertDescription>
                            This intervention belongs to an SHA package that must be claimed
                            ALONE — it cannot be combined with other interventions on the same
                            claim.
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* Raw OCL record (for audit / debug) */}
                      <section>
                        <details className="rounded-md border bg-muted/30">
                          <summary className="cursor-pointer px-3 py-2 text-xs font-medium select-none">
                            Raw DHA OCL record
                          </summary>
                          <pre className="px-3 py-2 text-[11px] overflow-x-auto max-h-80 leading-relaxed">
                            {JSON.stringify(extras, null, 2)}
                          </pre>
                        </details>
                      </section>
                    </>
                  );
                })()}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium capitalize">{value}</div>
    </div>
  );
}

function ChipList({ label, items }: { label: string; items: unknown }) {
  // OCL sometimes returns a single string (e.g. applicable_facility_ownership: "ALL")
  // instead of an array. Normalise to string[].
  const list: string[] = Array.isArray(items)
    ? items.map((v) => String(v))
    : items === null || items === undefined || items === ''
      ? []
      : [String(items)];
  if (!list.length) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1">
        {list.map((item, i) => (
          <Badge key={`${item}-${i}`} variant="outline" className="text-xs font-normal">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

/** Parse DHA's mixed boolean encoding: "True"/"False" strings or actual booleans. */
function yesString(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

/** Normalise OCL fields that may be array, string, null, or missing. */
function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (value === null || value === undefined || value === '') return [];
  return [String(value)];
}

/** ALONE packages: SHA-01/05/06/09/10/12/18 — must be claimed alone. */
function isAlonePackage(code: string): boolean {
  const alone = ['SHA-01', 'SHA-05', 'SHA-06', 'SHA-09', 'SHA-10', 'SHA-12', 'SHA-18'];
  return alone.some((p) => code.startsWith(p));
}
