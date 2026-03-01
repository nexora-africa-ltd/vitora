'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, TrendingUp, AlertTriangle, Loader2, Ruler } from 'lucide-react';
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
import { HelpPopover } from '@/components/shared/help-popover';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';
import { growthMeasurementsApi } from '@/lib/api/mch';
import type { GrowthMeasurementCreateData, MUACClassification, NutritionalStatus } from '@/lib/types/mch';

interface GrowthTabProps {
  patientId: number;
}

const muacColors: Record<Exclude<NonNullable<MUACClassification>, ''>, string> = {
  NORMAL: 'bg-green-100 text-green-800',
  MAM: 'bg-orange-100 text-orange-800',
  SAM: 'bg-red-100 text-red-800',
};

const nutritionColors: Record<Exclude<NonNullable<NutritionalStatus>, ''>, string> = {
  NORMAL: 'bg-green-100 text-green-800',
  MILD_UNDERWEIGHT: 'bg-yellow-100 text-yellow-800',
  MODERATE_UNDERWEIGHT: 'bg-orange-100 text-orange-800',
  SEVERE_UNDERWEIGHT: 'bg-red-100 text-red-800',
  OVERWEIGHT: 'bg-blue-100 text-blue-800',
  OBESE: 'bg-purple-100 text-purple-800',
};

export function GrowthTab({ patientId }: GrowthTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['growth-measurements', patientId],
    queryFn: () => growthMeasurementsApi.list({ patient: patientId, ordering: '-measurement_date' }),
  });

  const measurements = data?.results || [];

  // Form state
  const [measurementDate, setMeasurementDate] = useState(new Date().toISOString().split('T')[0]);
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [headCircumference, setHeadCircumference] = useState('');
  const [muac, setMuac] = useState('');
  const [notes, setNotes] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: GrowthMeasurementCreateData) => growthMeasurementsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['growth-measurements', patientId] });
      toast({ title: 'Growth Measurement Recorded' });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to record growth measurement.',
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setMeasurementDate(new Date().toISOString().split('T')[0]);
    setWeight('');
    setHeight('');
    setHeadCircumference('');
    setMuac('');
    setNotes('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      patient: patientId,
      measurement_date: measurementDate,
      weight: weight ? parseFloat(weight) : undefined,
      height: height ? parseFloat(height) : undefined,
      head_circumference: headCircumference ? parseFloat(headCircumference) : undefined,
      muac: muac ? parseFloat(muac) : undefined,
      notes,
    });
  };

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (error) {
    return <div className="text-destructive">Failed to load growth measurements.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Growth Monitoring</h3>
          <HelpPopover content="Track child growth using WHO standards. Measurements are compared against reference data to calculate Z-scores and identify malnutrition." />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/mch/growth?patient=${patientId}`, '_blank')}
          >
            <TrendingUp className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Growth Chart</span>
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Record
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Growth Measurement</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Measurement Date</Label>
                  <Input
                    type="date"
                    value={measurementDate}
                    onChange={(e) => setMeasurementDate(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Weight (kg)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="e.g., 5.75"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Height/Length (cm)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      placeholder="e.g., 65.0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Head Circumference (cm)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={headCircumference}
                      onChange={(e) => setHeadCircumference(e.target.value)}
                      placeholder="e.g., 40.0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>MUAC (cm)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={muac}
                      onChange={(e) => setMuac(e.target.value)}
                      placeholder="e.g., 13.5"
                    />
                    <p className="text-xs text-muted-foreground">
                      SAM: &lt;11.5cm | MAM: 11.5-12.4cm (6-59 months)
                    </p>
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
                    Record
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Malnutrition Alert */}
      {measurements.some((m) => m.has_critical_flag) && (
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">Critical: Malnutrition alert detected. Refer for nutritional intervention.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {measurements.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No growth measurements recorded yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {measurements.map((m) => (
            <Card key={m.id} className={m.has_critical_flag ? 'border-red-200' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Ruler className="h-4 w-4" />
                    {formatDate(m.measurement_date)}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {Math.floor(m.age_in_days / 30)} months
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {m.weight && (
                    <div>
                      <span className="text-muted-foreground">Weight:</span> {m.weight} kg
                    </div>
                  )}
                  {m.height && (
                    <div>
                      <span className="text-muted-foreground">Height:</span> {m.height} cm
                    </div>
                  )}
                  {m.muac && (
                    <div>
                      <span className="text-muted-foreground">MUAC:</span> {m.muac} cm
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {m.muac_classification && (
                    <Badge className={muacColors[m.muac_classification]}>
                      MUAC: {m.muac_classification}
                    </Badge>
                  )}
                  {m.nutritional_status && (
                    <Badge className={nutritionColors[m.nutritional_status]}>
                      {m.nutritional_status.replace(/_/g, ' ')}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
