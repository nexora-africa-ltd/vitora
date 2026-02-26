'use client';

import { useRouter } from 'next/navigation';
import { 
  Activity, 
  Apple, 
  Hand, 
  Heart, 
  Users, 
  ArrowRight 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpPopover } from '@/components/shared/help-popover';

interface AlliedHealthReferralActionsProps {
  /** Patient ID to include in referral URL */
  patientId: number;
  /** Encounter ID to link referral to */
  encounterId: number;
  /** Disable buttons for closed/cancelled encounters */
  disabled?: boolean;
}

/**
 * Quick action buttons to create allied health referrals from encounter consultation.
 * Each button navigates to the respective allied health module's order/referral creation page
 * with patient_id and encounter_id pre-populated.
 */
export function AlliedHealthReferralActions({
  patientId,
  encounterId,
  disabled = false,
}: AlliedHealthReferralActionsProps) {
  const router = useRouter();

  const referralOptions = [
    {
      label: 'Physiotherapy',
      shortLabel: 'Physio',
      icon: Activity,
      path: `/allied-health/physiotherapy/orders/new`,
      description: 'Refer for physical therapy and rehabilitation services',
    },
    {
      label: 'Nutrition',
      shortLabel: 'Nutrition',
      icon: Apple,
      path: `/allied-health/nutrition/consultations/new`,
      description: 'Refer for nutritional assessment and diet planning',
    },
    {
      label: 'Occupational Therapy',
      shortLabel: 'OT',
      icon: Hand,
      path: `/allied-health/occupational-therapy/orders/new`,
      description: 'Refer for occupational therapy and daily living assessment',
    },
    {
      label: 'Counselling',
      shortLabel: 'Counsel',
      icon: Heart,
      path: `/allied-health/counselling/referrals/new`,
      description: 'Refer for mental health counselling services',
    },
    {
      label: 'Social Work',
      shortLabel: 'Social',
      icon: Users,
      path: `/allied-health/social-work/referrals/new`,
      description: 'Refer for social work support and case management',
    },
  ];

  const handleReferral = (path: string) => {
    const params = new URLSearchParams({
      patient_id: String(patientId),
      encounter_id: String(encounterId),
    });
    router.push(`${path}?${params.toString()}`);
  };

  return (
    <Card>
      <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
            <span className="truncate">Allied Health Referrals</span>
          </CardTitle>
          <HelpPopover 
            content="Create referrals to allied health services. Orders will be linked to this encounter and auto-route to the appropriate clinic queue when approved."
          />
        </div>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <div className="flex flex-wrap gap-2">
          {referralOptions.map((option) => {
            const Icon = option.icon;
            return (
              <Button
                key={option.path}
                variant="outline"
                size="sm"
                onClick={() => handleReferral(option.path)}
                disabled={disabled}
                className="h-9 sm:h-10"
                title={option.description}
              >
                <Icon className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">{option.label}</span>
                <span className="sm:hidden">{option.shortLabel}</span>
              </Button>
            );
          })}
        </div>
        {disabled && (
          <p className="text-xs text-muted-foreground mt-2">
            Referrals cannot be created for closed or cancelled encounters.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
