'use client';

import { useState } from 'react';
import { Plus, Droplets, AlertTriangle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { HelpPopover } from '@/components/shared/help-popover';
import {
  useBloodTransfusions,
  useCreateBloodTransfusion,
  useAddTransfusionObservation,
  useMarkTransfusionReaction,
  useCompleteTransfusion,
} from '@/lib/hooks/use-inpatient';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import type {
  BloodProduct,
  BloodTransfusion,
  TransfusionObservationInterval,
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

interface BloodTransfusionChartProps {
  admissionId: number;
  isActive: boolean;
}

export function BloodTransfusionChart({ admissionId, isActive }: BloodTransfusionChartProps) {
  const { toast } = useToast();
  const { data, isLoading } = useBloodTransfusions(admissionId);
  const createTransfusion = useCreateBloodTransfusion();
  const addObservation = useAddTransfusionObservation();
  const markReaction = useMarkTransfusionReaction();
  const completeTransfusion = useCompleteTransfusion();

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

  // Observation form
  const [obsInterval, setObsInterval] = useState<TransfusionObservationInterval>('BEFORE');
  const [obsTime, setObsTime] = useState('');
  const [obsBP, setObsBP] = useState('');
  const [obsTemp, setObsTemp] = useState('');
  const [obsPulse, setObsPulse] = useState('');
  const [obsRR, setObsRR] = useState('');
  const [obsRemarks, setObsRemarks] = useState('');

  // Reaction form
  const [reactionType, setReactionType] = useState('');
  const [actionTaken, setActionTaken] = useState('');

  const transfusions = data?.results ?? [];

  const handleCreateTransfusion = async () => {
    if (!unitNumber.trim() || !amountMl) {
      toast({ title: 'Validation Error', description: 'Unit number and amount are required', variant: 'destructive' });
      return;
    }
    try {
      await createTransfusion.mutateAsync({
        admission: admissionId,
        blood_product: bloodProduct,
        blood_product_other: bloodProduct === 'OTHER' ? bloodProductOther : '',
        blood_unit_number: unitNumber.trim(),
        blood_group: bloodGroup || undefined,
        amount_ml: parseInt(amountMl),
        transfusion_date: new Date().toISOString().split('T')[0] as string,
        diagnosis: diagnosis || undefined,
      });
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
          blood_pressure: obsBP || undefined,
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
    if (!selectedTransfusionId || !reactionType.trim()) {
      toast({ title: 'Validation Error', description: 'Reaction type is required', variant: 'destructive' });
      return;
    }
    try {
      await markReaction.mutateAsync({
        transfusionId: selectedTransfusionId,
        data: { reaction_type: reactionType.trim(), action_taken: actionTaken || undefined },
      });
      toast({ title: 'Reaction recorded', description: 'Transfusion has been stopped', variant: 'destructive' });
      setReactionOpen(false);
      setReactionType('');
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
  };

  const resetObservationForm = () => {
    setObsInterval('BEFORE');
    setObsTime('');
    setObsBP('');
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
              </div>
              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
                <Button variant="outline" onClick={() => setNewTransfusionOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateTransfusion} disabled={createTransfusion.isPending || !unitNumber || !amountMl}>
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
              onAddObservation={() => {
                setSelectedTransfusionId(transfusion.id);
                resetObservationForm();
                setObservationOpen(true);
              }}
              onReportReaction={() => {
                setSelectedTransfusionId(transfusion.id);
                setReactionType('');
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
                <Label>BP</Label>
                <Input placeholder="120/80" value={obsBP} onChange={(e) => setObsBP(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Temp (°C)</Label>
                <Input type="number" step="0.1" placeholder="36.5" value={obsTemp} onChange={(e) => setObsTemp(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Pulse</Label>
                <Input type="number" placeholder="72" value={obsPulse} onChange={(e) => setObsPulse(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Resp Rate</Label>
                <Input type="number" placeholder="16" value={obsRR} onChange={(e) => setObsRR(e.target.value)} />
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Report Transfusion Reaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-destructive/10 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              This will stop the transfusion immediately.
            </div>
            <div className="space-y-2">
              <Label>Type of Reaction *</Label>
              <Textarea value={reactionType} onChange={(e) => setReactionType(e.target.value)} placeholder="Describe the reaction (e.g., Febrile, Allergic, Hemolytic...)" rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Action Taken</Label>
              <Textarea value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} placeholder="Actions taken in response to the reaction" rows={2} />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
            <Button variant="outline" onClick={() => setReactionOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleMarkReaction} disabled={markReaction.isPending || !reactionType.trim()}>
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
  onAddObservation,
  onReportReaction,
  onComplete,
}: {
  transfusion: BloodTransfusion;
  isActive: boolean;
  statusColor: string;
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
          <div className="p-3 rounded-lg bg-destructive/10 space-y-1">
            <p className="text-sm font-medium text-destructive">Transfusion Reaction</p>
            <p className="text-sm">Type: {transfusion.reaction_type}</p>
            {transfusion.reaction_action_taken && (
              <p className="text-sm">Action: {transfusion.reaction_action_taken}</p>
            )}
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
