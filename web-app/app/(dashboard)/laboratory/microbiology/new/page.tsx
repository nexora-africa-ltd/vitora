'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import { useCreateCulture } from '@/lib/hooks/use-laboratory';
import { IncubationAtmosphere } from '@/lib/types/laboratory';
import { toast } from 'sonner';

const ATMOSPHERE_OPTIONS: { value: IncubationAtmosphere; label: string }[] = [
  { value: 'AEROBIC', label: 'Aerobic' },
  { value: 'ANAEROBIC', label: 'Anaerobic' },
  { value: 'CO2', label: 'CO₂ Enriched' },
  { value: 'MICROAEROPHILIC', label: 'Microaerophilic' },
];

export default function NewCulturePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createCulture = useCreateCulture();

  const labResultParam = searchParams.get('lab_result');

  const [labResult, setLabResult] = useState(labResultParam || '');
  const [cultureMedium, setCultureMedium] = useState('');
  const [incubationTemperature, setIncubationTemperature] = useState('');
  const [incubationAtmosphere, setIncubationAtmosphere] = useState<IncubationAtmosphere | ''>('AEROBIC');
  const [incubationHours, setIncubationHours] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!labResult) {
      toast.error('Lab result ID is required');
      return;
    }

    const labResultId = Number(labResult);
    if (isNaN(labResultId) || labResultId <= 0) {
      toast.error('Please enter a valid lab result ID');
      return;
    }

    createCulture.mutate(
      {
        lab_result: labResultId,
        culture_medium: cultureMedium || undefined,
        incubation_temperature: incubationTemperature ? Number(incubationTemperature) : undefined,
        incubation_atmosphere: incubationAtmosphere || undefined,
        incubation_hours: incubationHours ? Number(incubationHours) : undefined,
      },
      {
        onSuccess: (culture) => {
          toast.success('Culture inoculated successfully');
          router.push(`/laboratory/microbiology/${culture.id}`);
        },
        onError: (error: Error) => {
          toast.error(error.message || 'Failed to create culture');
        },
      }
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Culture"
        helpContent="Inoculate a new culture from a lab result. The culture will be created in INOCULATED status."
      />

      <form onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:gap-6 max-w-2xl">
          {/* Lab Result */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FlaskConical className="h-4 w-4" />
                Source Lab Result
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="lab_result">Lab Result ID *</Label>
                <Input
                  id="lab_result"
                  type="number"
                  min={1}
                  value={labResult}
                  onChange={(e) => setLabResult(e.target.value)}
                  placeholder="Enter lab result ID"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  The lab result this culture is being performed for.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Culture Setup */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Culture Setup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="culture_medium">Culture Medium</Label>
                <Input
                  id="culture_medium"
                  value={cultureMedium}
                  onChange={(e) => setCultureMedium(e.target.value)}
                  placeholder="e.g., Blood Agar, MacConkey, Chocolate Agar"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature (°C)</Label>
                  <Input
                    id="temperature"
                    type="number"
                    step="0.1"
                    min={20}
                    max={45}
                    value={incubationTemperature}
                    onChange={(e) => setIncubationTemperature(e.target.value)}
                    placeholder="37"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="atmosphere">Atmosphere</Label>
                  <Select
                    value={incubationAtmosphere}
                    onValueChange={(v) => setIncubationAtmosphere(v as IncubationAtmosphere)}
                  >
                    <SelectTrigger id="atmosphere">
                      <SelectValue placeholder="Select atmosphere" />
                    </SelectTrigger>
                    <SelectContent>
                      {ATMOSPHERE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hours">Incubation Hours</Label>
                  <Input
                    id="hours"
                    type="number"
                    min={1}
                    max={168}
                    value={incubationHours}
                    onChange={(e) => setIncubationHours(e.target.value)}
                    placeholder="24"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/laboratory/microbiology')}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createCulture.isPending}>
              {createCulture.isPending ? 'Creating...' : 'Inoculate Culture'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
