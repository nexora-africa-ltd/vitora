import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Thermometer, Heart, Wind, Droplets, Scale, Ruler, ShieldAlert } from 'lucide-react';
import { Encounter, VitalSign } from '@/lib/types/encounter';
import type { InlineCDSAlert } from '@/lib/types/encounter';
import { cn } from '@/lib/utils/cn';

// Map CDS rule code prefixes to vital field names for contextual callouts
const RULE_CODE_TO_VITAL: Record<string, string> = {
  'VITAL-TEMP': 'Temperature',
  'VITAL-SPO2': 'SpO2',
  'VITAL-PULSE': 'Pulse',
  'VITAL-BP': 'Blood Pressure',
  'VITAL-RR': 'Respiratory Rate',
};

/** Find matching CDS alerts for a vital sign name */
function getVitalAlerts(vitalName: string, cdsAlerts: InlineCDSAlert[]): InlineCDSAlert[] {
  return cdsAlerts.filter((alert) => {
    return Object.entries(RULE_CODE_TO_VITAL).some(
      ([prefix, name]) => name === vitalName && alert.rule_code.startsWith(prefix)
    );
  });
}

interface VitalsDisplayProps {
  encounter: Encounter;
}

export function VitalsDisplay({ encounter }: VitalsDisplayProps) {
  const vitals: VitalSign[] = [
    {
      name: 'Temperature',
      value: encounter.temperature,
      unit: '°C',
      normalRange: '36.5-37.5',
      isAbnormal: encounter.temperature
        ? encounter.temperature < 36.5 || encounter.temperature > 37.5
        : false,
      isCritical: encounter.temperature
        ? encounter.temperature < 35 || encounter.temperature >= 40
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
      isAbnormal: false,
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

  // CDS alerts embedded in encounter response (advisory callouts)
  const cdsAlerts = encounter.cds_alerts || [];

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
            const vitalCdsAlerts = getVitalAlerts(vital.name, cdsAlerts);
            const hasCdsAlert = vitalCdsAlerts.length > 0;

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
                {/* Contextual CDS callout */}
                {hasCdsAlert && (
                  <div className="mt-2 pt-1.5 border-t border-dashed border-current/20">
                    {vitalCdsAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={cn(
                          'flex items-start gap-1 text-[10px] leading-tight',
                          alert.is_critical ? 'text-destructive' : 'text-amber-600'
                        )}
                        title={alert.suggestion}
                      >
                        <ShieldAlert className="h-3 w-3 shrink-0 mt-0.5" />
                        <span>{alert.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
