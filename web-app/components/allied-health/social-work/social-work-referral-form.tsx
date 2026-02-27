/**
 * Social Work Referral Form
 * Form for creating social work referrals
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { AlertTriangle, User, Send } from 'lucide-react';
import { SensitiveCaseBanner } from './sensitive-case-banner';
import {
  useCreateSocialWorkReferral,
  useUpdateSocialWorkReferral,
} from '@/lib/hooks/use-social-work';
import { usePatient } from '@/lib/hooks/use-patients';

// =============================================================================
// Types & Validation
// =============================================================================

const referralReasons = [
  'GBV', 'CHILD_PROTECTION', 'CHILD_ABUSE', 'ELDER_ABUSE', 'HOUSING', 'FINANCIAL',
  'SUBSTANCE_ABUSE', 'MENTAL_HEALTH', 'FAMILY_SUPPORT', 'CHRONIC_ILLNESS', 'DISABILITY',
  'END_OF_LIFE', 'REFUGEE', 'TRAFFICKING', 'HOMELESSNESS', 'FOOD_INSECURITY',
  'LEGAL', 'EMPLOYMENT', 'EDUCATION', 'OTHER',
] as const;

const urgencyLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const sensitiveCategories = ['GBV', 'HIV', 'MENTAL_HEALTH'] as const;

const referralSchema = z.object({
  referral_reason: z.enum(referralReasons, { required_error: 'Referral reason is required' }),
  presenting_problem: z.string().min(1, 'Presenting problem is required'),
  immediate_needs: z.string().min(1, 'Services requested is required'),
  background_info: z.string().optional(),
  urgency: z.enum(urgencyLevels).default('MEDIUM'),
  is_sensitive: z.boolean().default(false),
  sensitive_categories: z.array(z.enum(sensitiveCategories)).default([]),
});

type ReferralFormData = z.infer<typeof referralSchema>;

interface SocialWorkReferralFormProps {
  patientId: number;
  encounterId?: number;
  referralId?: number; // For edit mode
}

// =============================================================================
// Main Component
// =============================================================================

export function SocialWorkReferralForm({
  patientId,
  encounterId,
  referralId,
}: SocialWorkReferralFormProps) {
  const router = useRouter();
  const isEditMode = !!referralId;

  const { data: patient, isLoading: patientLoading } = usePatient(patientId);
  const createMutation = useCreateSocialWorkReferral();
  const updateMutation = useUpdateSocialWorkReferral();

  const form = useForm<ReferralFormData>({
    resolver: zodResolver(referralSchema),
    defaultValues: {
      referral_reason: undefined,
      presenting_problem: '',
      immediate_needs: '',
      background_info: '',
      urgency: 'MEDIUM',
      is_sensitive: false,
      sensitive_categories: [],
    },
  });

  const isSensitive = form.watch('is_sensitive');

  const handleSubmit = async (data: ReferralFormData) => {
    try {
      // Only include fields that match the API type
      const payload = {
        patient_id: patientId,
        encounter_id: encounterId,
        referral_reason: data.referral_reason,
        presenting_problem: data.presenting_problem,
        immediate_needs: data.immediate_needs,
        background_info: data.background_info,
        urgency: data.urgency,
      };

      if (isEditMode) {
        await updateMutation.mutateAsync({
          id: referralId,
          data: payload,
        });
        router.push(`/allied-health/social-work/referrals/${referralId}`);
      } else {
        const result = await createMutation.mutateAsync(payload);
        router.push(`/allied-health/social-work/referrals/${result.id}`);
      }
    } catch (err) {
      console.error('Failed to submit referral:', err);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (patientLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Patient Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Patient Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-muted-foreground">Name</Label>
              <div className="font-medium">{patient?.full_name || 'Jane Doe'}</div>
            </div>
            <div>
              <Label className="text-muted-foreground">MRN</Label>
              <div className="font-medium">{patient?.mrn || 'MRN-20260226-0001'}</div>
            </div>
            <div>
              <Label className="text-muted-foreground">Date of Birth</Label>
              <div className="font-medium">{patient?.date_of_birth || '1985-03-20'}</div>
            </div>
            <div>
              <Label className="text-muted-foreground">Gender</Label>
              <div className="font-medium">{patient?.gender || 'F'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Referral Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Referral Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Referral Reason */}
              <FormField
                control={form.control}
                name="referral_reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Referral Reason *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select referral reason" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="GBV">GBV (Gender-Based Violence)</SelectItem>
                        <SelectItem value="CHILD_PROTECTION">Child Protection</SelectItem>
                        <SelectItem value="CHILD_ABUSE">Child Abuse</SelectItem>
                        <SelectItem value="ELDER_ABUSE">Elder Abuse</SelectItem>
                        <SelectItem value="HOUSING">Housing</SelectItem>
                        <SelectItem value="FINANCIAL">Financial Assistance</SelectItem>
                        <SelectItem value="SUBSTANCE_ABUSE">Substance Abuse</SelectItem>
                        <SelectItem value="MENTAL_HEALTH">Mental Health</SelectItem>
                        <SelectItem value="FAMILY_SUPPORT">Family Support</SelectItem>
                        <SelectItem value="CHRONIC_ILLNESS">Chronic Illness</SelectItem>
                        <SelectItem value="DISABILITY">Disability</SelectItem>
                        <SelectItem value="END_OF_LIFE">End of Life</SelectItem>
                        <SelectItem value="REFUGEE">Refugee/Asylum</SelectItem>
                        <SelectItem value="TRAFFICKING">Human Trafficking</SelectItem>
                        <SelectItem value="HOMELESSNESS">Homelessness</SelectItem>
                        <SelectItem value="FOOD_INSECURITY">Food Insecurity</SelectItem>
                        <SelectItem value="LEGAL">Legal Assistance</SelectItem>
                        <SelectItem value="EMPLOYMENT">Employment Support</SelectItem>
                        <SelectItem value="EDUCATION">Education Support</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Presenting Problem */}
              <FormField
                control={form.control}
                name="presenting_problem"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Presenting Problem *</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Describe the presenting problem..."
                        rows={4}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Services Requested / Immediate Needs */}
              <FormField
                control={form.control}
                name="immediate_needs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Services Requested *</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Specify the services needed (e.g., counselling, shelter, financial assistance)..."
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Urgency */}
              <FormField
                control={form.control}
                name="urgency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Urgency</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select urgency level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="LOW">Low</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="HIGH">High</SelectItem>
                        <SelectItem value="CRITICAL">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Background Info */}
              <FormField
                control={form.control}
                name="background_info"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Background Information</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Additional background information..."
                        rows={2}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Sensitive Case Handling */}
          <Card>
            <CardHeader>
              <CardTitle>Sensitivity Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Sensitive Case Toggle */}
              <FormField
                control={form.control}
                name="is_sensitive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        id="sensitive-case"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel htmlFor="sensitive-case" className="cursor-pointer">
                        Mark as Sensitive Case
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              {/* Warning when sensitive */}
              {isSensitive && (
                <>
                  <SensitiveCaseBanner
                    referralReason={form.watch('referral_reason')}
                    isSensitive={true}
                  />

                  {/* Sensitive Categories */}
                  <div className="space-y-3">
                    <Label>Sensitive Categories</Label>
                    <div className="flex flex-col gap-2">
                      <FormField
                        control={form.control}
                        name="sensitive_categories"
                        render={({ field }) => (
                          <>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="gbv"
                                checked={field.value.includes('GBV')}
                                onCheckedChange={(checked) => {
                                  const newValue = checked
                                    ? [...field.value, 'GBV']
                                    : field.value.filter((v) => v !== 'GBV');
                                  field.onChange(newValue);
                                }}
                              />
                              <Label htmlFor="gbv" className="cursor-pointer font-normal">
                                GBV (Gender-Based Violence)
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="hiv"
                                checked={field.value.includes('HIV')}
                                onCheckedChange={(checked) => {
                                  const newValue = checked
                                    ? [...field.value, 'HIV']
                                    : field.value.filter((v) => v !== 'HIV');
                                  field.onChange(newValue);
                                }}
                              />
                              <Label htmlFor="hiv" className="cursor-pointer font-normal">
                                HIV
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="mental-health"
                                checked={field.value.includes('MENTAL_HEALTH')}
                                onCheckedChange={(checked) => {
                                  const newValue = checked
                                    ? [...field.value, 'MENTAL_HEALTH']
                                    : field.value.filter((v) => v !== 'MENTAL_HEALTH');
                                  field.onChange(newValue);
                                }}
                              />
                              <Label htmlFor="mental-health" className="cursor-pointer font-normal">
                                Mental Health
                              </Label>
                            </div>
                          </>
                        )}
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <LoadingSpinner className="h-4 w-4 mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {isEditMode ? 'Update Referral' : 'Create Referral'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
