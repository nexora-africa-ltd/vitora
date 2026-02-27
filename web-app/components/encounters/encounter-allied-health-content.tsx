/**
 * Encounter Allied Health Content
 * Shows all allied health orders/referrals linked to a specific encounter.
 * Used in both the encounter detail page (as a tab) and the clinical flow accordion.
 *
 * NOTE: This is now a read-only view. Referral creation is handled by
 * the unified ReferralCreateDialog in step 9 of the clinical flow.
 */

'use client';

import Link from 'next/link';
import {
  Activity,
  Apple,
  Hand,
  Heart,
  Users,
  ArrowRight,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { EmptyState } from '@/components/shared/empty-state';
import { formatDate, formatRelativeTime } from '@/lib/utils/format';
import {
  useEncounterPhysioOrders,
  useEncounterNutritionConsultations,
  useEncounterCounsellingReferrals,
  useEncounterOTOrders,
  useEncounterSWReferrals,
} from '@/lib/hooks/use-encounter-allied-health';

// Status color mapping
const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  APPROVED: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  SCHEDULED: 'bg-purple-500/15 text-purple-700 dark:text-purple-400',
  IN_PROGRESS: 'bg-primary/15 text-primary',
  COMPLETED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  CANCELLED: 'bg-muted text-muted-foreground',
  ACTIVE: 'bg-primary/15 text-primary',
  ON_HOLD: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
};

const PRIORITY_COLORS: Record<string, string> = {
  ROUTINE: '',
  URGENT: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  EMERGENCY: 'bg-destructive/15 text-destructive',
};

interface EncounterAlliedHealthContentProps {
  encounterId: number;
  patientId: number;
  /** Show referral action buttons */
  showActions?: boolean;
  /** Whether encounter is closed/cancelled */
  disabled?: boolean;
}

/**
 * Content area showing allied health referrals linked to this encounter.
 * Can be used standalone (encounter detail tab) or inside the clinical accordion.
 */
