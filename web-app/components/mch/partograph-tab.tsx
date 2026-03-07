'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, Plus, Waves, HeartPulse, Baby, Loader2, Printer } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpPopover } from '@/components/shared/help-popover';
import { WebSocketStatus } from '@/components/ui/websocket-status';
import {
  useCreateLabourPartograph,
  useCreateLabourPartographObservation,
  useLabourPartographObservations,
  useLabourPartographs,
} from '@/lib/hooks/use-mch';
import { useLabourPartographSocket } from '@/lib/hooks/use-websocket';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';
import { printPartographReport } from '@/lib/documents';
import type {
  LiquorStatus,
  MCHRegistration,
  MembraneStatus,
  MouldingGrade,
  UrineResult,
} from '@/lib/types/mch';

interface PartographTabProps {
  registrationId: number;
  registration: MCHRegistration;
}

const membraneOptions: { value: MembraneStatus; label: string }[] = [
  { value: '', label: 'Not recorded' },
  { value: 'INTACT', label: 'Intact' },
  { value: 'RUPTURED', label: 'Ruptured' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

const liquorOptions: { value: LiquorStatus; label: string }[] = [
  { value: '', label: 'Not recorded' },
  { value: 'CLEAR', label: 'Clear' },
  { value: 'MECONIUM', label: 'Meconium stained' },
  { value: 'BLOOD_STAINED', label: 'Blood stained' },
  { value: 'OFFENSIVE', label: 'Offensive' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

const urineOptions: { value: UrineResult; label: string }[] = [
  { value: '', label: 'Not tested' },
  { value: 'NEGATIVE', label: 'Negative' },
  { value: 'TRACE', label: 'Trace' },
  { value: '1+', label: '1+' },
  { value: '2+', label: '2+' },
  { value: '3+', label: '3+' },
  { value: '4+', label: '4+' },
];

const mouldingOptions: { value: MouldingGrade; label: string }[] = [
  { value: '', label: 'Not recorded' },
  { value: '0', label: '0' },
  { value: '+', label: '+' },
  { value: '++', label: '++' },
  { value: '+++', label: '+++' },
];

export function PartographTab({ registrationId, registration }: PartographTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [observationDialogOpen, setObservationDialogOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const [parity, setParity] = useState('');
  const [gestationWeeks, setGestationWeeks] = useState('');
  const [membraneStatus, setMembraneStatus] = useState<MembraneStatus>('');
  const [liquor, setLiquor] = useState<LiquorStatus>('');
  const [partographNotes, setPartographNotes] = useState('');

  const [observationTime, setObservationTime] = useState(new Date().toISOString().slice(0, 16));
  const [fetalHeartRate, setFetalHeartRate] = useState('');
  const [cervicalDilation, setCervicalDilation] = useState('');
  const [descentFifths, setDescentFifths] = useState('');
  const [contractionsPer10Min, setContractionsPer10Min] = useState('');
  const [contractionDuration, setContractionDuration] = useState('');
  const [moulding, setMoulding] = useState<MouldingGrade>('');
  const [maternalPulse, setMaternalPulse] = useState('');
  const [maternalBloodPressure, setMaternalBloodPressure] = useState('');
  const [maternalTemperature, setMaternalTemperature] = useState('');
  const [urineVolume, setUrineVolume] = useState('');
  const [urineProtein, setUrineProtein] = useState<UrineResult>('');
  const [urineAcetone, setUrineAcetone] = useState<UrineResult>('');
  const [oxytocinDrops, setOxytocinDrops] = useState('');
  const [medications, setMedications] = useState('');
  const [observationNotes, setObservationNotes] = useState('');

  const { data, isLoading, error } = useLabourPartographs(registrationId);
  const partographs = data?.results ?? [];
  const activePartograph = partographs.find((item) => item.status === 'ACTIVE') ?? partographs[0] ?? null;

  const observationsQuery = useLabourPartographObservations(activePartograph?.id);
  const observations = observationsQuery.data?.results ?? [];

  const wsState = useLabourPartographSocket(activePartograph?.id ?? null, registrationId);
  const createPartograph = useCreateLabourPartograph();
  const createObservation = useCreateLabourPartographObservation();

  const latestObservation = observations.at(-1) ?? activePartograph?.latest_observation ?? null;
  const chartData = observations.map((observation) => ({
    time: formatDateTime(observation.observation_time),
    fetalHeartRate: observation.fetal_heart_rate,
    cervicalDilation: observation.cervical_dilation_cm ? Number(observation.cervical_dilation_cm) : null,
    contractions: observation.contractions_per_10_min,
    maternalPulse: observation.maternal_pulse,
  }));

  const resetPartographForm = () => {
    setParity('');
    setGestationWeeks('');
    setMembraneStatus('');
    setLiquor('');
    setPartographNotes('');
  };

  const resetObservationForm = () => {
    setObservationTime(new Date().toISOString().slice(0, 16));
    setFetalHeartRate('');
    setCervicalDilation('');
    setDescentFifths('');
    setContractionsPer10Min('');
    setContractionDuration('');
    setMoulding('');
    setMaternalPulse('');
    setMaternalBloodPressure('');
    setMaternalTemperature('');
    setUrineVolume('');
    setUrineProtein('');
    setUrineAcetone('');
    setOxytocinDrops('');
    setMedications('');
    setObservationNotes('');
  };

  const handleCreatePartograph = async () => {
    try {
      await createPartograph.mutateAsync({
        registration: registrationId,
        status: 'ACTIVE',
        parity: parity ? parseInt(parity) : undefined,
        gestation_weeks: gestationWeeks ? parseInt(gestationWeeks) : undefined,
        membrane_status: membraneStatus || undefined,
        liquor: liquor || undefined,
        notes: partographNotes || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['mch-registration', registrationId] });
      toast({ title: 'Partograph started' });
      setCreateDialogOpen(false);
      resetPartographForm();
    } catch {
      toast({ title: 'Error', description: 'Failed to start partograph.', variant: 'destructive' });
    }
  };

  const handleCreateObservation = async () => {
    if (!activePartograph) return;

    try {
      await createObservation.mutateAsync({
        partograph: activePartograph.id,
        observation_time: new Date(observationTime).toISOString(),
        fetal_heart_rate: fetalHeartRate ? parseInt(fetalHeartRate) : undefined,
        cervical_dilation_cm: cervicalDilation || undefined,
        descent_fifths: descentFifths ? parseInt(descentFifths) : undefined,
        contractions_per_10_min: contractionsPer10Min ? parseInt(contractionsPer10Min) : undefined,
        contraction_duration_seconds: contractionDuration ? parseInt(contractionDuration) : undefined,
        moulding: moulding || undefined,
        maternal_pulse: maternalPulse ? parseInt(maternalPulse) : undefined,
        maternal_blood_pressure: maternalBloodPressure || undefined,
        maternal_temperature: maternalTemperature ? parseFloat(maternalTemperature) : undefined,
        urine_volume_ml: urineVolume ? parseInt(urineVolume) : undefined,
        urine_protein: urineProtein || undefined,
        urine_acetone: urineAcetone || undefined,
        oxytocin_drops_per_min: oxytocinDrops ? parseInt(oxytocinDrops) : undefined,
        medications: medications || undefined,
        notes: observationNotes || undefined,
      });
      toast({ title: 'Observation recorded' });
      setObservationDialogOpen(false);
      resetObservationForm();
    } catch {
      toast({ title: 'Error', description: 'Failed to record observation.', variant: 'destructive' });
    }
  };

  const handlePrint = async () => {
    if (!activePartograph) return;

    setIsPrinting(true);
    try {
      await printPartographReport({
        registration,
        partograph: activePartograph,
        observations,
      });
    } finally {
      setIsPrinting(false);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-80 w-full" />;
  }

  if (error) {
    return <div className="text-destructive">Failed to load labour partograph.</div>;
  }

  if (!activePartograph) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-4">
          <Waves className="h-12 w-12 mx-auto text-muted-foreground" />
          <div className="space-y-1">
            <p className="font-medium">No labour partograph started</p>
            <p className="text-sm text-muted-foreground">
              Start a realtime maternity partograph to track cervical dilation, contractions, fetal heart rate, and maternal observations.
            </p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Start Partograph
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start Labour Partograph</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Parity</Label>
                    <Input type="number" min="0" value={parity} onChange={(e) => setParity(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Gestation Weeks</Label>
                    <Input type="number" min="20" max="45" value={gestationWeeks} onChange={(e) => setGestationWeeks(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Membranes</Label>
                    <Select value={membraneStatus} onValueChange={(value) => setMembraneStatus(value as MembraneStatus)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {membraneOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Liquor</Label>
                    <Select value={liquor} onValueChange={(value) => setLiquor(value as LiquorStatus)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select liquor" />
                      </SelectTrigger>
                      <SelectContent>
                        {liquorOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea rows={3} value={partographNotes} onChange={(e) => setPartographNotes(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreatePartograph} disabled={createPartograph.isPending}>
                  {createPartograph.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Start Partograph
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Labour Partograph</h3>
          <HelpPopover content="Realtime labour monitoring for maternity care. Record cervical dilation, contractions, fetal heart rate, maternal pulse, urine findings, and oxytocin use." />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <WebSocketStatus
            connectionState={wsState.connectionState}
            reconnectAttempts={wsState.reconnectAttempts}
            showLabel
            size="sm"
            lastUpdate={wsState.lastUpdate}
          />
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={handlePrint}
            disabled={isPrinting || observationsQuery.isLoading}
          >
            {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            <span className="sm:hidden">Print</span>
            <span className="hidden sm:inline">Print / Export</span>
          </Button>
          <Dialog open={observationDialogOpen} onOpenChange={setObservationDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Record Observation
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Record Labour Observation</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Observation Time</Label>
                  <Input type="datetime-local" value={observationTime} onChange={(e) => setObservationTime(e.target.value)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Fetal Heart Rate</Label>
                    <Input type="number" value={fetalHeartRate} onChange={(e) => setFetalHeartRate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cervical Dilation (cm)</Label>
                    <Input type="number" step="0.1" value={cervicalDilation} onChange={(e) => setCervicalDilation(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Descent (fifths)</Label>
                    <Input type="number" min="0" max="5" value={descentFifths} onChange={(e) => setDescentFifths(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Contractions / 10 min</Label>
                    <Input type="number" value={contractionsPer10Min} onChange={(e) => setContractionsPer10Min(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Contraction Duration (sec)</Label>
                    <Input type="number" value={contractionDuration} onChange={(e) => setContractionDuration(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Moulding</Label>
                    <Select value={moulding} onValueChange={(value) => setMoulding(value as MouldingGrade)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select moulding" />
                      </SelectTrigger>
                      <SelectContent>
                        {mouldingOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Maternal Pulse</Label>
                    <Input type="number" value={maternalPulse} onChange={(e) => setMaternalPulse(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Maternal Blood Pressure</Label>
                    <Input value={maternalBloodPressure} onChange={(e) => setMaternalBloodPressure(e.target.value)} placeholder="120/80" />
                  </div>
                  <div className="space-y-2">
                    <Label>Maternal Temperature (°C)</Label>
                    <Input type="number" step="0.1" value={maternalTemperature} onChange={(e) => setMaternalTemperature(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Urine Volume (mL)</Label>
                    <Input type="number" value={urineVolume} onChange={(e) => setUrineVolume(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Urine Protein</Label>
                    <Select value={urineProtein} onValueChange={(value) => setUrineProtein(value as UrineResult)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select result" />
                      </SelectTrigger>
                      <SelectContent>
                        {urineOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Urine Acetone</Label>
                    <Select value={urineAcetone} onValueChange={(value) => setUrineAcetone(value as UrineResult)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select result" />
                      </SelectTrigger>
                      <SelectContent>
                        {urineOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Oxytocin (drops/min)</Label>
                    <Input type="number" value={oxytocinDrops} onChange={(e) => setOxytocinDrops(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Medications / Interventions</Label>
                  <Textarea rows={2} value={medications} onChange={(e) => setMedications(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea rows={2} value={observationNotes} onChange={(e) => setObservationNotes(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setObservationDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateObservation} disabled={createObservation.isPending}>
                  {createObservation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Observation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Fetal Heart Rate" icon={Baby} value={latestObservation?.fetal_heart_rate ? `${latestObservation.fetal_heart_rate} BPM` : '—'} />
        <SummaryCard title="Cervical Dilation" icon={Waves} value={latestObservation?.cervical_dilation_cm ? `${latestObservation.cervical_dilation_cm} cm` : '—'} />
        <SummaryCard title="Contractions" icon={Activity} value={latestObservation?.contractions_per_10_min ? `${latestObservation.contractions_per_10_min}/10 min` : '—'} />
        <SummaryCard title="Maternal Pulse" icon={HeartPulse} value={latestObservation?.maternal_pulse ? `${latestObservation.maternal_pulse} BPM` : '—'} />
      </div>

      {latestObservation?.alerts?.length ? (
        <Card className="border-orange-300 bg-orange-50/70">
          <CardContent className="py-3 flex flex-wrap gap-2">
            {latestObservation.alerts.map((alert) => (
              <Badge key={alert} variant="outline" className="border-orange-400 text-orange-700 bg-white">
                {alert}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Labour Progress</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="cervicalDilation" name="Cervical dilation (cm)" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fetal and Maternal Monitoring</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="fetalHeartRate" name="Fetal heart rate" stroke="#b91c1c" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="maternalPulse" name="Maternal pulse" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contraction Pattern</CardTitle>
        </CardHeader>
        <CardContent className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="contractions" name="Contractions / 10 min" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Observations</CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {observationsQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : observations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No observations recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2 font-medium">Time</th>
                    <th className="p-2 font-medium">FHR</th>
                    <th className="p-2 font-medium">Dilation</th>
                    <th className="p-2 font-medium">Contractions</th>
                    <th className="p-2 font-medium">Maternal Pulse</th>
                    <th className="p-2 font-medium">Urine</th>
                    <th className="p-2 font-medium">Alerts</th>
                  </tr>
                </thead>
                <tbody>
                  {observations.slice().reverse().map((observation) => (
                    <tr key={observation.id} className="border-b last:border-0 align-top">
                      <td className="p-2 whitespace-nowrap">{formatDateTime(observation.observation_time)}</td>
                      <td className="p-2">{observation.fetal_heart_rate ?? '—'}</td>
                      <td className="p-2">{observation.cervical_dilation_cm ? `${observation.cervical_dilation_cm} cm` : '—'}</td>
                      <td className="p-2">
                        {observation.contractions_per_10_min != null
                          ? `${observation.contractions_per_10_min} x ${observation.contraction_duration_seconds ?? 0}s`
                          : '—'}
                      </td>
                      <td className="p-2">{observation.maternal_pulse ?? '—'}</td>
                      <td className="p-2">
                        {observation.urine_volume_ml != null ? `${observation.urine_volume_ml} mL` : '—'}
                      </td>
                      <td className="p-2">
                        {observation.alerts.length ? (
                          <div className="flex flex-wrap gap-1">
                            {observation.alerts.map((alert) => (
                              <Badge key={alert} variant="outline" className="text-xs">{alert}</Badge>
                            ))}
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon }: { title: string; value: string; icon: typeof Activity }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}