'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText,
  Download,
  AlertTriangle,
  Pill,
  Activity,
  Syringe,
  TestTube2,
  Heart,
  Stethoscope,
  Baby,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types for FHIR IPS Bundle
// ─────────────────────────────────────────────────────────────────────────────

interface FHIRCoding {
  system?: string;
  code?: string;
  display?: string;
}

interface FHIRCodeableConcept {
  coding?: FHIRCoding[];
  text?: string;
}

interface FHIRReference {
  reference?: string;
  display?: string;
}

interface FHIRResource {
  resourceType: string;
  id?: string;
  [key: string]: unknown;
}

interface FHIRCondition extends FHIRResource {
  resourceType: 'Condition';
  code?: FHIRCodeableConcept;
  clinicalStatus?: FHIRCodeableConcept;
  verificationStatus?: FHIRCodeableConcept;
  severity?: FHIRCodeableConcept;
  onsetDateTime?: string;
  recordedDate?: string;
}

interface FHIRAllergyIntolerance extends FHIRResource {
  resourceType: 'AllergyIntolerance';
  code?: FHIRCodeableConcept;
  clinicalStatus?: FHIRCodeableConcept;
  type?: string;
  category?: string[];
  criticality?: string;
  reaction?: Array<{
    manifestation?: FHIRCodeableConcept[];
    severity?: string;
  }>;
}

interface FHIRMedicationStatement extends FHIRResource {
  resourceType: 'MedicationStatement';
  medicationCodeableConcept?: FHIRCodeableConcept;
  status?: string;
  dosage?: Array<{
    text?: string;
    route?: FHIRCodeableConcept;
  }>;
  effectiveDateTime?: string;
  effectivePeriod?: { start?: string; end?: string };
}

interface FHIRImmunization extends FHIRResource {
  resourceType: 'Immunization';
  vaccineCode?: FHIRCodeableConcept;
  status?: string;
  occurrenceDateTime?: string;
  site?: FHIRCodeableConcept;
  doseQuantity?: { value?: number; unit?: string };
}

interface FHIRObservation extends FHIRResource {
  resourceType: 'Observation';
  code?: FHIRCodeableConcept;
  valueQuantity?: { value?: number; unit?: string };
  valueCodeableConcept?: FHIRCodeableConcept;
  valueString?: string;
  effectiveDateTime?: string;
  status?: string;
  category?: FHIRCodeableConcept[];
}

interface FHIRDiagnosticReport extends FHIRResource {
  resourceType: 'DiagnosticReport';
  code?: FHIRCodeableConcept;
  status?: string;
  effectiveDateTime?: string;
  conclusion?: string;
  result?: FHIRReference[];
}

interface FHIRProcedure extends FHIRResource {
  resourceType: 'Procedure';
  code?: FHIRCodeableConcept;
  status?: string;
  performedDateTime?: string;
  performedPeriod?: { start?: string; end?: string };
}

interface FHIRComposition extends FHIRResource {
  resourceType: 'Composition';
  title?: string;
  date?: string;
  section?: Array<{
    title?: string;
    code?: FHIRCodeableConcept;
    entry?: FHIRReference[];
  }>;
}

