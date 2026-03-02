'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { qualityApi } from '@/lib/api/quality';
import { toast } from '@/lib/hooks/use-toast';
import type { QualityMeasureCreateData } from '@/lib/types/quality';

export default function NewQualityMeasurePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<QualityMeasureCreateData>({
    code: '',
    name: '',
    description: '',
    domain: 'CLINICAL',
    status: 'DRAFT',
    numerator_logic: '',
    denominator_logic: '',
    exclusion_logic: '',
    target_percentage: null,
    low_threshold: null,
    reporting_period: 'QUARTERLY',
    dhis2_indicator_id: '',
    reference_url: '',
    applicable_clinic_types: [],
  });

  const { mutateAsync: createMeasure, isPending } = useMutation({
    mutationFn: (data: QualityMeasureCreateData) =>
      qualityApi.createMeasure(data),
    onSuccess: (result) => {
      toast({ title: 'Quality measure created', description: result.name });
      queryClient.invalidateQueries({ queryKey: ['quality-measures'] });
      router.push(`/quality/measures/${result.id}`);
    },
    onError: () => {
      toast({
        title: 'Failed to create measure',
        description: 'Please check the form and try again.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMeasure(formData);
  };

  const updateField = <K extends keyof QualityMeasureCreateData>(
    key: K,
    value: QualityMeasureCreateData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Quality Measure"
        helpContent="Define a clinical quality measure (CQM) with numerator/denominator logic and target thresholds."
      />

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  placeholder="e.g., KE-CQM-001"
                  value={formData.code}
                  onChange={(e) => updateField('code', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., ANC 4+ Visits Rate"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe what this measure tracks..."
                value={formData.description ?? ''}
                onChange={(e) => updateField('description', e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Domain</Label>
                <Select
                  value={formData.domain}
                  onValueChange={(v) =>
                    updateField('domain', v as QualityMeasureCreateData['domain'])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLINICAL">Clinical</SelectItem>
                    <SelectItem value="PATIENT_SAFETY">Patient Safety</SelectItem>
                    <SelectItem value="EFFICIENCY">Efficiency</SelectItem>
                    <SelectItem value="PATIENT_EXPERIENCE">Patient Experience</SelectItem>
                    <SelectItem value="PUBLIC_HEALTH">Public Health</SelectItem>
                    <SelectItem value="CARE_COORDINATION">Care Coordination</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) =>
                    updateField('status', v as QualityMeasureCreateData['status'])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="RETIRED">Retired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reporting Period</Label>
                <Select
                  value={formData.reporting_period}
                  onValueChange={(v) =>
                    updateField(
                      'reporting_period',
                      v as QualityMeasureCreateData['reporting_period'],
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                    <SelectItem value="ANNUAL">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Measure Logic */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">
              Measure Logic
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="numerator">Numerator Logic *</Label>
              <Textarea
                id="numerator"
                placeholder="Describe the numerator population..."
                value={formData.numerator_logic}
                onChange={(e) =>
                  updateField('numerator_logic', e.target.value)
                }
                rows={3}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="denominator">Denominator Logic *</Label>
              <Textarea
                id="denominator"
                placeholder="Describe the denominator population..."
                value={formData.denominator_logic}
                onChange={(e) =>
                  updateField('denominator_logic', e.target.value)
                }
                rows={3}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exclusion">Exclusion Logic</Label>
              <Textarea
                id="exclusion"
                placeholder="Describe any exclusion criteria..."
                value={formData.exclusion_logic ?? ''}
                onChange={(e) =>
                  updateField('exclusion_logic', e.target.value)
                }
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Thresholds */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Thresholds</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="target">Target Percentage (%)</Label>
                <Input
                  id="target"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="e.g., 80.00"
                  value={formData.target_percentage ?? ''}
                  onChange={(e) =>
                    updateField(
                      'target_percentage',
                      e.target.value || null,
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="low_threshold">Low Threshold (%)</Label>
                <Input
                  id="low_threshold"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="e.g., 50.00"
                  value={formData.low_threshold ?? ''}
                  onChange={(e) =>
                    updateField(
                      'low_threshold',
                      e.target.value || null,
                    )
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Integration */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Integration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dhis2">DHIS2 Indicator ID</Label>
                <Input
                  id="dhis2"
                  placeholder="e.g., dE4xK23b..."
                  value={formData.dhis2_indicator_id ?? ''}
                  onChange={(e) =>
                    updateField('dhis2_indicator_id', e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reference">Reference URL</Label>
                <Input
                  id="reference"
                  type="url"
                  placeholder="https://..."
                  value={formData.reference_url ?? ''}
                  onChange={(e) =>
                    updateField('reference_url', e.target.value)
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Creating...' : 'Create Measure'}
          </Button>
        </div>
      </form>
    </div>
  );
}
