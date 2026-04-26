'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Droplets, AlertTriangle, CheckCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { HelpPopover } from '@/components/shared/help-popover';
import {
  useBloodTransfusions,
  useCreateBloodTransfusion,
  useAddTransfusionObservation,
  useMarkTransfusionReaction,
  useCompleteTransfusion,
  useATRReports,
} from '@/lib/hooks/use-inpatient';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { getAgeGroupFromYears, getVitalPlaceholder } from '@/lib/vitals';
import type {
  BloodProduct,
  BloodTransfusion,
  TransfusionObservationInterval,
  AdverseTransfusionReaction,
} from '@/lib/types/inpatient';

const BLOOD_PRODUCTS: { value: BloodProduct; label: string }[] = [
  { value: 'WHOLE', label: 'Whole Blood' },
  { value: 'PACKED_RED_CELLS', label: 'Packed Red Cells' },
  { value: 'FFP', label: 'Fresh Frozen Plasma (FFP)' },
  { value: 'PLATELETS', label: 'Platelets' },
  { value: 'CRYOPRECIPITATE', label: 'Cryoprecipitate' },
  { value: 'OTHER', label: 'Other' },
];

const OBSERVATION_INTERVALS: { value: TransfusionObservationInterval; label: string }[] = [
  { value: 'BEFORE', label: 'Before Transfusion' },
  { value: '00_MIN', label: '00 Minutes' },
  { value: '15_MIN', label: '15 Minutes' },
  { value: '45_MIN', label: '45 Minutes' },
  { value: '1HR_15MIN', label: '1hr 15 Minutes' },
  { value: '1HR_45MIN', label: '1hr 45 Minutes' },
  { value: '2HR_15MIN', label: '2hr 15 Minutes' },
  { value: '2HR_45MIN', label: '2hr 45 Minutes' },
  { value: '3HR_15MIN', label: '3hr 15 Minutes' },
  { value: '3HR_45MIN', label: '3hr 45 Minutes' },
  { value: '4HR_15MIN', label: '4hr 15 Minutes' },
  { value: '4HR_AFTER', label: '4hr After Transfusion' },
];

// MOH/PPB Form FOM20/MIP/PMS/SOP/001 — Reaction categories
const REACTION_CATEGORIES = [
  {
    label: '1. General',
    options: [
      { value: 'FEVER', label: 'Fever' },
      { value: 'CHILLS_RIGORS', label: 'Chills/Rigors' },
      { value: 'FLUSHING', label: 'Flushing' },
      { value: 'NAUSEA_VOMITING', label: 'Nausea/Vomiting' },
    ],
  },
  {
    label: '2. Dermatological',
    options: [
      { value: 'URTICARIA', label: 'Urticaria' },
      { value: 'OTHER_SKIN_RASH', label: 'Other skin rash' },
    ],
  },
  {
    label: '3. Cardiac/Respiratory',
    options: [
      { value: 'CHEST_PAIN', label: 'Chest pain' },
      { value: 'DYSPNOEA', label: 'Dyspnoea' },
      { value: 'HYPOTENSION', label: 'Hypotension' },
      { value: 'TACHYCARDIA', label: 'Tachycardia' },
    ],
  },
  {
    label: '4. Renal',
    options: [
      { value: 'HAEMOGLOBINURIA', label: 'Haemoglobinuria (Dark urine)' },
      { value: 'OLIGURIA', label: 'Oliguria' },
      { value: 'ANURIA', label: 'Anuria' },
    ],
  },
  {
    label: '5. Haematological',
    options: [
      { value: 'UNEXPLAINED_BLEEDING', label: 'Unexplained bleeding' },
    ],
  },
] as const;

// Build a reverse label→value map from REACTION_CATEGORIES for URL param generation
const LABEL_TO_VALUE = new Map<string, { value: string; category: string }>();
for (const cat of REACTION_CATEGORIES) {
  for (const opt of cat.options) {
    LABEL_TO_VALUE.set(opt.label.toLowerCase(), { value: opt.value, category: cat.label });
  }
}