interface FHIRBundle {
  resourceType: 'Bundle';
  type?: string;
  timestamp?: string;
  entry?: Array<{
    resource: FHIRResource;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

function getDisplayText(concept?: FHIRCodeableConcept): string {
  if (!concept) return '—';
  if (concept.text) return concept.text;
  if (concept.coding?.[0]?.display) return concept.coding[0].display;
  if (concept.coding?.[0]?.code) return concept.coding[0].code;
  return '—';
}

function formatFHIRDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function extractResources<T extends FHIRResource>(
  bundle: FHIRBundle,
  resourceType: string
): T[] {
  if (!bundle.entry) return [];
  return bundle.entry
    .filter((e) => e.resource?.resourceType === resourceType)
    .map((e) => e.resource as T);
}

// ─────────────────────────────────────────────────────────────────────────────
// IPS Section Components
// ─────────────────────────────────────────────────────────────────────────────

function IPSSection({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
          <Badge variant="secondary" className="text-xs">
            {count}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

function ConditionsSection({ conditions }: { conditions: FHIRCondition[] }) {
  return (
    <IPSSection title="Active Conditions" icon={Heart} count={conditions.length}>
      {conditions.map((c, i) => (
        <div key={i} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{getDisplayText(c.code)}</p>
            {c.onsetDateTime && (
              <p className="text-xs text-muted-foreground">
                Onset: {formatFHIRDate(c.onsetDateTime)}
              </p>
            )}
          </div>
          {c.clinicalStatus && (
            <Badge variant="outline" className="shrink-0 text-xs">
              {getDisplayText(c.clinicalStatus)}
            </Badge>
          )}
        </div>
      ))}
    </IPSSection>
  );
}

function AllergiesSection({ allergies }: { allergies: FHIRAllergyIntolerance[] }) {
  const criticalityColors: Record<string, string> = {
    high: 'bg-destructive/15 text-destructive',
    low: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    'unable-to-assess': 'bg-muted text-muted-foreground',
  };

  return (
    <IPSSection title="Allergies & Intolerances" icon={AlertTriangle} count={allergies.length}>
      {allergies.map((a, i) => (
        <div key={i} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{getDisplayText(a.code)}</p>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {a.category?.map((cat, j) => (
                <span key={j} className="text-xs text-muted-foreground capitalize">{cat}</span>
              ))}
              {a.reaction?.[0]?.manifestation?.[0] && (
                <span className="text-xs text-muted-foreground">
                  → {getDisplayText(a.reaction[0].manifestation[0])}
                </span>
              )}
            </div>
          </div>
          {a.criticality && (
            <Badge className={cn('shrink-0 text-xs', criticalityColors[a.criticality] || '')}>
              {a.criticality}
            </Badge>
          )}
        </div>
      ))}
    </IPSSection>
  );
}

function MedicationsSection({ medications }: { medications: FHIRMedicationStatement[] }) {
  return (
    <IPSSection title="Medications" icon={Pill} count={medications.length}>
      {medications.map((m, i) => (
        <div key={i} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{getDisplayText(m.medicationCodeableConcept)}</p>
            {m.dosage?.[0]?.text && (
              <p className="text-xs text-muted-foreground">{m.dosage[0].text}</p>
            )}
            {m.effectiveDateTime && (
              <p className="text-xs text-muted-foreground">
                {formatFHIRDate(m.effectiveDateTime)}
              </p>
            )}
          </div>
          {m.status && (
            <Badge variant="outline" className="shrink-0 text-xs capitalize">
              {m.status}
            </Badge>
          )}
        </div>
      ))}
    </IPSSection>
  );
}

function ImmunizationsSection({ immunizations }: { immunizations: FHIRImmunization[] }) {
  return (
    <IPSSection title="Immunizations" icon={Syringe} count={immunizations.length}>
      {immunizations.map((imm, i) => (
        <div key={i} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{getDisplayText(imm.vaccineCode)}</p>
            {imm.occurrenceDateTime && (
              <p className="text-xs text-muted-foreground">
                {formatFHIRDate(imm.occurrenceDateTime)}
              </p>
            )}
          </div>
          {imm.status && (
            <Badge variant="outline" className="shrink-0 text-xs capitalize">
              {imm.status}
            </Badge>
          )}
        </div>
      ))}
    </IPSSection>
  );
}

function LabResultsSection({ observations, reports }: { observations: FHIRObservation[]; reports: FHIRDiagnosticReport[] }) {
  const labObs = observations.filter(
    (o) => o.category?.some((c) => c.coding?.some((cd) => cd.code === 'laboratory'))
  );
  const items = labObs.length > 0 ? labObs : observations;
  const total = items.length + reports.length;

  return (
    <IPSSection title="Laboratory Results" icon={TestTube2} count={total}>
      {items.map((o, i) => (
        <div key={`obs-${i}`} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{getDisplayText(o.code)}</p>
            {o.effectiveDateTime && (
              <p className="text-xs text-muted-foreground">
                {formatFHIRDate(o.effectiveDateTime)}
              </p>
            )}
          </div>
          <span className="shrink-0 text-sm font-mono">
            {o.valueQuantity
              ? `${o.valueQuantity.value} ${o.valueQuantity.unit || ''}`
              : o.valueString || getDisplayText(o.valueCodeableConcept) || '—'}
          </span>
        </div>
      ))}
      {reports.map((r, i) => (
        <div key={`rpt-${i}`} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{getDisplayText(r.code)}</p>
            {r.conclusion && (
              <p className="text-xs text-muted-foreground line-clamp-2">{r.conclusion}</p>
            )}
          </div>
          {r.status && (
            <Badge variant="outline" className="shrink-0 text-xs capitalize">
              {r.status}
            </Badge>
          )}
        </div>
      ))}
    </IPSSection>
  );
}

function ProceduresSection({ procedures }: { procedures: FHIRProcedure[] }) {
  return (
    <IPSSection title="Procedures" icon={Stethoscope} count={procedures.length}>
      {procedures.map((p, i) => (
        <div key={i} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{getDisplayText(p.code)}</p>
            {(p.performedDateTime || p.performedPeriod?.start) && (
              <p className="text-xs text-muted-foreground">
                {formatFHIRDate(p.performedDateTime || p.performedPeriod?.start)}
              </p>
            )}
          </div>
          {p.status && (
            <Badge variant="outline" className="shrink-0 text-xs capitalize">
              {p.status}
            </Badge>
          )}
        </div>
      ))}
    </IPSSection>
  );
}

function SocialHistorySection({ observations }: { observations: FHIRObservation[] }) {
  const socialObs = observations.filter(
    (o) => o.category?.some((c) => c.coding?.some((cd) => cd.code === 'social-history'))
  );
  if (socialObs.length === 0) return null;

  return (
    <IPSSection title="Social History" icon={Users} count={socialObs.length}>
      {socialObs.map((o, i) => (
        <div key={i} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
          <p className="font-medium">{getDisplayText(o.code)}</p>
          <span className="shrink-0 text-sm text-muted-foreground">
            {o.valueString || getDisplayText(o.valueCodeableConcept) || '—'}
          </span>
        </div>
      ))}
    </IPSSection>
  );
}

function PregnancySection({ observations }: { observations: FHIRObservation[] }) {
  const pregnancyObs = observations.filter(
    (o) =>
      o.code?.coding?.some(
        (c) => c.system === 'http://loinc.org' && ['82810-3', '11636-8'].includes(c.code || '')
      ) ||
      getDisplayText(o.code).toLowerCase().includes('pregnan')
  );
  if (pregnancyObs.length === 0) return null;

  return (
    <IPSSection title="Pregnancy Status" icon={Baby} count={pregnancyObs.length}>
      {pregnancyObs.map((o, i) => (
        <div key={i} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
          <p className="font-medium">{getDisplayText(o.code)}</p>
          <span className="shrink-0 text-sm text-muted-foreground">
            {o.valueString || getDisplayText(o.valueCodeableConcept) || '—'}
          </span>
        </div>
      ))}
    </IPSSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main IPS Viewer Component
// ─────────────────────────────────────────────────────────────────────────────

interface IPSViewerProps {
  patientId: number;
  patientMrn: string;
}

export function IPSViewer({ patientId, patientMrn }: IPSViewerProps) {
  const [open, setOpen] = useState(false);

  const { data: bundle, isLoading, error } = useQuery<FHIRBundle>({
    queryKey: ['ips', patientId],
    queryFn: async () => {
      const { apiClient } = await import('@/lib/api/client');
      const res = await apiClient.get(`/fhir/Patient/${patientId}/$summary`, {
        headers: { Accept: 'application/fhir+json' },
      });
      return res.data;
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const handleDownload = () => {
    if (!bundle) return;
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: 'application/fhir+json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${patientMrn}-ips.fhir.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Extract resources from bundle
  const conditions = bundle ? extractResources<FHIRCondition>(bundle, 'Condition') : [];
  const allergies = bundle ? extractResources<FHIRAllergyIntolerance>(bundle, 'AllergyIntolerance') : [];
  const medications = bundle ? extractResources<FHIRMedicationStatement>(bundle, 'MedicationStatement') : [];
  const immunizations = bundle ? extractResources<FHIRImmunization>(bundle, 'Immunization') : [];
  const observations = bundle ? extractResources<FHIRObservation>(bundle, 'Observation') : [];
  const reports = bundle ? extractResources<FHIRDiagnosticReport>(bundle, 'DiagnosticReport') : [];
  const procedures = bundle ? extractResources<FHIRProcedure>(bundle, 'Procedure') : [];
  const composition = bundle
    ? extractResources<FHIRComposition>(bundle, 'Composition')[0]
    : undefined;

  const totalSections =
    (conditions.length > 0 ? 1 : 0) +
    (allergies.length > 0 ? 1 : 0) +
    (medications.length > 0 ? 1 : 0) +
    (immunizations.length > 0 ? 1 : 0) +
    (observations.length > 0 ? 1 : 0) +
    (reports.length > 0 ? 1 : 0) +
    (procedures.length > 0 ? 1 : 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto">
          <FileText className="mr-2 h-4 w-4" />
          <span className="sm:hidden">IPS</span>
          <span className="hidden sm:inline">Patient Summary</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-1">
          <SheetTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            International Patient Summary
          </SheetTitle>
          {composition?.date && (
            <p className="text-xs text-muted-foreground">
              Generated: {formatFHIRDate(composition.date)}
            </p>
          )}
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {/* Download button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleDownload}
            disabled={!bundle}
          >
            <Download className="mr-2 h-4 w-4" />
            Download FHIR JSON
          </Button>

          {/* Loading state */}
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader className="pb-3">
                    <Skeleton className="h-4 w-32" />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Error state */}
          {error && (
            <Card className="border-destructive/50">
              <CardContent className="p-4 text-center text-sm text-destructive">
                Failed to load patient summary. Please try again.
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {bundle && totalSections === 0 && (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                No clinical data available for this patient summary.
              </CardContent>
            </Card>
          )}

          {/* IPS Sections */}
          {bundle && (
            <>
              <ConditionsSection conditions={conditions} />
              <AllergiesSection allergies={allergies} />
              <MedicationsSection medications={medications} />
              <ImmunizationsSection immunizations={immunizations} />
              <LabResultsSection observations={observations} reports={reports} />
              <ProceduresSection procedures={procedures} />
              <SocialHistorySection observations={observations} />
              <PregnancySection observations={observations} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
