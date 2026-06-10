'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Eye,
  EyeOff,
  Activity,
  Pill,
  FlaskConical,
  ClipboardList,
  Thermometer,
  Droplets,
  HeartPulse,
  ShieldAlert,
  Pin,
  PinOff,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HelpPopover } from '@/components/shared/help-popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { WardRound, AdmissionOrdersResponse, NursingKardex, TemperatureReading, FluidBalanceSheet, BPMonitoringReading, BloodTransfusion } from '@/lib/types/inpatient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClinicalReferenceCardProps {
  wardRounds?: { results: WardRound[] } | null;
  orders?: AdmissionOrdersResponse | null;
  kardex?: NursingKardex | null;
  temperatureReadings?: TemperatureReading[] | null;
  fluidBalanceSheets?: FluidBalanceSheet[] | null;
  bpReadings?: BPMonitoringReading[] | null;
  bloodTransfusions?: BloodTransfusion[] | null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeading({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-1.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      {label}
    </h4>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground italic">{text}</p>;
}

function RiskBadge({ level, label }: { level: string; label: string }) {
  const colors: Record<string, string> = {
    HIGH: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    MODERATE: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    LOW: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  };
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${colors[level] || ''}`}>{level}</Badge>
    </span>
  );
}

function fmtDate(iso: string | undefined) {
  if (!iso) return '';
  try { return format(parseISO(iso), 'dd MMM'); } catch { return iso.slice(0, 10); }
}

function fmtDateTime(iso: string | undefined) {
  if (!iso) return '';
  try { return format(parseISO(iso), 'dd MMM HH:mm'); } catch { return iso.slice(0, 16); }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ClinicalReferenceCard({
  wardRounds,
  orders,
  kardex,
  temperatureReadings,
  fluidBalanceSheets,
  bpReadings,
  bloodTransfusions,
}: ClinicalReferenceCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isPinned, setIsPinned] = useState(false);

  const rounds = wardRounds?.results ?? [];
  const labOrders = orders?.lab_orders ?? [];
  const imagingOrders = orders?.imaging_orders ?? [];
  const prescriptions = orders?.prescriptions ?? [];
  const temps = temperatureReadings ?? [];
  const fluids = fluidBalanceSheets ?? [];
  const bps = bpReadings ?? [];
  const transfusions = bloodTransfusions ?? [];
  const carePlan = kardex?.care_plan_entries ?? [];

  const hasData = rounds.length > 0 || labOrders.length > 0 || imagingOrders.length > 0 ||
    prescriptions.length > 0 || !!kardex || temps.length > 0 || fluids.length > 0 ||
    bps.length > 0 || transfusions.length > 0;

  if (!hasData) return null;

  const handlePin = () => {
    if (!isPinned) {
      // Expand when pinning
      setIsOpen(true);
    }
    setIsPinned(!isPinned);
  };

  return (
    <Card className={cn(
      'transition-all duration-200',
      isPinned && 'sticky top-0 z-40 shadow-lg border-primary/30 max-h-[45vh] flex flex-col',
    )}>
      <CardHeader className="pb-2 shrink-0">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center gap-2 text-left"
            >
              <CardTitle className="text-base">Clinical Reference</CardTitle>
            </button>
            {isPinned && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Pinned</Badge>
            )}
            <HelpPopover content="Read-only summary of the patient's admission data — ward rounds, labs, imaging, prescriptions, nursing kardex, and observation charts. Use as a reference while completing the discharge summary." />
          </div>
          <div className="flex items-center gap-1">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handlePin}
                    className={cn(
                      'inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-accent hover:text-accent-foreground',
                      isPinned ? 'text-primary' : 'text-muted-foreground',
                    )}
                    aria-label={isPinned ? 'Unpin clinical reference' : 'Pin clinical reference to top'}
                    aria-pressed={isPinned}
                  >
                    {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isPinned ? 'Unpin from top' : 'Pin to top while scrolling'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="inline-flex items-center justify-center rounded-md h-7 w-7 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    aria-label={isOpen ? 'Hide clinical reference' : 'Show clinical reference'}
                  >
                    {isOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isOpen ? 'Hide content' : 'Show content'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>

      {isOpen && (
        <CardContent className={cn(
          'pt-0 space-y-5 text-sm',
          isPinned && 'overflow-y-auto min-h-0',
        )}>
          {/* ---- Ward Rounds ---- */}
          {rounds.length > 0 && (
            <div>
              <SectionHeading icon={Activity} label={`Ward Rounds (${Math.min(rounds.length, 5)} most recent)`} />
              <div className="space-y-2">
                {rounds.slice(0, 5).map((wr) => (
                  <div key={wr.id} className="rounded-md border p-2 text-xs space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{fmtDate(wr.round_date)} {wr.round_time?.slice(0, 5)}</span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{wr.condition_status_display || wr.condition_status}</Badge>
                        {wr.conducted_by_username && (
                          <span className="text-muted-foreground">by {wr.conducted_by_username}</span>
                        )}
                      </div>
                    </div>
                    {wr.subjective && <p><span className="text-muted-foreground">S:</span> {wr.subjective}</p>}
                    {wr.objective && <p><span className="text-muted-foreground">O:</span> {wr.objective}</p>}
                    {wr.assessment && <p><span className="text-muted-foreground">A:</span> {wr.assessment}</p>}
                    {wr.plan && <p><span className="text-muted-foreground">P:</span> {wr.plan}</p>}
                    {wr.vital_signs && (
                      <p className="text-muted-foreground">
                        Vitals: {[
                          wr.vital_signs.temperature != null && `T ${wr.vital_signs.temperature}°C`,
                          wr.vital_signs.pulse != null && `HR ${wr.vital_signs.pulse}`,
                          wr.vital_signs.blood_pressure && `BP ${wr.vital_signs.blood_pressure}`,
                          wr.vital_signs.spo2 != null && `SpO2 ${wr.vital_signs.spo2}%`,
                          wr.vital_signs.respiratory_rate != null && `RR ${wr.vital_signs.respiratory_rate}`,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- Lab Results ---- */}
          {labOrders.length > 0 && (
            <div>
              <SectionHeading icon={FlaskConical} label="Laboratory Results" />
              <div className="space-y-1">
                {labOrders.map((lo) => (
                  <div key={lo.id} className="text-xs">
                    {(lo.items ?? []).map((item, idx) => {
                      const r = item.result;
                      return (
                        <div key={idx} className="flex gap-2 py-0.5">
                          <span className="text-muted-foreground min-w-[100px]">{item.test_name}</span>
                          <span className={r?.is_critical_result ? 'text-red-600 font-medium' : ''}>
                            {r?.formatted_value || lo.status}
                            {r?.is_critical_result && ' ⚠'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- Imaging ---- */}
          {imagingOrders.length > 0 && (
            <div>
              <SectionHeading icon={Activity} label="Imaging" />
              <div className="space-y-0.5 text-xs">
                {imagingOrders.map((io) => (
                  <div key={io.id}>
                    {io.items.map((item, idx) => (
                      <div key={idx} className="flex gap-2 py-0.5">
                        <span className="text-muted-foreground">{item.procedure_name} ({item.modality})</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{io.status}</Badge>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- Prescriptions During Stay ---- */}
          {prescriptions.length > 0 && (
            <div>
              <SectionHeading icon={Pill} label="Prescriptions During Stay" />
              <div className="space-y-0.5 text-xs">
                {prescriptions
                  .filter((rx) => rx.status !== 'CANCELLED')
                  .map((rx) => (
                    <div key={rx.id}>
                      {rx.items.map((item, idx) => (
                        <div key={idx} className="py-0.5">
                          <span className="font-medium">{item.drug_name}</span>{' '}
                          <span className="text-muted-foreground">{item.dosage} {item.frequency} × {item.duration}</span>
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* ---- Nursing Kardex ---- */}
          {kardex && (
            <div>
              <SectionHeading icon={ClipboardList} label="Nursing Kardex" />
              <div className="space-y-1.5 text-xs">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {kardex.mobility_status && (
                    <span><span className="text-muted-foreground">Mobility:</span> {kardex.mobility_status}</span>
                  )}
                  {(kardex.dietary_requirements || kardex.diet) && (
                    <span><span className="text-muted-foreground">Diet:</span> {kardex.dietary_requirements || kardex.diet}</span>
                  )}
                  {kardex.iv_access && (
                    <span><span className="text-muted-foreground">IV Access:</span> {kardex.iv_access}</span>
                  )}
                  {kardex.allergies && (
                    <span><span className="text-muted-foreground">Allergies:</span> {kardex.allergies}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <RiskBadge level={kardex.fall_risk} label="Fall Risk" />
                  <RiskBadge level={kardex.pressure_sore_risk} label="Pressure Sore" />
                  {kardex.isolation_required && (
                    <span className="inline-flex items-center gap-1 text-xs">
                      <ShieldAlert className="h-3 w-3 text-red-500" />
                      <span className="text-red-600 font-medium">Isolation: {kardex.isolation_type || 'Yes'}</span>
                    </span>
                  )}
                </div>
                {/* Active care plan entries */}
                {carePlan.filter((e) => e.status === 'ACTIVE' || e.status === 'ONGOING').length > 0 && (
                  <div className="mt-1">
                    <p className="text-muted-foreground font-medium mb-0.5">Active Care Plan:</p>
                    {carePlan
                      .filter((e) => e.status === 'ACTIVE' || e.status === 'ONGOING')
                      .slice(0, 5)
                      .map((entry) => (
                        <div key={entry.id} className="py-0.5 border-l-2 border-primary/30 pl-2 mb-1">
                          <p className="font-medium">{entry.nursing_diagnosis}</p>
                          <p className="text-muted-foreground">Goal: {entry.goal_and_outcome_criteria}</p>
                          {entry.implementation && <p className="text-muted-foreground">Impl: {entry.implementation}</p>}
                          {entry.evaluation && <p className="text-muted-foreground">Eval: {entry.evaluation}</p>}
                        </div>
                      ))}
                  </div>
                )}
                {/* Latest shift note */}
                {kardex.shift_notes && kardex.shift_notes.length > 0 && (() => {
                  const latestNote = kardex.shift_notes[0]!;
                  return (
                    <div className="mt-1">
                      <p className="text-muted-foreground font-medium mb-0.5">Latest Shift Note:</p>
                      <p className="text-xs">{latestNote.content}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {fmtDateTime(latestNote.created_at)} — {latestNote.shift} shift
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ---- Observation Charts Summary ---- */}
          {(temps.length > 0 || bps.length > 0 || fluids.length > 0 || transfusions.length > 0) && (
            <div>
              <SectionHeading icon={Thermometer} label="Observation Charts" />
              <div className="space-y-2 text-xs">
                {/* Temperature / TPR (last 5 readings) */}
                {temps.length > 0 && (
                  <div>
                    <p className="text-muted-foreground font-medium mb-0.5 flex items-center gap-1">
                      <Thermometer className="h-3 w-3" /> TPR (last {Math.min(temps.length, 5)})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-0.5">
                      {temps.slice(0, 5).map((t) => (
                        <div key={t.id} className="flex gap-2">
                          <span className="text-muted-foreground">{fmtDateTime(t.recorded_at)}</span>
                          <span className={t.is_febrile ? 'text-red-600 font-medium' : ''}>
                            {t.temperature}°C
                            {t.pulse != null && ` · HR ${t.pulse}`}
                            {t.respiratory_rate != null && ` · RR ${t.respiratory_rate}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* BP monitoring (last 5) */}
                {bps.length > 0 && (
                  <div>
                    <p className="text-muted-foreground font-medium mb-0.5 flex items-center gap-1">
                      <HeartPulse className="h-3 w-3" /> BP Monitoring (last {Math.min(bps.length, 5)})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-0.5">
                      {bps.slice(0, 5).map((bp) => (
                        <div key={bp.id} className="flex gap-2">
                          <span className="text-muted-foreground">{fmtDateTime(bp.recorded_at)}</span>
                          <span className={bp.is_hypertensive || bp.is_hypotensive ? 'text-red-600 font-medium' : ''}>
                            {bp.bp_display || `${bp.systolic}/${bp.diastolic}`}
                            {bp.pulse != null && ` · HR ${bp.pulse}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fluid balance (most recent sheet) */}
                {fluids.length > 0 && (
                  <div>
                    <p className="text-muted-foreground font-medium mb-0.5 flex items-center gap-1">
                      <Droplets className="h-3 w-3" /> Fluid Balance (latest chart)
                    </p>
                    {(() => {
                      const latest = fluids[0]!;
                      return (
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                          <span><span className="text-muted-foreground">Date:</span> {fmtDate(latest.chart_date)}</span>
                          {latest.total_intake_ml != null && (
                            <span><span className="text-muted-foreground">Intake:</span> {latest.total_intake_ml} ml</span>
                          )}
                          {latest.total_output_ml != null && (
                            <span><span className="text-muted-foreground">Output:</span> {latest.total_output_ml} ml</span>
                          )}
                          {latest.net_balance_ml != null && (
                            <span className={latest.net_balance_ml > 500 || latest.net_balance_ml < -500 ? 'font-medium text-amber-600' : ''}>
                              <span className="text-muted-foreground">Net:</span> {latest.net_balance_ml > 0 ? '+' : ''}{latest.net_balance_ml} ml
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Blood transfusions */}
                {transfusions.length > 0 && (
                  <div>
                    <p className="text-muted-foreground font-medium mb-0.5">Blood Transfusions ({transfusions.length})</p>
                    <div className="space-y-0.5">
                      {transfusions.slice(0, 3).map((t) => (
                        <div key={t.id} className="flex gap-2">
                          <span className="text-muted-foreground">{fmtDate(t.transfusion_date)}</span>
                          <span>
                            {t.blood_product_display || t.blood_product} {t.amount_ml} ml
                            {t.reaction_occurred && <span className="text-red-600 font-medium"> — REACTION</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