/** Parse a reaction_type label string into categorised enum values + leftover text. */
function buildATRQueryParams(transfusionId: number, reactionType: string): string {
  const general: string[] = [];
  const dermatological: string[] = [];
  const cardiac: string[] = [];
  const renal: string[] = [];
  const haematological: string[] = [];
  const other: string[] = [];

  const parts = reactionType.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.toLowerCase().startsWith('other:')) {
      other.push(part.replace(/^other:\s*/i, ''));
      continue;
    }
    const match = LABEL_TO_VALUE.get(part.toLowerCase());
    if (match) {
      if (match.category.includes('General')) general.push(match.value);
      else if (match.category.includes('Dermatological')) dermatological.push(match.value);
      else if (match.category.includes('Cardiac')) cardiac.push(match.value);
      else if (match.category.includes('Renal')) renal.push(match.value);
      else if (match.category.includes('Haematological')) haematological.push(match.value);
    } else {
      other.push(part);
    }
  }

  const params = new URLSearchParams();
  params.set('transfusion', String(transfusionId));
  if (general.length) params.set('general', general.join(','));
  if (dermatological.length) params.set('dermatological', dermatological.join(','));
  if (cardiac.length) params.set('cardiac', cardiac.join(','));
  if (renal.length) params.set('renal', renal.join(','));
  if (haematological.length) params.set('haematological', haematological.join(','));
  if (other.length) params.set('other', other.join(', '));
  return `/inpatient/adverse-transfusion-reaction/new?${params.toString()}`;
}

interface BloodTransfusionChartProps {
  admissionId: number;
  isActive: boolean;
  /** Patient age in years for age-adjusted placeholders */
  patientAge?: number | null;
}

