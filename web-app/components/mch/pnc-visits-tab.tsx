'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Heart, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HelpPopover } from '@/components/shared/help-popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';
import { pncVisitsApi } from '@/lib/api/mch';
import type {
  PNCVisitCreateData,
  UterineInvolution,
  LochiaStatus,
  BreastCondition,
  MoodAssessment,
  CordStatus,
  BreastfeedingStatus,
  ContraceptiveMethod,
} from '@/lib/types/mch';

interface PNCVisitsTabProps {
  registrationId: number;
  isDelivered?: boolean;
  clinicVisitId?: number | null;
  encounterId?: number | null;
}

const UTERINE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Not recorded' },
  { value: 'Well contracted', label: 'Well Contracted' },
  { value: 'Subinvolution', label: 'Subinvolution' },
  { value: 'Normal', label: 'Normal' },
];

const LOCHIA_OPTIONS: { value: LochiaStatus; label: string }[] = [
  { value: '', label: 'Not recorded' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'FOUL_SMELLING', label: 'Foul Smelling' },
  { value: 'HEAVY', label: 'Heavy' },
  { value: 'ABSENT', label: 'Absent' },
];

const BREAST_OPTIONS: { value: BreastCondition; label: string }[] = [
  { value: '', label: 'Not recorded' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'ENGORGED', label: 'Engorged' },
  { value: 'MASTITIS', label: 'Mastitis' },
  { value: 'CRACKED_NIPPLES', label: 'Cracked Nipples' },
  { value: 'ABSCESS', label: 'Abscess' },
];

const MOOD_OPTIONS: { value: MoodAssessment; label: string }[] = [
  { value: '', label: 'Not assessed' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'MILDLY_LOW', label: 'Mildly Low Mood' },
  { value: 'DEPRESSED', label: 'Possibly Depressed' },
  { value: 'SEVERELY_DEPRESSED', label: 'Severely Depressed' },
];

const CORD_OPTIONS: { value: CordStatus; label: string }[] = [
  { value: '', label: 'Not recorded' },
  { value: 'CLEAN', label: 'Clean' },
  { value: 'INFECTED', label: 'Infected' },
  { value: 'SEPARATED', label: 'Separated' },
];

const FEEDING_OPTIONS: { value: BreastfeedingStatus; label: string }[] = [
  { value: '', label: 'Not recorded' },
  { value: 'EXCLUSIVE', label: 'Exclusive Breastfeeding' },
  { value: 'MIXED', label: 'Mixed Feeding' },
  { value: 'FORMULA', label: 'Formula Only' },
  { value: 'NOT_FEEDING', label: 'Not Feeding' },
];

const CONTRACEPTIVE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'IMPLANT', label: 'Implant' },
  { value: 'IUCD', label: 'IUCD' },
  { value: 'INJECTION', label: 'Injectable' },
  { value: 'PILLS', label: 'Pills' },
  { value: 'CONDOM', label: 'Condom' },
  { value: 'BTL', label: 'BTL' },
  { value: 'VASECTOMY', label: 'Vasectomy' },
  { value: 'LAM', label: 'LAM' },
  { value: 'NONE', label: 'Declined' },
];

