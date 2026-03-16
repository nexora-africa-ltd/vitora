'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateWard } from '@/lib/hooks/use-inpatient';
import { getApiErrorMessage } from '@/lib/api/client';
import type { InpatientWardType } from '@/lib/types/inpatient';

const WARD_TYPES: { value: InpatientWardType; label: string }[] = [
  { value: 'MEDICAL', label: 'Medical Ward' },
  { value: 'SURGICAL', label: 'Surgical Ward' },
  { value: 'PEDIATRIC', label: 'Pediatric Ward' },
  { value: 'MATERNITY', label: 'Maternity Ward' },
  { value: 'ICU', label: 'Intensive Care Unit' },
  { value: 'ISOLATION', label: 'Isolation Ward' },
];

const GENDER_OPTIONS = [
  { value: 'ANY', label: 'Any Gender' },
  { value: 'MALE_ONLY', label: 'Male Only' },
  { value: 'FEMALE_ONLY', label: 'Female Only' },
];

/** Ward-type defaults applied client-side for preview, backend enforces on save */
const WARD_TYPE_DEFAULTS: Record<string, {
  gender_restriction?: string;
  isolation_capable?: boolean;
  oxygen_equipped?: boolean;
  ventilator_capable?: boolean;
  maternity_designated?: boolean;
  min_age_years?: number | null;
  max_age_years?: number | null;
}> = {
  MATERNITY: { gender_restriction: 'FEMALE_ONLY', maternity_designated: true, min_age_years: 12, max_age_years: 55 },
  ISOLATION: { isolation_capable: true },
  ICU: { isolation_capable: true, oxygen_equipped: true, ventilator_capable: true },
  PEDIATRIC: { min_age_years: 0, max_age_years: 14 },
};