export function EncounterAlliedHealthContent({
  encounterId,
  patientId,
  showActions = false,
  disabled = false,
}: EncounterAlliedHealthContentProps) {
  const { data: physioData, isLoading: physioLoading } = useEncounterPhysioOrders(encounterId);
  const { data: nutritionData, isLoading: nutritionLoading } = useEncounterNutritionConsultations(encounterId);
  const { data: otData, isLoading: otLoading } = useEncounterOTOrders(encounterId);
  const { data: counsellingData, isLoading: counsellingLoading } = useEncounterCounsellingReferrals(encounterId);
  const { data: swData, isLoading: swLoading } = useEncounterSWReferrals(encounterId);

  const physioOrders = physioData?.results || [];
  const nutritionConsultations = nutritionData?.results || [];
  const otOrders = otData?.results || [];
  const counsellingReferrals = counsellingData?.results || [];
  const swReferrals = swData?.results || [];

  const isLoading = physioLoading || nutritionLoading || otLoading || counsellingLoading || swLoading;
  const totalCount = physioOrders.length + nutritionConsultations.length + otOrders.length + counsellingReferrals.length + swReferrals.length;

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={ArrowRight}
          title="No allied health orders"
          description="No allied health orders have been created for this encounter. Use the Referrals section to create referrals to allied health services."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Physiotherapy */}
      {physioOrders.length > 0 && (
        <ReferralSection
          icon={<Activity className="h-4 w-4" />}
          title="Physiotherapy"
          count={physioOrders.length}
        >
          {physioOrders.map((order) => (
            <ReferralCard
              key={order.id}
              href={`/allied-health/physiotherapy/orders/${order.id}`}
              title={order.treatment_type_name}
              orderNumber={order.order_number}
              status={order.status}
              priority={undefined}
              assignee={undefined}
              detail={`${order.completed_sessions}/${order.total_sessions} sessions`}
              date={order.created_at}
            />
          ))}
        </ReferralSection>
      )}

      {/* Nutrition */}
      {nutritionConsultations.length > 0 && (
        <ReferralSection
          icon={<Apple className="h-4 w-4" />}
          title="Nutrition"
          count={nutritionConsultations.length}
        >
          {nutritionConsultations.map((c) => (
            <ReferralCard
              key={c.id}
              href={`/allied-health/nutrition/consultations/${c.id}`}
              title={c.referral_reason.replace(/_/g, ' ')}
              orderNumber={c.order_number}
              status={c.status}
              priority={c.priority}
              assignee={c.assigned_dietitian_name}
              detail={c.bmi ? `BMI: ${c.bmi}` : undefined}
              date={c.created_at}
            />
          ))}
        </ReferralSection>
      )}

      {/* Occupational Therapy */}
      {otOrders.length > 0 && (
        <ReferralSection
          icon={<Hand className="h-4 w-4" />}
          title="Occupational Therapy"
          count={otOrders.length}
        >
          {otOrders.map((order) => (
            <ReferralCard
              key={order.id}
              href={`/allied-health/occupational-therapy/orders/${order.id}`}
              title={order.treatment_type_name}
              orderNumber={order.order_number}
              status={order.status}
              priority={order.priority}
              assignee={order.assigned_therapist_name}
              detail={`${order.completed_sessions}/${order.total_sessions} sessions`}
              date={order.created_at}
            />
          ))}
        </ReferralSection>
      )}

      {/* Counselling */}
      {counsellingReferrals.length > 0 && (
        <ReferralSection
          icon={<Heart className="h-4 w-4" />}
          title="Counselling"
          count={counsellingReferrals.length}
        >
          {counsellingReferrals.map((r) => (
            <ReferralCard
              key={r.id}
              href={`/allied-health/counselling/referrals/${r.id}`}
              title={r.counselling_type_name}
              orderNumber={r.referral_number}
              status={r.status}
              priority={r.priority}
              assignee={r.assigned_counsellor_name}
              detail={`${r.completed_sessions}/${r.total_sessions} sessions`}
              date={r.created_at}
            />
          ))}
        </ReferralSection>
      )}

      {/* Social Work */}
      {swReferrals.length > 0 && (
        <ReferralSection
          icon={<Users className="h-4 w-4" />}
          title="Social Work"
          count={swReferrals.length}
        >
          {swReferrals.map((r) => (
            <ReferralCard
              key={r.id}
              href={`/allied-health/social-work/cases?referral=${r.id}`}
              title={r.referral_reason.replace(/_/g, ' ')}
              orderNumber={r.referral_number}
              status={r.status}
              priority={r.priority}
              assignee={r.assigned_worker_name}
              detail={r.is_sensitive ? 'Sensitive' : undefined}
              date={r.created_at}
            />
          ))}
        </ReferralSection>
      )}

      {/* Quick referral buttons removed — use Referrals section (step 9) instead */}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function ReferralSection({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
        <Badge variant="secondary" className="text-xs">{count}</Badge>
      </div>
      <div className="space-y-2 pl-6">
        {children}
      </div>
    </div>
  );
}

function ReferralCard({
  href,
  title,
  orderNumber,
  status,
  priority,
  assignee,
  detail,
  date,
}: {
  href: string;
  title: string;
  orderNumber: string;
  status: string;
  priority?: string;
  assignee?: string | null;
  detail?: string;
  date: string;
}) {
  return (
    <Link href={href} className="block">
      <div className="flex items-start justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{title}</span>
            <Badge className={STATUS_COLORS[status] || ''}>
              {status.replace(/_/g, ' ')}
            </Badge>
            {priority && priority !== 'ROUTINE' && (
              <Badge className={PRIORITY_COLORS[priority] || ''}>
                {priority}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {orderNumber}
            {assignee && ` • ${assignee}`}
            {detail && ` • ${detail}`}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(date)}</span>
            <span className="hidden sm:inline">• {formatRelativeTime(date)}</span>
          </div>
        </div>
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
      </div>
    </Link>
  );
}

export default EncounterAlliedHealthContent;