export function PNCVisitsTab({
  registrationId,
  isDelivered = false,
  clinicVisitId = null,
  encounterId = null,
}: PNCVisitsTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['pnc-visits', registrationId],
    queryFn: () => pncVisitsApi.list(registrationId),
  });

  const visits = data?.results || [];

  // Form state
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [bloodPressure, setBloodPressure] = useState('');
  const [temperature, setTemperature] = useState('');
  const [uterineInvolution, setUterineInvolution] = useState<UterineInvolution>('');
  const [lochia, setLochia] = useState<LochiaStatus>('');
  const [breastCondition, setBreastCondition] = useState<BreastCondition>('');
  const [moodAssessment, setMoodAssessment] = useState<MoodAssessment>('');
  const [babyWeight, setBabyWeight] = useState('');
  const [babyTemperature, setBabyTemperature] = useState('');
  const [cordStatus, setCordStatus] = useState<CordStatus>('');
  const [breastfeedingStatus, setBreastfeedingStatus] = useState<BreastfeedingStatus>('');
  const [familyPlanningCounselling, setFamilyPlanningCounselling] = useState(false);
  const [contraceptiveGiven, setContraceptiveGiven] = useState<ContraceptiveMethod>('');
  const [notes, setNotes] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: PNCVisitCreateData) => pncVisitsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pnc-visits', registrationId] });
      queryClient.invalidateQueries({ queryKey: ['mch-registration', registrationId] });
      toast({ title: 'PNC Visit Recorded' });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to record PNC visit.',
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setVisitDate(new Date().toISOString().split('T')[0]);
    setBloodPressure('');
    setTemperature('');
    setUterineInvolution('');
    setLochia('');
    setBreastCondition('');
    setMoodAssessment('');
    setBabyWeight('');
    setBabyTemperature('');
    setCordStatus('');
    setBreastfeedingStatus('');
    setFamilyPlanningCounselling(false);
    setContraceptiveGiven('');
    setNotes('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      registration: registrationId,
      encounter: encounterId ?? undefined,
      clinic_visit: clinicVisitId ?? undefined,
      visit_date: visitDate,
      blood_pressure: bloodPressure,
      temperature: temperature ? parseFloat(temperature) : undefined,
      uterine_involution: uterineInvolution,
      lochia,
      breast_condition: breastCondition,
      mood_assessment: moodAssessment,
      baby_weight: babyWeight ? parseFloat(babyWeight) : undefined,
      baby_temperature: babyTemperature ? parseFloat(babyTemperature) : undefined,
      cord_status: cordStatus,
      breastfeeding_status: breastfeedingStatus,
      family_planning_counselling: familyPlanningCounselling,
      contraceptive_given: contraceptiveGiven,
      notes,
    });
  };

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (error) {
    return <div className="text-destructive">Failed to load PNC visits.</div>;
  }

  return (
    <div className="space-y-4">
      {clinicVisitId ? (
        <Card className="border-sky-200 bg-sky-50/70">
          <CardContent className="py-3 text-sm text-sky-900">
            This PNC form is linked to clinic visit #{clinicVisitId}
            {encounterId ? ` and encounter #${encounterId}` : ''}.
          </CardContent>
        </Card>
      ) : null}

      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">PNC Visits</h3>
          <HelpPopover content="Postnatal care visits monitor mother and baby health in the first 6 weeks after delivery. Kenya recommends visits at 6 hours, 6 days, 2 weeks, and 6 weeks." />
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          {!isDelivered ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button size="sm" className="gap-2" disabled>
                      <Plus className="h-4 w-4" />
                      Record Visit
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>PNC visits cannot be recorded before delivery</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Button size="sm" className="gap-2" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Record Visit
            </Button>
          )}
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Record PNC Visit</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Visit Date</Label>
                  <Input
                    type="date"
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Blood Pressure</Label>
                  <Input
                    value={bloodPressure}
                    onChange={(e) => setBloodPressure(e.target.value)}
                    placeholder="e.g., 120/80"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Temperature (°C)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Uterine Involution</Label>
                  <Select value={uterineInvolution} onValueChange={(v) => setUterineInvolution(v as UterineInvolution)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {UTERINE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Lochia</Label>
                  <Select value={lochia} onValueChange={(v) => setLochia(v as LochiaStatus)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCHIA_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Breast Condition</Label>
                  <Select value={breastCondition} onValueChange={(v) => setBreastCondition(v as BreastCondition)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {BREAST_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Mood Assessment</Label>
                  <Select value={moodAssessment} onValueChange={(v) => setMoodAssessment(v as MoodAssessment)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {MOOD_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Baby Assessment */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Baby Assessment</h4>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Baby Weight (kg)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={babyWeight}
                      onChange={(e) => setBabyWeight(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Baby Temperature (°C)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={babyTemperature}
                      onChange={(e) => setBabyTemperature(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cord Status</Label>
                    <Select value={cordStatus} onValueChange={(v) => setCordStatus(v as CordStatus)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {CORD_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Breastfeeding Status</Label>
                    <Select value={breastfeedingStatus} onValueChange={(v) => setBreastfeedingStatus(v as BreastfeedingStatus)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {FEEDING_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Family Planning */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Family Planning</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={familyPlanningCounselling}
                      onCheckedChange={setFamilyPlanningCounselling}
                    />
                    <Label>Family Planning Counselling Done</Label>
                  </div>
                  <div className="space-y-2">
                    <Label>Contraceptive Method</Label>
                    <Select value={contraceptiveGiven} onValueChange={(v) => setContraceptiveGiven(v as ContraceptiveMethod)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTRACEPTIVE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Record Visit
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {visits.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No PNC visits recorded yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visits.map((visit) => (
            <Card key={visit.id}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Heart className="h-4 w-4" />
                    Visit #{visit.visit_number}
                  </CardTitle>
                  <Badge variant="outline">
                    Day {visit.days_postpartum}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatDate(visit.visit_date)}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm">
                  {visit.breastfeeding_status && (
                    <div>
                      <span className="text-muted-foreground">Feeding:</span>{' '}
                      {visit.breastfeeding_status.replace(/_/g, ' ')}
                    </div>
                  )}
                </div>
                {visit.alerts.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {visit.alerts.map((alert, i) => (
                      <Badge key={i} variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {alert}
                      </Badge>
                    ))}
                  </div>
                )}
                {visit.clinic_visit && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Linked clinic visit #{visit.clinic_visit}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
