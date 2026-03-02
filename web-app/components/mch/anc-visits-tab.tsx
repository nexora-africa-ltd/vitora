'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Calendar, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';
import { ancVisitsApi } from '@/lib/api/mch';
import type { ANCVisitCreateData, FetalPresentation, UrineResult } from '@/lib/types/mch';

interface ANCVisitsTabProps {
  registrationId: number;
}

const PRESENTATION_OPTIONS: { value: FetalPresentation; label: string }[] = [
  { value: '', label: 'Not recorded' },
  { value: 'CEPHALIC', label: 'Cephalic' },
  { value: 'BREECH', label: 'Breech' },
  { value: 'TRANSVERSE', label: 'Transverse' },
  { value: 'OBLIQUE', label: 'Oblique' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

const URINE_OPTIONS: { value: UrineResult; label: string }[] = [
  { value: '', label: 'Not tested' },
  { value: 'NEGATIVE', label: 'Negative' },
  { value: 'TRACE', label: 'Trace' },
  { value: '1+', label: '1+' },
  { value: '2+', label: '2+' },
  { value: '3+', label: '3+' },
  { value: '4+', label: '4+' },
];

export function ANCVisitsTab({ registrationId }: ANCVisitsTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['anc-visits', registrationId],
    queryFn: () => ancVisitsApi.list(registrationId),
  });

  const visits = data?.results || [];

  // Form state
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [weight, setWeight] = useState('');
  const [bloodPressure, setBloodPressure] = useState('');
  const [fundalHeight, setFundalHeight] = useState('');
  const [fetalHeartRate, setFetalHeartRate] = useState('');
  const [presentation, setPresentation] = useState<FetalPresentation>('');
  const [fetalMovements, setFetalMovements] = useState<boolean | null>(null);
  const [urineProtein, setUrineProtein] = useState<UrineResult>('');
  const [urineGlucose, setUrineGlucose] = useState<UrineResult>('');
  const [hbLevel, setHbLevel] = useState('');
  const [ironFolateGiven, setIronFolateGiven] = useState(false);
  const [calciumGiven, setCalciumGiven] = useState(false);
  const [dewormingGiven, setDewormingGiven] = useState(false);
  const [tetanusDose, setTetanusDose] = useState('');
  const [hivTestDone, setHivTestDone] = useState(false);
  const [syphilisTestDone, setSyphilisTestDone] = useState(false);
  const [nextVisitDate, setNextVisitDate] = useState('');
  const [notes, setNotes] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: ANCVisitCreateData) => ancVisitsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anc-visits', registrationId] });
      queryClient.invalidateQueries({ queryKey: ['mch-registration', registrationId] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast({
        title: 'ANC Visit Recorded',
        description: nextVisitDate
          ? 'Visit recorded. A follow-up appointment has been scheduled.'
          : undefined,
      });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to record ANC visit.',
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setVisitDate(new Date().toISOString().split('T')[0]);
    setWeight('');
    setBloodPressure('');
    setFundalHeight('');
    setFetalHeartRate('');
    setPresentation('');
    setFetalMovements(null);
    setUrineProtein('');
    setUrineGlucose('');
    setHbLevel('');
    setIronFolateGiven(false);
    setCalciumGiven(false);
    setDewormingGiven(false);
    setTetanusDose('');
    setHivTestDone(false);
    setSyphilisTestDone(false);
    setNextVisitDate('');
    setNotes('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      registration: registrationId,
      visit_date: visitDate,
      weight: weight ? parseFloat(weight) : undefined,
      blood_pressure: bloodPressure,
      fundal_height: fundalHeight ? parseFloat(fundalHeight) : undefined,
      fetal_heart_rate: fetalHeartRate ? parseInt(fetalHeartRate) : undefined,
      presentation,
      fetal_movements: fetalMovements ?? undefined,
      urine_protein: urineProtein,
      urine_glucose: urineGlucose,
      hb_level: hbLevel ? parseFloat(hbLevel) : undefined,
      iron_folate_given: ironFolateGiven,
      calcium_given: calciumGiven,
      deworming_given: dewormingGiven,
      tetanus_toxoid_dose: tetanusDose ? parseInt(tetanusDose) : undefined,
      hiv_test_done: hivTestDone,
      syphilis_test_done: syphilisTestDone,
      next_visit_date: nextVisitDate || undefined,
      notes,
    });
  };

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (error) {
    return <div className="text-destructive">Failed to load ANC visits.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">ANC Visits</h3>
          <HelpPopover content="Antenatal care visits track maternal health throughout pregnancy. WHO recommends 8+ contacts." />
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Record Visit
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Record ANC Visit</DialogTitle>
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
                  <Label>Weight (kg)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="e.g., 65.5"
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
                  <Label>Fundal Height (cm)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={fundalHeight}
                    onChange={(e) => setFundalHeight(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fetal Heart Rate (BPM)</Label>
                  <Input
                    type="number"
                    value={fetalHeartRate}
                    onChange={(e) => setFetalHeartRate(e.target.value)}
                    placeholder="110-160 normal"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Presentation</Label>
                  <Select value={presentation} onValueChange={(v) => setPresentation(v as FetalPresentation)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {PRESENTATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Urine Protein</Label>
                  <Select value={urineProtein} onValueChange={(v) => setUrineProtein(v as UrineResult)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {URINE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Urine Glucose</Label>
                  <Select value={urineGlucose} onValueChange={(v) => setUrineGlucose(v as UrineResult)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {URINE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Hb Level (g/dL)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={hbLevel}
                    onChange={(e) => setHbLevel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Next Visit Date</Label>
                  <Input
                    type="date"
                    value={nextVisitDate}
                    onChange={(e) => setNextVisitDate(e.target.value)}
                  />
                  {nextVisitDate && (
                    <p className="text-xs text-blue-600">
                      A scheduling appointment will be auto-created for this date.
                    </p>
                  )}
                </div>
              </div>

              {/* Supplements & Tests */}
              <div className="grid gap-3 md:grid-cols-3">
                <div className="flex items-center gap-2">
                  <Switch checked={ironFolateGiven} onCheckedChange={setIronFolateGiven} />
                  <Label>Iron/Folate</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={calciumGiven} onCheckedChange={setCalciumGiven} />
                  <Label>Calcium</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={dewormingGiven} onCheckedChange={setDewormingGiven} />
                  <Label>Deworming</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={hivTestDone} onCheckedChange={setHivTestDone} />
                  <Label>HIV Test</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={syphilisTestDone} onCheckedChange={setSyphilisTestDone} />
                  <Label>Syphilis Test</Label>
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
            No ANC visits recorded yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visits.map((visit) => (
            <Card key={visit.id}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-base">
                    Visit #{visit.visit_number}
                  </CardTitle>
                  <Badge variant="outline">
                    {visit.gestation_weeks ? `${visit.gestation_weeks} wks` : 'N/A'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatDate(visit.visit_date)}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {visit.weight && (
                    <div>
                      <span className="text-muted-foreground">Weight:</span> {visit.weight} kg
                    </div>
                  )}
                  {visit.blood_pressure && (
                    <div>
                      <span className="text-muted-foreground">BP:</span> {visit.blood_pressure}
                    </div>
                  )}
                  {visit.fetal_heart_rate && (
                    <div>
                      <span className="text-muted-foreground">FHR:</span> {visit.fetal_heart_rate} BPM
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
                {visit.next_visit_date && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-blue-600">
                    <Calendar className="h-3 w-3" />
                    Next visit: {formatDate(visit.next_visit_date)}
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
