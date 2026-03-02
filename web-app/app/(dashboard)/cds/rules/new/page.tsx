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
import { cdsApi } from '@/lib/api/cds';
import { toast } from 'sonner';
import type { CDSRuleCreateData } from '@/lib/types/cds';

export default function CDSRuleNewPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<CDSRuleCreateData>({
    code: '',
    name: '',
    description: '',
    category: 'VITAL_SIGN',
    priority: 'MEDIUM',
    evidence_level: 'D',
    condition: { type: 'vital_range', vital: '', max: 0 },
    action_type: 'ALERT',
    action_message: '',
    suggestion: '',
    references: [],
  });

  const [conditionJson, setConditionJson] = useState(JSON.stringify(formData.condition, null, 2));
  const [referencesText, setReferencesText] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: CDSRuleCreateData) => cdsApi.createRule(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['cds-rules'] });
      toast.success('CDS rule created');
      router.push(`/cds/rules/${result.id}`);
    },
    onError: () => toast.error('Failed to create CDS rule'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Parse condition JSON
    let condition: Record<string, unknown>;
    try {
      condition = JSON.parse(conditionJson);
    } catch {
      toast.error('Invalid condition JSON');
      return;
    }

    // Parse references
    const references = referencesText
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean);

    createMutation.mutate({
      ...formData,
      condition,
      references,
    });
  };

  const updateField = <K extends keyof CDSRuleCreateData>(
    key: K,
    value: CDSRuleCreateData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New CDS Rule"
        helpContent="Create a new clinical decision support rule. Define the condition that triggers the rule, the action message, and the suggested clinical action."
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Basic Information */}
        <Card>
          <CardHeader><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => updateField('code', e.target.value.toUpperCase())}
                  placeholder="e.g., VITAL-TEMP-HIGH"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="e.g., High Temperature (Fever)"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description ?? ''}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Describe what this rule does..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Classification */}
        <Card>
          <CardHeader><CardTitle className="text-base">Classification</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={formData.category} onValueChange={(v) => updateField('category', v as CDSRuleCreateData['category'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VITAL_SIGN">Vital Sign</SelectItem>
                    <SelectItem value="DRUG_ALLERGY">Drug-Allergy</SelectItem>
                    <SelectItem value="DRUG_DRUG">Drug-Drug</SelectItem>
                    <SelectItem value="CRITICAL_LAB">Critical Lab</SelectItem>
                    <SelectItem value="GUIDELINE">Guideline</SelectItem>
                    <SelectItem value="PREVENTIVE">Preventive</SelectItem>
                    <SelectItem value="DOSAGE">Dosage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority *</Label>
                <Select value={formData.priority} onValueChange={(v) => updateField('priority', v as CDSRuleCreateData['priority'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="INFO">Info</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Evidence Level</Label>
                <Select value={formData.evidence_level ?? 'D'} onValueChange={(v) => updateField('evidence_level', v as CDSRuleCreateData['evidence_level'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">Level A — Strong</SelectItem>
                    <SelectItem value="B">Level B — Moderate</SelectItem>
                    <SelectItem value="C">Level C — Limited</SelectItem>
                    <SelectItem value="D">Level D — Expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Action Type *</Label>
                <Select value={formData.action_type} onValueChange={(v) => updateField('action_type', v as CDSRuleCreateData['action_type'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALERT">Alert</SelectItem>
                    <SelectItem value="CONTRAINDICATE">Contraindicate</SelectItem>
                    <SelectItem value="WARN">Warn</SelectItem>
                    <SelectItem value="SUGGEST">Suggest</SelectItem>
                    <SelectItem value="REQUIRE">Require</SelectItem>
                    <SelectItem value="INFORM">Inform</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rule Logic */}
        <Card>
          <CardHeader><CardTitle className="text-base">Rule Logic</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="condition">Condition (JSON) *</Label>
              <Textarea
                id="condition"
                value={conditionJson}
                onChange={(e) => setConditionJson(e.target.value)}
                rows={8}
                className="font-mono text-sm"
                placeholder='{"type": "vital_range", "vital": "temperature", "max": 38.0}'
                required
              />
              <p className="text-xs text-muted-foreground">
                Types: vital_range, drug_allergy, drug_drug, lab_range, custom
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="action_message">Action Message *</Label>
              <Textarea
                id="action_message"
                value={formData.action_message}
                onChange={(e) => updateField('action_message', e.target.value)}
                rows={2}
                placeholder="⚠️ High temperature: {value}°C exceeds {threshold}°C."
                required
              />
              <p className="text-xs text-muted-foreground">
                Use &#123;variable&#125; placeholders — they are filled from evaluation context.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="suggestion">Clinical Suggestion</Label>
              <Textarea
                id="suggestion"
                value={formData.suggestion ?? ''}
                onChange={(e) => updateField('suggestion', e.target.value)}
                rows={2}
                placeholder="Assess for infection source. Consider antipyretics."
              />
            </div>
          </CardContent>
        </Card>

        {/* References */}
        <Card>
          <CardHeader><CardTitle className="text-base">References</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="references">Evidence References (one per line)</Label>
              <Textarea
                id="references"
                value={referencesText}
                onChange={(e) => setReferencesText(e.target.value)}
                rows={3}
                placeholder="Kenya Clinical Guidelines 2022&#10;WHO Emergency Guidelines"
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Rule'}
          </Button>
        </div>
      </form>
    </div>
  );
}