export function BloodTransfusionChart({ admissionId, isActive, patientAge }: BloodTransfusionChartProps) {
  const { toast } = useToast();
  const ageGroup = useMemo(() => (patientAge != null ? getAgeGroupFromYears(patientAge) : null), [patientAge]);
  const { data, isLoading } = useBloodTransfusions(admissionId);
  const { data: atrReports } = useATRReports(admissionId);
  const createTransfusion = useCreateBloodTransfusion();
  const addObservation = useAddTransfusionObservation();
  const markReaction = useMarkTransfusionReaction();
  const completeTransfusion = useCompleteTransfusion();

  // Build a map of transfusion ID → ATR report for quick lookup
  const atrByTransfusion = new Map<number, AdverseTransfusionReaction>();
  if (atrReports) {
    for (const atr of atrReports) {
      atrByTransfusion.set(atr.transfusion, atr);
    }
  }

  const [newTransfusionOpen, setNewTransfusionOpen] = useState(false);
  const [observationOpen, setObservationOpen] = useState(false);
  const [reactionOpen, setReactionOpen] = useState(false);
  const [selectedTransfusionId, setSelectedTransfusionId] = useState<number | null>(null);

  // New transfusion form
  const [bloodProduct, setBloodProduct] = useState<BloodProduct>('PACKED_RED_CELLS');
  const [bloodProductOther, setBloodProductOther] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [amountMl, setAmountMl] = useState('');
  const [diagnosis, setDiagnosis] = useState('');

  // Pre-transfusion baseline vitals (mandatory — recorded as a BEFORE observation)
  const [preBPSys, setPreBPSys] = useState('');
  const [preBPDia, setPreBPDia] = useState('');
  const [preTemp, setPreTemp] = useState('');
  const [prePulse, setPrePulse] = useState('');
  const [preRR, setPreRR] = useState('');

  // Observation form
  const [obsInterval, setObsInterval] = useState<TransfusionObservationInterval>('BEFORE');
  const [obsTime, setObsTime] = useState('');
  const [obsBPSys, setObsBPSys] = useState('');
  const [obsBPDia, setObsBPDia] = useState('');
  const [obsTemp, setObsTemp] = useState('');
  const [obsPulse, setObsPulse] = useState('');
  const [obsRR, setObsRR] = useState('');
  const [obsRemarks, setObsRemarks] = useState('');

  // Reaction form
  const [selectedReactions, setSelectedReactions] = useState<Set<string>>(new Set());
  const [otherReaction, setOtherReaction] = useState('');
  const [actionTaken, setActionTaken] = useState('');

  const transfusions = data?.results ?? [];

  const preVitalsValid = !!(preBPSys && preBPDia && preTemp && prePulse);

  const handleCreateTransfusion = async () => {
    if (!unitNumber.trim() || !amountMl) {
      toast({ title: 'Validation Error', description: 'Unit number and amount are required', variant: 'destructive' });
      return;
    }
    if (!preVitalsValid) {
      toast({ title: 'Validation Error', description: 'Pre-transfusion baseline vitals (BP, temp, pulse) are required', variant: 'destructive' });
      return;
    }
    try {
      const transfusion = await createTransfusion.mutateAsync({
        admission: admissionId,
        blood_product: bloodProduct,
        blood_product_other: bloodProduct === 'OTHER' ? bloodProductOther : '',
        blood_unit_number: unitNumber.trim(),
        blood_group: bloodGroup || undefined,
        amount_ml: parseInt(amountMl),
        transfusion_date: new Date().toISOString().split('T')[0] as string,
        diagnosis: diagnosis || undefined,
      });

      // Record mandatory pre-transfusion baseline vitals as a BEFORE observation
      if (transfusion?.id) {
        try {
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          await addObservation.mutateAsync({
            transfusionId: transfusion.id,
            data: {
              observation_interval: 'BEFORE' as TransfusionObservationInterval,
              exact_time: timeStr,
              blood_pressure: preBPSys && preBPDia ? `${preBPSys}/${preBPDia}` : undefined,
              temperature: preTemp ? parseFloat(preTemp) : undefined,
              pulse: prePulse ? parseInt(prePulse) : undefined,
              respiratory_rate: preRR ? parseInt(preRR) : undefined,
            },
          });
        } catch {
          // Vitals are mandatory — alert prominently so nurse records them immediately
          toast({ title: 'Baseline vitals not saved', description: 'Transfusion was started but the pre-transfusion vitals failed to save. Record them now via "Add Observation" → Before Transfusion.', variant: 'destructive' });
        }
      }

      toast({ title: 'Transfusion record created' });
      setNewTransfusionOpen(false);
      resetTransfusionForm();
    } catch {
      toast({ title: 'Error', description: 'Failed to create transfusion record', variant: 'destructive' });
    }
  };

  const handleAddObservation = async () => {
    if (!selectedTransfusionId || !obsTime) {
      toast({ title: 'Validation Error', description: 'Time is required', variant: 'destructive' });
      return;
    }
    try {
      await addObservation.mutateAsync({
        transfusionId: selectedTransfusionId,
        data: {
          observation_interval: obsInterval,
          exact_time: obsTime,
          blood_pressure: obsBPSys && obsBPDia ? `${obsBPSys}/${obsBPDia}` : undefined,
          temperature: obsTemp ? parseFloat(obsTemp) : undefined,
          pulse: obsPulse ? parseInt(obsPulse) : undefined,
          respiratory_rate: obsRR ? parseInt(obsRR) : undefined,
          remarks: obsRemarks || undefined,
        },
      });
      toast({ title: 'Observation recorded' });
      setObservationOpen(false);
      resetObservationForm();
    } catch {
      toast({ title: 'Error', description: 'Failed to record observation', variant: 'destructive' });
    }
  };

  const handleMarkReaction = async () => {
    if (!selectedTransfusionId || (selectedReactions.size === 0 && !otherReaction.trim())) {
      toast({ title: 'Validation Error', description: 'Select at least one reaction type', variant: 'destructive' });
      return;
    }
    // Build a structured reaction_type string from selected checkboxes
    const allOptions = REACTION_CATEGORIES.flatMap((c) => [...c.options]);
    const labels = allOptions
      .filter((o: { value: string; label: string }) => selectedReactions.has(o.value))
      .map((o: { value: string; label: string }) => o.label);
    if (otherReaction.trim()) {
      labels.push(`Other: ${otherReaction.trim()}`);
    }
    const reactionType = labels.join(', ');

    try {
      await markReaction.mutateAsync({
        transfusionId: selectedTransfusionId,
        data: { reaction_type: reactionType, action_taken: actionTaken || undefined },
      });
      toast({ title: 'Reaction recorded', description: 'Transfusion has been stopped', variant: 'destructive' });
      setReactionOpen(false);
      setSelectedReactions(new Set());
      setOtherReaction('');
      setActionTaken('');
    } catch {
      toast({ title: 'Error', description: 'Failed to record reaction', variant: 'destructive' });
    }
  };

  const handleComplete = async (transfusionId: number) => {
    try {
      await completeTransfusion.mutateAsync({ transfusionId });
      toast({ title: 'Transfusion marked as completed' });
    } catch {
      toast({ title: 'Error', description: 'Failed to complete transfusion', variant: 'destructive' });
    }
  };

  const resetTransfusionForm = () => {
    setBloodProduct('PACKED_RED_CELLS');
    setBloodProductOther('');
    setUnitNumber('');
    setBloodGroup('');
    setAmountMl('');
    setDiagnosis('');
    setPreBPSys('');
    setPreBPDia('');
    setPreTemp('');
    setPrePulse('');
    setPreRR('');
  };

  const resetObservationForm = () => {
    setObsInterval('BEFORE');
    setObsTime('');
    setObsBPSys('');
    setObsBPDia('');
    setObsTemp('');
    setObsPulse('');
    setObsRR('');
    setObsRemarks('');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'IN_PROGRESS': return 'warning';
      case 'COMPLETED': return 'success';
      case 'STOPPED': return 'destructive';
      case 'CANCELLED': return 'secondary';
      default: return 'secondary' as const;
    }
  };

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Blood Transfusion Chart</h3>
          <HelpPopover content="Track blood transfusions with periodic vital sign monitoring. Record observations before, during, and after transfusion as per the Kenya hospital blood transfusion observation form." />
        </div>
        {isActive && (
          <Dialog open={newTransfusionOpen} onOpenChange={setNewTransfusionOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-1.5" />
                New Transfusion
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Start Blood Transfusion</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Blood Product *</Label>
                  <Select value={bloodProduct} onValueChange={(v) => setBloodProduct(v as BloodProduct)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BLOOD_PRODUCTS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {bloodProduct === 'OTHER' && (
                  <div className="space-y-2">
                    <Label>Specify Product</Label>
                    <Input value={bloodProductOther} onChange={(e) => setBloodProductOther(e.target.value)} placeholder="Other blood product" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Unit/Bag Number *</Label>
                    <Input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} placeholder="BU-12345" />
                  </div>
                  <div className="space-y-2">
                    <Label>Blood Group</Label>
                    <Input value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} placeholder="A+" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Amount (mL) *</Label>
                  <Input type="number" min="1" value={amountMl} onChange={(e) => setAmountMl(e.target.value)} placeholder="450" />
                </div>
                <div className="space-y-2">
                  <Label>Diagnosis/Indication</Label>
                  <Textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Indication for transfusion" rows={2} />
                </div>

                <Separator />

                <div className="space-y-3">
                  <p className="text-sm font-medium">Pre-Transfusion Baseline Vitals</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">BP (mmHg) *</Label>
                      <div className="flex items-center gap-1">
                        <Input type="number" placeholder={getVitalPlaceholder('blood_pressure_systolic', ageGroup)} value={preBPSys} onChange={(e) => setPreBPSys(e.target.value)} className="w-20" aria-label="Systolic BP" />
                        <span className="text-muted-foreground">/</span>
                        <Input type="number" placeholder={getVitalPlaceholder('blood_pressure_diastolic', ageGroup)} value={preBPDia} onChange={(e) => setPreBPDia(e.target.value)} className="w-20" aria-label="Diastolic BP" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Temp (°C) *</Label>
                      <Input type="number" step="0.1" placeholder={getVitalPlaceholder('temperature', ageGroup)} value={preTemp} onChange={(e) => setPreTemp(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Pulse *</Label>
                      <Input type="number" placeholder={getVitalPlaceholder('pulse', ageGroup)} value={prePulse} onChange={(e) => setPrePulse(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Resp Rate</Label>
                      <Input type="number" placeholder={getVitalPlaceholder('respiratory_rate', ageGroup)} value={preRR} onChange={(e) => setPreRR(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
                <Button variant="outline" onClick={() => setNewTransfusionOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateTransfusion} disabled={createTransfusion.isPending || !unitNumber || !amountMl || !preVitalsValid}>
                  {createTransfusion.isPending ? 'Creating...' : 'Start Transfusion'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {transfusions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Droplets className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No blood transfusions recorded.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {transfusions.map((transfusion) => (
            <TransfusionCard
              key={transfusion.id}
              transfusion={transfusion}
              isActive={isActive}
              statusColor={getStatusColor(transfusion.status)}
              atrReport={atrByTransfusion.get(transfusion.id)}
              onAddObservation={() => {
                setSelectedTransfusionId(transfusion.id);
                resetObservationForm();
                setObservationOpen(true);
              }}
              onReportReaction={() => {
                setSelectedTransfusionId(transfusion.id);
                setSelectedReactions(new Set());
                setOtherReaction('');
                setActionTaken('');
                setReactionOpen(true);
              }}
              onComplete={() => handleComplete(transfusion.id)}
            />
          ))}
        </div>
      )}

      {/* Add Observation Dialog */}
      <Dialog open={observationOpen} onOpenChange={setObservationOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Observation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Interval *</Label>
                <Select value={obsInterval} onValueChange={(v) => setObsInterval(v as TransfusionObservationInterval)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OBSERVATION_INTERVALS.map((i) => (
                      <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Exact Time *</Label>
                <Input type="time" value={obsTime} onChange={(e) => setObsTime(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>BP (mmHg)</Label>
                <div className="flex items-center gap-1">
                  <Input type="number" placeholder={getVitalPlaceholder('blood_pressure_systolic', ageGroup)} value={obsBPSys} onChange={(e) => setObsBPSys(e.target.value)} className="w-20" aria-label="Systolic blood pressure" />
                  <span className="text-muted-foreground">/</span>
                  <Input type="number" placeholder={getVitalPlaceholder('blood_pressure_diastolic', ageGroup)} value={obsBPDia} onChange={(e) => setObsBPDia(e.target.value)} className="w-20" aria-label="Diastolic blood pressure" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Temp (°C)</Label>
                <Input type="number" step="0.1" placeholder={getVitalPlaceholder('temperature', ageGroup)} value={obsTemp} onChange={(e) => setObsTemp(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Pulse</Label>
                <Input type="number" placeholder={getVitalPlaceholder('pulse', ageGroup)} value={obsPulse} onChange={(e) => setObsPulse(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Resp Rate</Label>
                <Input type="number" placeholder={getVitalPlaceholder('respiratory_rate', ageGroup)} value={obsRR} onChange={(e) => setObsRR(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea value={obsRemarks} onChange={(e) => setObsRemarks(e.target.value)} placeholder="Observations, symptoms..." rows={2} />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
            <Button variant="outline" onClick={() => setObservationOpen(false)}>Cancel</Button>
            <Button onClick={handleAddObservation} disabled={addObservation.isPending || !obsTime}>
              {addObservation.isPending ? 'Saving...' : 'Save Observation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reaction Dialog */}
      <Dialog open={reactionOpen} onOpenChange={setReactionOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-destructive">Report Transfusion Reaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-destructive/10 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              This will stop the transfusion immediately.
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Type of Reaction *</Label>
              {REACTION_CATEGORIES.map((category) => (
                <div key={category.label} className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{category.label}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {category.options.map((option) => (
                      <label
                        key={option.value}
                        className={`flex items-center gap-2.5 rounded-md border p-2.5 cursor-pointer transition-colors text-sm ${
                          selectedReactions.has(option.value)
                            ? 'border-destructive/50 bg-destructive/5'
                            : 'border-border hover:bg-muted/50'
                        }`}
                      >
                        <Checkbox
                          checked={selectedReactions.has(option.value)}
                          onCheckedChange={(checked) => {
                            setSelectedReactions((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(option.value);
                              else next.delete(option.value);
                              return next;
                            });
                          }}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">6. Others (Specify)</p>
                <Input
                  value={otherReaction}
                  onChange={(e) => setOtherReaction(e.target.value)}
                  placeholder="Other reaction type..."
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Action Taken</Label>
              <Textarea value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} placeholder="Actions taken in response to the reaction" rows={2} />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
            <Button variant="outline" onClick={() => setReactionOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleMarkReaction} disabled={markReaction.isPending || (selectedReactions.size === 0 && !otherReaction.trim())}>
              {markReaction.isPending ? 'Recording...' : 'Stop & Record Reaction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================================
// Transfusion Card Sub-component
// =============================================================================

function TransfusionCard({
  transfusion,
  isActive,
  statusColor,
  atrReport,
  onAddObservation,
  onReportReaction,
  onComplete,
}: {
  transfusion: BloodTransfusion;
  isActive: boolean;
  statusColor: string;
  atrReport?: AdverseTransfusionReaction;
  onAddObservation: () => void;
  onReportReaction: () => void;
  onComplete: () => void;
}) {
  const observations = transfusion.observations ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">
              {transfusion.blood_product_display || transfusion.blood_product}
              {transfusion.blood_product_other ? ` (${transfusion.blood_product_other})` : ''}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Unit: {transfusion.blood_unit_number}
              {transfusion.blood_group && ` • Group: ${transfusion.blood_group}`}
              {' • '}{transfusion.amount_ml}mL
              {' • '}{formatDate(transfusion.transfusion_date)}
            </p>
            {transfusion.diagnosis && (
              <p className="text-sm text-muted-foreground">
                Indication: {transfusion.diagnosis}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusColor as 'warning' | 'success' | 'destructive' | 'secondary'}>
              {transfusion.status_display || transfusion.status}
            </Badge>
            {transfusion.reaction_occurred && (
              <Badge variant="destructive">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Reaction
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Observation table */}
        {observations.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-[500px] w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2 font-medium">Interval</th>
                  <th className="p-2 font-medium">Time</th>
                  <th className="p-2 font-medium">BP</th>
                  <th className="p-2 font-medium">Temp</th>
                  <th className="p-2 font-medium">Pulse</th>
                  <th className="p-2 font-medium">RR</th>
                  <th className="p-2 font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {observations.map((obs) => (
                  <tr key={obs.id} className="border-b last:border-0">
                    <td className="p-2 font-medium whitespace-nowrap">{obs.observation_interval_display || obs.observation_interval}</td>
                    <td className="p-2 whitespace-nowrap">{obs.exact_time}</td>
                    <td className="p-2">{obs.blood_pressure || '—'}</td>
                    <td className="p-2">{obs.temperature ? `${Number(obs.temperature).toFixed(1)}°C` : '—'}</td>
                    <td className="p-2">{obs.pulse ?? '—'}</td>
                    <td className="p-2">{obs.respiratory_rate ?? '—'}</td>
                    <td className="p-2 text-muted-foreground max-w-[200px] truncate">{obs.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Reaction info */}
        {transfusion.reaction_occurred && (
          <div className="p-3 rounded-lg bg-destructive/10 space-y-2">
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">Transfusion Reaction</p>
              <p className="text-sm">Type: {transfusion.reaction_type}</p>
              {transfusion.reaction_action_taken && (
                <p className="text-sm">Action: {transfusion.reaction_action_taken}</p>
              )}
            </div>
            {/* ATR Report link */}
            <div className="pt-1">
              {atrReport ? (
                <Link
                  href={`/inpatient/adverse-transfusion-reaction/${atrReport.id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <FileText className="h-3.5 w-3.5" />
                  View ATR Report
                  <Badge variant="outline" className="ml-1 text-xs">
                    {atrReport.status_display || atrReport.status}
                  </Badge>
                </Link>
              ) : (
                <Link
                  href={buildATRQueryParams(transfusion.id, transfusion.reaction_type || '')}
                  className="inline-flex items-center gap-1.5"
                >
                  <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10">
                    <FileText className="h-3.5 w-3.5 mr-1" />
                    Complete PPB ATR Form
                  </Button>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        {isActive && transfusion.status === 'IN_PROGRESS' && (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button size="sm" variant="outline" onClick={onAddObservation}>
              <Plus className="h-4 w-4 mr-1" />
              Add Observation
            </Button>
            <Button size="sm" variant="destructive" onClick={onReportReaction}>
              <AlertTriangle className="h-4 w-4 mr-1" />
              Report Reaction
            </Button>
            <Button size="sm" variant="default" onClick={onComplete}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Complete
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
