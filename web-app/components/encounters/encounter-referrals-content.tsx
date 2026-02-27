/**
 * Encounter Referrals Content
 * Shows all clinical referrals linked to a specific encounter.
 * Used as Step 9 in the clinical flow accordion.
 *
 * This is the unified referral UI that replaces the per-module
 * "Refer to" buttons in Allied Health with a single referral form
 * that supports all service types (allied health, specialty,
 * admission, external).
 */

'use client';

import * as React from 'react';
import {
  ArrowRight,
  Calendar,
  Building2,
  Stethoscope,
  BedDouble,
  ExternalLink as ExternalLinkIcon,
  HeartHandshake,
  Plus,
  Shield,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { EmptyState } from '@/components/shared/empty-state';
import { formatDate, formatRelativeTime } from '@/lib/utils/format';
import { useEncounterReferrals } from '@/lib/hooks/use-referrals';
import { ReferralCreateDialog } from '@/components/encounters/referral-create-dialog';
import type { EncounterReferralItem, ReferralType } from '@/lib/types/referral';
import {
  REFERRAL_STATUS_CONFIG,
  REFERRAL_PRIORITY_CONFIG,
} from '@/lib/types/referral';

// Status → CSS color mapping
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  PENDING: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  ACCEPTED: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  DECLINED: 'bg-destructive/15 text-destructive',
  IN_PROGRESS: 'bg-primary/15 text-primary',
  COMPLETED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  CANCELLED: 'bg-muted text-muted-foreground',
  EXPIRED: 'bg-muted text-muted-foreground',
};

const PRIORITY_COLORS: Record<string, string> = {
  ROUTINE: '',
  URGENT: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  EMERGENCY: 'bg-destructive/15 text-destructive',
};

// Referral type → icon mapping
const TYPE_ICONS: Record<ReferralType, React.ReactNode> = {
  ALLIED_HEALTH: <HeartHandshake className="h-4 w-4" />,
  SPECIALTY_CLINIC: <Stethoscope className="h-4 w-4" />,
  ADMISSION: <BedDouble className="h-4 w-4" />,
  EXTERNAL: <Building2 className="h-4 w-4" />,
};

interface EncounterReferralsContentProps {
  encounterId: number;
  patientId: number;
  /** Whether encounter is closed/cancelled */
  disabled?: boolean;
}

export function EncounterReferralsContent({
  encounterId,
  patientId,
  disabled = false,
}: EncounterReferralsContentProps) {
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const { data: referrals, isLoading } = useEncounterReferrals(encounterId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  const referralList = referrals || [];

  // Group referrals by type
  const grouped = referralList.reduce<Record<ReferralType, EncounterReferralItem[]>>(
    (acc, r) => {
      if (!acc[r.referral_type]) {
        acc[r.referral_type] = [];
      }
      acc[r.referral_type].push(r);
      return acc;
    },
    {} as Record<ReferralType, EncounterReferralItem[]>
  );

  const typeOrder: ReferralType[] = ['ADMISSION', 'ALLIED_HEALTH', 'SPECIALTY_CLINIC', 'EXTERNAL'];
  const typeLabels: Record<ReferralType, string> = {
    ADMISSION: 'Admission Referrals',
    ALLIED_HEALTH: 'Allied Health Referrals',
    SPECIALTY_CLINIC: 'Specialty Clinic Referrals',
    EXTERNAL: 'External Facility Referrals',
  };

  return (
    <div className="space-y-4">
      {referralList.length === 0 ? (
        <EmptyState
          icon={ArrowRight}
          title="No referrals"
          description="No referrals have been created for this encounter."
        />
      ) : (
        typeOrder.map((type) => {
          const items = grouped[type];
          if (!items || items.length === 0) return null;

          return (
            <div key={type} className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                {TYPE_ICONS[type]}
                {typeLabels[type]}
                <Badge variant="secondary" className="text-xs">
                  {items.length}
                </Badge>
              </div>
              <div className="space-y-2 pl-6">
                {items.map((r) => (
                  <ReferralCard key={r.id} referral={r} />
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* Create Referral Button */}
      {!disabled && (
        <div className="flex pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Create Referral
          </Button>
        </div>
      )}

      {/* Referral creation dialog */}
      <ReferralCreateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        encounterId={encounterId}
        patientId={patientId}
      />
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function ReferralCard({ referral }: { referral: EncounterReferralItem }) {
  const statusConfig = REFERRAL_STATUS_CONFIG[referral.status];
  const priorityConfig = REFERRAL_PRIORITY_CONFIG[referral.priority];

  return (
    <div className="flex items-start justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
      <div className="space-y-1 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">
            {referral.target_service_display}
          </span>
          <Badge className={STATUS_COLORS[referral.status] || ''}>
            {statusConfig?.label || referral.status}
          </Badge>
          {referral.priority !== 'ROUTINE' && (
            <Badge className={PRIORITY_COLORS[referral.priority] || ''}>
              {priorityConfig?.label || referral.priority}
            </Badge>
          )}
          {referral.is_sensitive && (
            <Shield className="h-3 w-3 text-destructive" />
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-1">
          {referral.referral_number} • {referral.reason}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>{formatDate(referral.created_at)}</span>
          <span className="hidden sm:inline">
            • {formatRelativeTime(referral.created_at)}
          </span>
          <span>• by {referral.referred_by_name}</span>
        </div>
      </div>
    </div>
  );
}

export default EncounterReferralsContent;
