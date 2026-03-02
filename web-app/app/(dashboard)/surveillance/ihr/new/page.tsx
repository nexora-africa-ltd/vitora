'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Checkbox } from '@/components/ui/checkbox';
import { HelpPopover } from '@/components/shared/help-popover';
import { surveillanceApi } from '@/lib/api/surveillance';
import { locationsApi } from '@/lib/api/locations';
import { toast } from '@/lib/hooks/use-toast';
import type { IHRNotificationCreateData, IHRUrgency } from '@/lib/types/surveillance';

export default function NewIHRNotificationPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<IHRNotificationCreateData>({
    disease: 0,
    event_description: '',
    event_date: new Date().toISOString().split('T')[0] as string,
    urgency: 'URGENT',
    annex2_criteria: {},
    is_annex2_positive: false,
    cases_count: 1,
    deaths_count: 0,
    affected_area: '',
    county: null,
    sub_county: null,
    risk_assessment: '',
    response_measures: '',
  });

  // Fetch IHR-notifiable diseases for dropdown
  const { data: diseases = [] } = useQuery({
    queryKey: ['ihr-notifiable-diseases'],
    queryFn: () => surveillanceApi.listIHRNotifiableDiseases(),
  });

  // Fetch Kenya counties
  const { data: counties = [] } = useQuery({
    queryKey: ['counties'],
    queryFn: () => locationsApi.getCounties(),
  });

  // Fetch sub-counties when county is selected
  const { data: subCounties = [] } = useQuery({
    queryKey: ['sub-counties', formData.county],
    queryFn: () => locationsApi.getSubCounties(formData.county!),
    enabled: !!formData.county,
  });

  const { mutateAsync: createNotification, isPending } = useMutation({
    mutationFn: (data: IHRNotificationCreateData) =>
      surveillanceApi.createIHRNotification(data),
    onSuccess: (result) => {
      toast({
        title: 'IHR notification created',
        description: `Reference: ${result.notification_reference}`,
      });
      queryClient.invalidateQueries({ queryKey: ['ihr-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['ihr-dashboard'] });
      router.push(`/surveillance/ihr/${result.id}`);
    },
    onError: () => {
      toast({
        title: 'Failed to create notification',
        description: 'Please check the form and try again.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.disease) {
      toast({
        title: 'Disease required',
        description: 'Please select an IHR-notifiable disease.',
        variant: 'destructive',
      });
      return;
    }
    await createNotification(formData);
  };

  const updateField = <K extends keyof IHRNotificationCreateData>(
    key: K,
    value: IHRNotificationCreateData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  // WHO IHR Annex 2 decision criteria
  const annex2Questions: Array<{ key: string; label: string }> = [
    { key: 'unusual_or_unexpected', label: 'Is the event unusual or unexpected?' },
    { key: 'significant_public_health_risk', label: 'Is there a significant risk of international spread?' },
    { key: 'significant_international_travel', label: 'Is there a significant risk to international travel or trade?' },
    { key: 'requires_coordinated_response', label: 'Does the event require a coordinated international response?' },
  ];

  const toggleAnnex2 = (key: string, checked: boolean) => {
    const newCriteria = { ...formData.annex2_criteria, [key]: checked };
    const isPositive = Object.values(newCriteria).some((v) => v === true);
    setFormData((prev) => ({
      ...prev,
      annex2_criteria: newCriteria,
      is_annex2_positive: isPositive,
    }));
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New IHR Notification"
        helpContent="Create an International Health Regulations (2005) notification. Events meeting IHR Annex 2 criteria must be notified to WHO within 24 hours per Article 6."
      />

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Disease & Event Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">Event Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Disease */}
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="disease">Disease / Condition *</Label>
                  <HelpPopover content="Only IHR-notifiable diseases are shown." />
                </div>
                <Select
                  value={formData.disease ? String(formData.disease) : ''}
                  onValueChange={(v) => updateField('disease', Number(v))}
                >
                  <SelectTrigger id="disease">
                    <SelectValue placeholder="Select disease" />
                  </SelectTrigger>
                  <SelectContent>
                    {diseases.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Urgency */}
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="urgency">Urgency *</Label>
                  <HelpPopover content="EMERGENCY: immediate notification required. URGENT: within 24 hours. ROUTINE: standard reporting timeline." />
                </div>
                <Select
                  value={formData.urgency}
                  onValueChange={(v) => updateField('urgency', v as IHRUrgency)}
                >
                  <SelectTrigger id="urgency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMERGENCY">Emergency</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                    <SelectItem value="ROUTINE">Routine</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Event Date */}
              <div className="space-y-2">
                <Label htmlFor="event_date">Event Date *</Label>
                <Input
                  id="event_date"
                  type="date"
                  value={formData.event_date}
                  onChange={(e) => updateField('event_date', e.target.value)}
                  required
                />
              </div>

              {/* Cases & Deaths */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="cases_count">Cases</Label>
                  <Input
                    id="cases_count"
                    type="number"
                    min={0}
                    value={formData.cases_count ?? 1}
                    onChange={(e) => updateField('cases_count', parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deaths_count">Deaths</Label>
                  <Input
                    id="deaths_count"
                    type="number"
                    min={0}
                    value={formData.deaths_count ?? 0}
                    onChange={(e) => updateField('deaths_count', parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            {/* Event Description */}
            <div className="space-y-2">
              <Label htmlFor="event_description">Event Description *</Label>
              <Textarea
                id="event_description"
                placeholder="Describe the public health event, including clinical presentation, affected population, and timeline..."
                rows={3}
                value={formData.event_description}
                onChange={(e) => updateField('event_description', e.target.value)}
                required
              />
            </div>

            {/* Affected Area */}
            <div className="space-y-2">
              <Label htmlFor="affected_area">Affected Area</Label>
              <Input
                id="affected_area"
                placeholder="e.g., Kibera, Nairobi County"
                value={formData.affected_area ?? ''}
                onChange={(e) => updateField('affected_area', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">Location</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="county">County</Label>
                <Select
                  value={formData.county ? String(formData.county) : ''}
                  onValueChange={(v) => {
                    updateField('county', Number(v));
                    updateField('sub_county', null);
                  }}
                >
                  <SelectTrigger id="county">
                    <SelectValue placeholder="Select county" />
                  </SelectTrigger>
                  <SelectContent>
                    {counties.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sub_county">Sub-County</Label>
                <Select
                  value={formData.sub_county ? String(formData.sub_county) : ''}
                  onValueChange={(v) => updateField('sub_county', Number(v))}
                  disabled={!formData.county}
                >
                  <SelectTrigger id="sub_county">
                    <SelectValue placeholder={formData.county ? 'Select sub-county' : 'Select county first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {subCounties.map((sc) => (
                      <SelectItem key={sc.id} value={String(sc.id)}>
                        {sc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* WHO IHR Annex 2 Decision Instrument */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">
                IHR Annex 2 Assessment
              </CardTitle>
              <HelpPopover content="The IHR (2005) Annex 2 Decision Instrument helps determine whether a public health event must be notified to WHO. If any criterion is met, the event is considered Annex 2 positive." />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {annex2Questions.map((q) => (
              <div key={q.key} className="flex items-start space-x-3">
                <Checkbox
                  id={`annex2_${q.key}`}
                  checked={!!formData.annex2_criteria?.[q.key]}
                  onCheckedChange={(checked) => toggleAnnex2(q.key, !!checked)}
                />
                <Label
                  htmlFor={`annex2_${q.key}`}
                  className="text-sm font-normal leading-snug cursor-pointer"
                >
                  {q.label}
                </Label>
              </div>
            ))}

            {formData.is_annex2_positive && (
              <div className="mt-3 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                This event meets IHR Annex 2 criteria and <strong>must be notified to WHO within 24 hours</strong> per IHR Article 6.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Risk Assessment & Response */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">Risk Assessment & Response</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="risk_assessment">Risk Assessment</Label>
              <Textarea
                id="risk_assessment"
                placeholder="Assess the public health risk: likelihood of spread, severity, population vulnerability..."
                rows={3}
                value={formData.risk_assessment ?? ''}
                onChange={(e) => updateField('risk_assessment', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="response_measures">Response Measures</Label>
              <Textarea
                id="response_measures"
                placeholder="Measures taken: isolation, contact tracing, treatment protocols, community awareness..."
                rows={3}
                value={formData.response_measures ?? ''}
                onChange={(e) => updateField('response_measures', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/surveillance/ihr')}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Creating…' : 'Create Notification'}
          </Button>
        </div>
      </form>
    </div>
  );
}
