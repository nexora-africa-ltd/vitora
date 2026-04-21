'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  ClipboardCheck,
  FileText,
  HeartPulse,
  Loader2,
  Monitor,
  MoveRight,
  Syringe,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { theatreApi } from '@/lib/api/theatre';
import {
  TheatreCasePriorityBadge,
  TheatreCaseStatusBadge,
} from '@/components/theatre/theatre-display';
import type {
  AnesthesiaRecord,
  IntraOpVital,
  PACURecord,
  SurgeryCaseDetail,
  WHOChecklist,
} from '@/lib/types/theatre';

function formatDateTime(value?: string | null) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatMinutes(value: number) {
  if (!value) return '0 min';
  return `${value} min`;
}

export default function AnesthesiaCaseDetailPage() {
  const { caseNumber } = useParams<{ caseNumber: string }>();
  const [surgeryCase, setSurgeryCase] = useState<SurgeryCaseDetail | null>(null);
  const [anesthesiaRecord, setAnesthesiaRecord] = useState<AnesthesiaRecord | null>(null);
  const [vitals, setVitals] = useState<IntraOpVital[]>([]);
  const [pacuRecord, setPACURecord] = useState<PACURecord | null>(null);
  const [whoChecklist, setWhoChecklist] = useState<WHOChecklist | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      theatreApi.getCase(caseNumber),
      theatreApi.getAnesthesiaRecord(caseNumber).catch(() => null),
      theatreApi.listIntraOpVitals(caseNumber).catch(() => []),
      theatreApi.getPACURecord(caseNumber).catch(() => null),
      theatreApi.getWHOChecklist(caseNumber).catch(() => null),
    ]).then(([caseDetail, anesthesia, intraOpVitals, pacu, checklist]) => {
      if (!mounted) return;
      setSurgeryCase(caseDetail);
      setAnesthesiaRecord(anesthesia);
      setVitals(intraOpVitals);
      setPACURecord(pacu);
      setWhoChecklist(checklist);
    }).catch(() => {
      if (!mounted) return;
      setSurgeryCase(null);
      setAnesthesiaRecord(null);
      setVitals([]);
      setPACURecord(null);
      setWhoChecklist(null);
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [caseNumber]);

  const latestVital = useMemo(() => {
    return [...vitals].sort((left, right) => (
      new Date(right.recorded_at).getTime() - new Date(left.recorded_at).getTime()
    ))[0] ?? null;
  }, [vitals]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!surgeryCase) {
    return (
      <div className="py-24 text-center text-sm text-muted-foreground">
        No anesthesia case was found for this identifier.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Anesthesia Case ${surgeryCase.case_number}`}
        helpContent="Use this case-focused anesthesia view to assess readiness, review monitoring, inspect PACU handover details, and launch the appropriate documentation workspace."
        actions={
          <Button asChild variant="outline">
            <Link href={`/theatre/cases/${surgeryCase.case_number}`}>
              <FileText className="mr-2 h-4 w-4" />Case overview
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {surgeryCase.patient_name}
            <span className="text-muted-foreground"> · {surgeryCase.patient_mrn}</span>
          </p>
          <p className="truncate text-sm">{surgeryCase.primary_procedure_name}</p>
          <p className="text-xs text-muted-foreground">
            {surgeryCase.theatre_name} · {surgeryCase.scheduled_date} {surgeryCase.scheduled_start_time?.slice(0, 5)} · {formatMinutes(surgeryCase.estimated_duration_minutes)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TheatreCasePriorityBadge priority={surgeryCase.priority} hideElective />
          <TheatreCaseStatusBadge status={surgeryCase.status} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Anesthesia record', value: anesthesiaRecord ? 'Ready' : 'Pending', icon: Syringe },
          { label: 'WHO checklist', value: whoChecklist ? 'Available' : 'Pending', icon: ClipboardCheck },
          { label: 'Intra-op vitals', value: vitals.length, icon: Monitor },
          { label: 'PACU handover', value: pacuRecord ? 'Recorded' : 'Pending', icon: HeartPulse },
        ].map((item) => (
          <Card key={item.label} className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="text-2xl font-bold">{item.value}</p>
              <item.icon className="absolute right-4 top-4 h-5 w-5 text-muted-foreground/60" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Syringe className="h-4 w-4" />Pre-Op Assessment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="font-medium">Anesthesiologist</span>
              <span className="text-muted-foreground">{anesthesiaRecord?.anesthesiologist_name ?? 'Not assigned'}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="font-medium">Assessment completed</span>
              <span className="text-muted-foreground">{formatDateTime(anesthesiaRecord?.pre_op_assessment_at)}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="mb-1 font-medium">Airway</p>
                <p className="text-muted-foreground">Mallampati: {anesthesiaRecord?.mallampati_class || 'Not recorded'}</p>
                <p className="text-muted-foreground">Mouth opening: {anesthesiaRecord?.mouth_opening || 'Not recorded'}</p>
                <p className="text-muted-foreground">Neck mobility: {anesthesiaRecord?.neck_mobility || 'Not recorded'}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="mb-1 font-medium">Readiness</p>
                <p className="text-muted-foreground">NPO confirmed: {anesthesiaRecord?.npo_confirmed ? 'Yes' : 'No'}</p>
                <p className="text-muted-foreground">Consent obtained: {anesthesiaRecord?.anesthesia_consent_obtained ? 'Yes' : 'No'}</p>
                <p className="text-muted-foreground">Risks explained: {anesthesiaRecord?.risks_explained ? 'Yes' : 'No'}</p>
              </div>
            </div>
            <Button asChild className="w-full sm:w-auto">
              <Link href={`/theatre/cases/${surgeryCase.case_number}/pre-op`}>
                Open pre-op workspace <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4" />Intra-Op Monitoring</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border p-3">
              <p className="mb-1 font-medium">Technique</p>
              <p className="text-muted-foreground">{anesthesiaRecord?.anesthesia_technique || 'Not recorded'}</p>
              <p className="text-muted-foreground">Airway device: {anesthesiaRecord?.airway_device || 'Not recorded'}</p>
              <p className="text-muted-foreground">Induction time: {formatDateTime(anesthesiaRecord?.induction_time)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="mb-2 font-medium">Latest recorded vital</p>
              {latestVital ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <p className="text-muted-foreground">Recorded: {formatDateTime(latestVital.recorded_at)}</p>
                  <p className="text-muted-foreground">BP: {latestVital.systolic_bp && latestVital.diastolic_bp ? `${latestVital.systolic_bp}/${latestVital.diastolic_bp}` : 'Not recorded'}</p>
                  <p className="text-muted-foreground">HR: {latestVital.heart_rate ?? 'Not recorded'}</p>
                  <p className="text-muted-foreground">SpO2: {latestVital.spo2 ?? 'Not recorded'}</p>
                </div>
              ) : (
                <p className="text-muted-foreground">No intra-operative vitals have been captured yet.</p>
              )}
            </div>
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href={`/theatre/cases/${surgeryCase.case_number}/intra-op`}>
                Open intra-op workspace <MoveRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><HeartPulse className="h-4 w-4" />PACU Handover</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="font-medium">PACU arrival</span>
              <span className="text-muted-foreground">{formatDateTime(pacuRecord?.arrival_time)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="font-medium">Discharge destination</span>
              <span className="text-muted-foreground">{pacuRecord?.discharge_destination || 'Not recorded'}</span>
            </div>
            <div className="rounded-lg border p-3">
              <p className="mb-1 font-medium">Handover notes</p>
              <p className="text-muted-foreground">{anesthesiaRecord?.pacu_handover_notes || 'No PACU handover notes recorded yet.'}</p>
            </div>
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href={`/theatre/cases/${surgeryCase.case_number}/post-op`}>
                Open PACU workspace <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4" />Documentation Readiness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="font-medium">WHO checklist</span>
              <Badge variant={whoChecklist?.sign_in_complete && whoChecklist?.time_out_complete && whoChecklist?.sign_out_complete ? 'success' : 'warning'} size="sm" className="w-fit">
                {whoChecklist ? 'In progress' : 'Pending'}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="font-medium">Operative note</span>
              <Badge variant={surgeryCase.has_operative_note ? 'success' : 'warning'} size="sm" className="w-fit">
                {surgeryCase.has_operative_note ? 'Recorded' : 'Pending'}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="font-medium">Post-op orders</span>
              <span className="text-muted-foreground">{anesthesiaRecord?.other_post_op_orders || 'No orders documented'}</span>
            </div>
            <div className="rounded-lg border border-dashed p-3 text-muted-foreground">
              This view is anesthesia-focused. Use the linked workspaces for full pre-op, intra-op, and PACU documentation entry.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
