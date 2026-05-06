'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, FlaskConical, Clock, Bug, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/page-header';
import {
  useCulture,
  useIncubateCulture,
  useReadCulture,
  useReportPreliminary,
  useReportFinal,
  useMarkNoGrowth,
  useCancelCulture,
  useAddSensitivity,
  useOrganisms,
  useAntibiotics,
} from '@/lib/hooks/use-laboratory';
import { CultureStatus, SensitivityInterpretation } from '@/lib/types/laboratory';
import { toast } from 'sonner';

const STATUS_COLORS: Record<CultureStatus, string> = {
  INOCULATED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  INCUBATING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  READING: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  PRELIMINARY: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  FINAL: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  NO_GROWTH: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const INTERPRETATION_COLORS: Record<SensitivityInterpretation, string> = {
  S: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  I: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  R: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

export default function CultureDetailPage() {
  const params = useParams();
  const router = useRouter();
  const cultureId = Number(params.id);
  const { data: culture, isLoading } = useCulture(cultureId);

  const [showSensitivityDialog, setShowSensitivityDialog] = useState(false);
  const [selectedAntibiotic, setSelectedAntibiotic] = useState<string>('');
  const [zoneDiameter, setZoneDiameter] = useState('');
  const [mic, setMic] = useState('');
  const [interpretation, setInterpretation] = useState<SensitivityInterpretation>('S');
  const [testMethod, setTestMethod] = useState('DISK');

  const incubate = useIncubateCulture();
  const readCulture = useReadCulture();
  const reportPreliminary = useReportPreliminary();
  const reportFinal = useReportFinal();
  const markNoGrowth = useMarkNoGrowth();
  const cancelCulture = useCancelCulture();
  const addSensitivity = useAddSensitivity();

  const { data: organismsData } = useOrganisms();
  const { data: antibioticsData } = useAntibiotics();
  const antibiotics = antibioticsData?.results ?? [];

  const handleIncubate = async () => {
    try {
      await incubate.mutateAsync({ id: cultureId, data: { temperature: 37, atmosphere: 'AEROBIC', hours: 48 } });
      toast.success('Culture moved to incubation');
    } catch {
      toast.error('Failed to incubate');
    }
  };

  const handleNoGrowth = async () => {
    try {
      await markNoGrowth.mutateAsync(cultureId);
      toast.success('Marked as no growth');
    } catch {
      toast.error('Failed to mark no growth');
    }
  };

  const handleCancel = async () => {
    try {
      await cancelCulture.mutateAsync(cultureId);
      toast.success('Culture cancelled');
    } catch {
      toast.error('Failed to cancel');
    }
  };

  const handleAddSensitivity = async () => {
    if (!selectedAntibiotic || !interpretation) return;
    try {
      await addSensitivity.mutateAsync({
        cultureId,
        data: {
          antibiotic: Number(selectedAntibiotic),
          zone_diameter: zoneDiameter ? Number(zoneDiameter) : null,
          mic: mic ? Number(mic) : null,
          interpretation,
          test_method: testMethod as 'DISK' | 'MIC_BROTH' | 'MIC_ETEST' | 'VITEK' | 'OTHER',
        },
      });
      toast.success('Sensitivity added');
      setShowSensitivityDialog(false);
      setSelectedAntibiotic('');
      setZoneDiameter('');
      setMic('');
    } catch {
      toast.error('Failed to add sensitivity');
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading culture...</div>;
  }

  if (!culture) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Culture not found</div>;
  }

  const canIncubate = culture.status === 'INOCULATED';
  const canRead = culture.status === 'INCUBATING' || culture.status === 'READING';
  const canReport = culture.status === 'READING' || culture.status === 'PRELIMINARY';
  const canNoGrowth = !['FINAL', 'NO_GROWTH', 'CANCELLED'].includes(culture.status);
  const canCancel = !culture.is_complete;
  const canAddSensitivity = ['READING', 'PRELIMINARY'].includes(culture.status);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Culture #${culture.id}`}
        helpContent="View culture details, manage workflow, and add antibiotic sensitivities."
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {culture.patient_name || 'Unknown Patient'}
            {culture.lab_order_number && (
              <span className="text-muted-foreground"> &bull; {culture.lab_order_number}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {culture.organism_name || 'Organism pending'} &bull; {culture.culture_medium || 'No medium specified'}
          </p>
        </div>
        <Badge className={`${STATUS_COLORS[culture.status]} shrink-0 w-fit self-start sm:self-auto`}>
          {culture.status_display}
        </Badge>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        {canIncubate && (
          <Button onClick={handleIncubate} disabled={incubate.isPending} size="sm">
            <Clock className="h-4 w-4 mr-1" />
            Start Incubation
          </Button>
        )}
        {canNoGrowth && (
          <Button variant="outline" onClick={handleNoGrowth} disabled={markNoGrowth.isPending} size="sm">
            <XCircle className="h-4 w-4 mr-1" />
            No Growth
          </Button>
        )}
        {canAddSensitivity && (
          <Button variant="outline" onClick={() => setShowSensitivityDialog(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Sensitivity
          </Button>
        )}
        {canCancel && (
          <Button variant="ghost" onClick={handleCancel} disabled={cancelCulture.isPending} size="sm" className="text-destructive">
            Cancel Culture
          </Button>
        )}
      </div>

      {/* Culture Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              Culture Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-muted-foreground">Medium</p>
                <p className="font-medium">{culture.culture_medium || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Temperature</p>
                <p className="font-medium">
                  {culture.incubation_temperature ? `${culture.incubation_temperature}°C` : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Atmosphere</p>
                <p className="font-medium">{culture.incubation_atmosphere || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Hours</p>
                <p className="font-medium">{culture.incubation_hours ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Days Incubating</p>
                <p className="font-medium">{culture.days_incubating ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Significant</p>
                <p className="font-medium">{culture.is_significant ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bug className="h-4 w-4" />
              Identification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-muted-foreground">Organism</p>
                <p className="font-medium">{culture.organism_name || 'Pending'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Method</p>
                <p className="font-medium">{culture.identification_method || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Colony Count</p>
                <p className="font-medium">{culture.colony_count || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Gram Stain</p>
                <p className="font-medium">{culture.gram_stain_result || '—'}</p>
              </div>
            </div>
            {culture.morphology && (
              <div>
                <p className="text-muted-foreground">Morphology</p>
                <p className="font-medium">{culture.morphology}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reports */}
      {(culture.preliminary_report || culture.final_report) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {culture.preliminary_report && (
              <div>
                <p className="text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Preliminary ({culture.preliminary_reported_at ? new Date(culture.preliminary_reported_at).toLocaleString() : ''})
                </p>
                <p className="mt-1">{culture.preliminary_report}</p>
              </div>
            )}
            {culture.final_report && (
              <div>
                <p className="text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Final ({culture.final_reported_at ? new Date(culture.final_reported_at).toLocaleString() : ''})
                </p>
                <p className="mt-1">{culture.final_report}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sensitivities */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Antibiotic Sensitivities</CardTitle>
          {canAddSensitivity && (
            <Button variant="outline" size="sm" onClick={() => setShowSensitivityDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {culture.sensitivities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No sensitivities recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[400px] w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium">Antibiotic</th>
                    <th className="text-center p-2 font-medium">Zone (mm)</th>
                    <th className="text-center p-2 font-medium">MIC</th>
                    <th className="text-center p-2 font-medium">Result</th>
                    <th className="text-left p-2 font-medium">Method</th>
                  </tr>
                </thead>
                <tbody>
                  {culture.sensitivities.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="p-2">{s.antibiotic_name} ({s.antibiotic_code})</td>
                      <td className="p-2 text-center">{s.zone_diameter ?? '—'}</td>
                      <td className="p-2 text-center">{s.mic ?? '—'}</td>
                      <td className="p-2 text-center">
                        <Badge className={`${INTERPRETATION_COLORS[s.interpretation]} text-xs`}>
                          {s.interpretation_display}
                        </Badge>
                      </td>
                      <td className="p-2">{s.test_method_display}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Sensitivity Dialog */}
      <Dialog open={showSensitivityDialog} onOpenChange={setShowSensitivityDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Antibiotic Sensitivity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Antibiotic</Label>
              <Select value={selectedAntibiotic} onValueChange={setSelectedAntibiotic}>
                <SelectTrigger>
                  <SelectValue placeholder="Select antibiotic" />
                </SelectTrigger>
                <SelectContent>
                  {antibiotics.map((ab) => (
                    <SelectItem key={ab.id} value={String(ab.id)}>
                      {ab.name} ({ab.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Zone Diameter (mm)</Label>
                <Input
                  type="number"
                  value={zoneDiameter}
                  onChange={(e) => setZoneDiameter(e.target.value)}
                  placeholder="e.g. 22"
                />
              </div>
              <div>
                <Label>MIC (µg/ml)</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={mic}
                  onChange={(e) => setMic(e.target.value)}
                  placeholder="e.g. 0.5"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Interpretation</Label>
                <Select value={interpretation} onValueChange={(v) => setInterpretation(v as SensitivityInterpretation)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="S">Sensitive</SelectItem>
                    <SelectItem value="I">Intermediate</SelectItem>
                    <SelectItem value="R">Resistant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Method</Label>
                <Select value={testMethod} onValueChange={setTestMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DISK">Disk Diffusion</SelectItem>
                    <SelectItem value="MIC_BROTH">MIC (Broth)</SelectItem>
                    <SelectItem value="MIC_ETEST">MIC (E-test)</SelectItem>
                    <SelectItem value="VITEK">VITEK</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSensitivityDialog(false)}>Cancel</Button>
            <Button onClick={handleAddSensitivity} disabled={!selectedAntibiotic || addSensitivity.isPending}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
