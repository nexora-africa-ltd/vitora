'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/lib/hooks/use-toast';
import { mchRegistrationsApi } from '@/lib/api/mch';
import { PatientSearchInput } from '@/components/patients/patient-search-input';
import { EnrollmentSearchInput } from '@/components/mch/enrollment-search-input';
import type { MCHRegistrationCreateData } from '@/lib/types/mch';

export default function NewMCHRegistrationPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [motherId, setMotherId] = useState<number | null>(null);
  const [enrollmentId, setEnrollmentId] = useState<number | null>(null);
  const [registrationDate, setRegistrationDate] = useState(new Date().toISOString().split('T')[0]);
  const [isHighRisk, setIsHighRisk] = useState(false);
  const [riskFactors, setRiskFactors] = useState('');
  const [lindaJamii, setLindaJamii] = useState(false);
  const [gbvRelated, setGbvRelated] = useState(false);
  const [notes, setNotes] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: MCHRegistrationCreateData) => mchRegistrationsApi.create(data),
    onSuccess: (registration) => {
      queryClient.invalidateQueries({ queryKey: ['mch-registrations'] });
      toast({
        title: 'Registration Created',
        description: `MCH registration ${registration.mch_number} has been created.`,
      });
      router.push(`/mch/${registration.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create MCH registration.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!motherId) {
      toast({
        title: 'Validation Error',
        description: 'Please select a mother.',
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate({
      mother: motherId,
      anc_enrollment: enrollmentId || undefined,
      registration_date: registrationDate,
      is_high_risk: isHighRisk,
      risk_factors: riskFactors,
      linda_jamii_beneficiary: lindaJamii,
      gbv_related: gbvRelated,
      notes,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New MCH Registration"
        helpContent="Create a new maternal and child health registration. Link to an existing ANC enrollment to import pregnancy details."
      />

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Mother Selection */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Mother Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mother">Select Mother *</Label>
                <PatientSearchInput
                  value={motherId}
                  onChange={setMotherId}
                  placeholder="Search for patient..."
                  femaleOnly
                />
              </div>

              {motherId && (
                <div className="space-y-2">
                  <Label htmlFor="enrollment">Link to ANC Enrollment (Optional)</Label>
                  <EnrollmentSearchInput
                    patientId={motherId}
                    value={enrollmentId}
                    onChange={setEnrollmentId}
                  />
                  <p className="text-xs text-muted-foreground">
                    Linking to an ANC enrollment imports LMP, EDD, gravida, parity, and other pregnancy details.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Registration Details */}
          <Card>
            <CardHeader>
              <CardTitle>Registration Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="registration_date">Registration Date</Label>
                <Input
                  id="registration_date"
                  type="date"
                  value={registrationDate}
                  onChange={(e) => setRegistrationDate(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="linda_jamii">Linda Jamii Beneficiary</Label>
                <Switch
                  id="linda_jamii"
                  checked={lindaJamii}
                  onCheckedChange={setLindaJamii}
                />
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Linda Jamii beneficiaries receive free maternity services.
              </p>
            </CardContent>
          </Card>

          {/* Risk Assessment */}
          <Card>
            <CardHeader>
              <CardTitle>Risk Assessment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="high_risk">High Risk Pregnancy</Label>
                <Switch
                  id="high_risk"
                  checked={isHighRisk}
                  onCheckedChange={setIsHighRisk}
                />
              </div>

              {isHighRisk && (
                <div className="space-y-2">
                  <Label htmlFor="risk_factors">Risk Factors</Label>
                  <Textarea
                    id="risk_factors"
                    value={riskFactors}
                    onChange={(e) => setRiskFactors(e.target.value)}
                    placeholder="Describe risk factors..."
                    rows={3}
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <Label htmlFor="gbv_related">GBV Related</Label>
                <Switch
                  id="gbv_related"
                  checked={gbvRelated}
                  onCheckedChange={setGbvRelated}
                />
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                GBV cases are marked as sensitive and have restricted access.
              </p>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Additional Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional notes..."
                rows={3}
              />
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/mch')}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending || !motherId}>
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Registration
          </Button>
        </div>
      </form>
    </div>
  );
}