export default function NewWardPage() {
  const router = useRouter();
  const createWard = useCreateWard();

  // Form state
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [wardType, setWardType] = useState<InpatientWardType>('MEDICAL');
  const [floor, setFloor] = useState('');
  const [capacity, setCapacity] = useState('');
  const [dailyRate, setDailyRate] = useState('');
  const [description, setDescription] = useState('');
  const [genderRestriction, setGenderRestriction] = useState('ANY');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [isolationCapable, setIsolationCapable] = useState(false);
  const [oxygenEquipped, setOxygenEquipped] = useState(false);
  const [ventilatorCapable, setVentilatorCapable] = useState(false);
  const [maternityDesignated, setMaternityDesignated] = useState(false);
  const [emergencyBufferPercent, setEmergencyBufferPercent] = useState('0');

  const handleWardTypeChange = (type: InpatientWardType) => {
    setWardType(type);
    const defaults = WARD_TYPE_DEFAULTS[type];
    if (defaults) {
      if (defaults.gender_restriction) setGenderRestriction(defaults.gender_restriction);
      if (defaults.isolation_capable !== undefined) setIsolationCapable(defaults.isolation_capable);
      if (defaults.oxygen_equipped !== undefined) setOxygenEquipped(defaults.oxygen_equipped);
      if (defaults.ventilator_capable !== undefined) setVentilatorCapable(defaults.ventilator_capable);
      if (defaults.maternity_designated !== undefined) setMaternityDesignated(defaults.maternity_designated);
      if (defaults.min_age_years !== undefined) setMinAge(defaults.min_age_years !== null ? String(defaults.min_age_years) : '');
      if (defaults.max_age_years !== undefined) setMaxAge(defaults.max_age_years !== null ? String(defaults.max_age_years) : '');
    } else {
      // Reset to defaults for generic types
      setGenderRestriction('ANY');
      setIsolationCapable(false);
      setOxygenEquipped(false);
      setVentilatorCapable(false);
      setMaternityDesignated(false);
      setMinAge('');
      setMaxAge('');
    }
  };

  const canSubmit = name.trim() && code.trim() && capacity && Number(capacity) > 0 && dailyRate && Number(dailyRate) > 0;

  const handleSubmit = async () => {
    try {
      const ward = await createWard.mutateAsync({
        name: name.trim(),
        code: code.trim(),
        ward_type: wardType,
        floor: floor.trim(),
        capacity: Number(capacity),
        daily_rate: dailyRate,
        description: description.trim(),
        is_active: true,
        gender_restriction: genderRestriction as 'ANY' | 'MALE_ONLY' | 'FEMALE_ONLY',
        min_age_years: minAge ? Number(minAge) : null,
        max_age_years: maxAge ? Number(maxAge) : null,
        isolation_capable: isolationCapable,
        oxygen_equipped: oxygenEquipped,
        ventilator_capable: ventilatorCapable,
        maternity_designated: maternityDesignated,
        emergency_buffer_percent: Number(emergencyBufferPercent) || 0,
      });
      toast.success(`Ward "${ward.name}" created with ${capacity} beds`);
      router.push(`/wards/${ward.id}`);
    } catch (err) {
      toast.error('Failed to create ward', { description: getApiErrorMessage(err) });
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="New Ward"
        helpContent="Create a new hospital ward. Beds are auto-generated based on the capacity you set. Ward type selection pre-fills appropriate constraints."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ward Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ward-name">Ward Name *</Label>
                <Input
                  id="ward-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Medical Ward 1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ward-code">Ward Code *</Label>
                <Input
                  id="ward-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g., MED-01"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ward Type *</Label>
              <Select value={wardType} onValueChange={(v) => handleWardTypeChange(v as InpatientWardType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WARD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="floor">Floor</Label>
                <Input
                  id="floor"
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  placeholder="e.g., 2nd Floor"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capacity">Bed Capacity *</Label>
                <Input
                  id="capacity"
                  type="number"
                  min="1"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="e.g., 20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily-rate">Daily Rate (KES) *</Label>
                <Input
                  id="daily-rate"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={dailyRate}
                  onChange={(e) => setDailyRate(e.target.value)}
                  placeholder="e.g., 500.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional ward description..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Constraints & Capabilities */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Constraints & Capabilities</CardTitle>
              <HelpPopover content="These settings control which patients can be admitted to this ward. The smart ward recommendation engine uses these to match patients to appropriate wards." />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Gender Restriction</Label>
              <Select value={genderRestriction} onValueChange={setGenderRestriction}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="min-age">Minimum Age (years)</Label>
                <Input
                  id="min-age"
                  type="number"
                  min="0"
                  value={minAge}
                  onChange={(e) => setMinAge(e.target.value)}
                  placeholder="No minimum"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-age">Maximum Age (years)</Label>
                <Input
                  id="max-age"
                  type="number"
                  min="0"
                  value={maxAge}
                  onChange={(e) => setMaxAge(e.target.value)}
                  placeholder="No maximum"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t">
              <Label className="text-sm font-medium">Equipment & Capabilities</Label>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="isolation" className="text-sm">Isolation Capable</Label>
                    <p className="text-xs text-muted-foreground">Can handle infectious/isolated patients</p>
                  </div>
                  <Switch id="isolation" checked={isolationCapable} onCheckedChange={setIsolationCapable} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="oxygen" className="text-sm">Oxygen Equipped</Label>
                    <p className="text-xs text-muted-foreground">Beds have piped oxygen supply</p>
                  </div>
                  <Switch id="oxygen" checked={oxygenEquipped} onCheckedChange={setOxygenEquipped} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="ventilator" className="text-sm">Ventilator Capable</Label>
                    <p className="text-xs text-muted-foreground">Supports mechanically ventilated patients</p>
                  </div>
                  <Switch id="ventilator" checked={ventilatorCapable} onCheckedChange={setVentilatorCapable} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="maternity" className="text-sm">Maternity Designated</Label>
                    <p className="text-xs text-muted-foreground">Enforces female-only admission</p>
                  </div>
                  <Switch id="maternity" checked={maternityDesignated} onCheckedChange={setMaternityDesignated} />
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="buffer">Emergency Buffer (%)</Label>
                <HelpPopover content="Percentage of beds reserved for emergency admissions. These beds won't be offered to elective admissions." />
              </div>
              <Input
                id="buffer"
                type="number"
                min="0"
                max="100"
                value={emergencyBufferPercent}
                onChange={(e) => setEmergencyBufferPercent(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push('/wards')}>
          Cancel
        </Button>
        <Button
          disabled={!canSubmit || createWard.isPending}
          onClick={handleSubmit}
        >
          <Save className="h-4 w-4 mr-2" />
          {createWard.isPending ? 'Creating...' : 'Create Ward'}
        </Button>
      </div>
    </div>
  );
}
