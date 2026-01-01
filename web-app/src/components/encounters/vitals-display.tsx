import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Thermometer, Heart, Wind, Droplets, Scale, Ruler } from 'lucide-react';
import { Encounter, VitalSign } from '@/lib/types/encounter';
import { cn } from '@/lib/utils/cn';
import { VITAL_RANGES } from '@/lib/utils/constants';

interface VitalsDisplayProps {
  encounter: Encounter;
}

export function VitalsDisplay({ encounter }: VitalsDisplayProps) {
  const vitals: VitalSign[] = [
    {
      name: 'Temperature',
      value: encounter.temperature,
      unit: '°C',
      normalRange: '36.1-37.2',
      isAbnormal: encounter.temperature
        ? encounter.temperature < 36.1 || encounter.temperature > 37.2
        : false,
      isCritical: encounter.temperature
        ? encounter.temperature < 35 || encounter.temperature > 39
        : false,
    },
    {
      name: 'Pulse',
      value: encounter.pulse,
      unit: 'bpm',
      normalRange: '60-100',
      isAbnormal: encounter.pulse
        ? encounter.pulse < 60 || encounter.pulse > 100
        : false,
      isCritical: encounter.pulse
        ? encounter.pulse < 50 || encounter.pulse > 120
        : false,
    },
    {
      name: 'Blood Pressure',
      value: encounter.blood_pressure,
      unit: 'mmHg',
      normalRange: '90/60-120/80',
      isAbnormal: false, // Would need to parse BP string
      isCritical: false,
    },
    {
      name: 'Respiratory Rate',
      value: encounter.respiratory_rate,
      unit: '/min',
      normalRange: '12-20',
      isAbnormal: encounter.respiratory_rate
        ? encounter.respiratory_rate < 12 || encounter.respiratory_rate > 20
        : false,
      isCritical: encounter.respiratory_rate
        ? encounter.respiratory_rate < 8 || encounter.respiratory_rate > 30
        : false,
    },
    {
      name: 'SpO2',
      value: encounter.spo2,
      unit: '%',
      normalRange: '95-100',
      isAbnormal: encounter.spo2 ? encounter.spo2 < 95 : false,
      isCritical: encounter.spo2 ? encounter.spo2 < 90 : false,
    },
    {
      name: 'Weight',
      value: encounter.weight,
      unit: 'kg',
      normalRange: '',
      isAbnormal: false,
      isCritical: false,
    },
    {
      name: 'Height',
      value: encounter.height,
      unit: 'cm',
      normalRange: '',
      isAbnormal: false,
      isCritical: false,
    },
  ];

  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    Temperature: Thermometer,
    Pulse: Heart,
    'Blood Pressure': Activity,
    'Respiratory Rate': Wind,
    SpO2: Droplets,
    Weight: Scale,
    Height: Ruler,
  };

  const hasCriticalVitals = vitals.some((v) => v.isCritical && v.value !== null);

  return (
    <Card className={cn(hasCriticalVitals && 'border-destructive')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Vital Signs
          </CardTitle>
          {hasCriticalVitals && (
            <Badge variant="destructive">Critical Values</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          {vitals.map((vital) => {
            const Icon = icons[vital.name] || Activity;
            
            return (
              <div
                key={vital.name}
                className={cn(
                  'p-3 rounded-lg border',
                  vital.isCritical && vital.value !== null && 'border-destructive bg-destructive/5',
                  vital.isAbnormal && !vital.isCritical && vital.value !== null && 'border-amber-500 bg-amber-500/5'
                )}
              >
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Icon className="h-4 w-4" />
                  <span className="text-xs">{vital.name}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span
                    className={cn(
                      'text-xl font-semibold',
                      vital.isCritical && vital.value !== null && 'text-destructive',
                      vital.isAbnormal && !vital.isCritical && vital.value !== null && 'text-amber-600'
                    )}
                  >
                    {vital.value ?? '—'}
                  </span>
                  {vital.value !== null && (
                    <span className="text-xs text-muted-foreground">{vital.unit}</span>
                  )}
                </div>
                {vital.normalRange && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Normal: {vital.normalRange}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
