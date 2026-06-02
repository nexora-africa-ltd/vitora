/**
 * ActivityFeedWidget Component
 *
 * Real-time activity feed for admin dashboard showing recent audit log entries.
 * Displays who did what, when, with human-readable action descriptions.
 */

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Activity,
  UserPlus,
  Eye,
  Pencil,
  Trash2,
  LogIn,
  LogOut,
  FileText,
  Stethoscope,
  Pill,
  CreditCard,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuditLogs } from '@/lib/hooks/use-rbac';
import { DashboardListSkeleton, DashboardEmptyState, DashboardFooterLink } from './widget-primitives';

const MAX_ITEMS = 8;

interface ActionMeta {
  icon: LucideIcon;
  label: string;
  color: string;
}

function getActionMeta(action: string): ActionMeta {
  const map: Record<string, ActionMeta> = {
    patient_create: { icon: UserPlus, label: 'Registered patient', color: 'text-green-500' },
    patient_view: { icon: Eye, label: 'Viewed patient', color: 'text-blue-500' },
    patient_update: { icon: Pencil, label: 'Updated patient', color: 'text-amber-500' },
    patient_delete: { icon: Trash2, label: 'Deleted patient', color: 'text-red-500' },
    encounter_create: { icon: Stethoscope, label: 'Created encounter', color: 'text-cyan-500' },
    encounter_update: { icon: Stethoscope, label: 'Updated encounter', color: 'text-cyan-600' },
    encounter_view: { icon: Eye, label: 'Viewed encounter', color: 'text-blue-400' },
    login_success: { icon: LogIn, label: 'Logged in', color: 'text-green-600' },
    login_failed: { icon: LogIn, label: 'Failed login', color: 'text-red-500' },
    logout: { icon: LogOut, label: 'Logged out', color: 'text-gray-500' },
    data_export: { icon: FileText, label: 'Exported data', color: 'text-purple-500' },
    prescription_create: { icon: Pill, label: 'Created prescription', color: 'text-purple-600' },
    payment_create: { icon: CreditCard, label: 'Recorded payment', color: 'text-emerald-500' },
    invoice_create: { icon: CreditCard, label: 'Created invoice', color: 'text-emerald-600' },
    sha_claim_submit: { icon: Shield, label: 'Submitted SHA claim', color: 'text-blue-600' },
    view_sensitive_patient: { icon: Shield, label: 'Accessed sensitive record', color: 'text-amber-600' },
    sensitive_access_denied: { icon: Shield, label: 'Sensitive access denied', color: 'text-red-600' },
  };

  if (map[action]) return map[action];

  // Generic fallbacks based on action suffix
  if (action.endsWith('_create')) return { icon: UserPlus, label: action.replace(/_/g, ' '), color: 'text-green-500' };
  if (action.endsWith('_update')) return { icon: Pencil, label: action.replace(/_/g, ' '), color: 'text-amber-500' };
  if (action.endsWith('_delete')) return { icon: Trash2, label: action.replace(/_/g, ' '), color: 'text-red-500' };
  if (action.endsWith('_view')) return { icon: Eye, label: action.replace(/_/g, ' '), color: 'text-blue-500' };

  return { icon: Activity, label: action.replace(/_/g, ' '), color: 'text-muted-foreground' };
}

function getUserInitials(username: string): string {
  if (!username) return '?';
  const parts = username.split(/[.\s_-]/).filter(Boolean);
  const first = parts[0]?.[0];
  const second = parts[1]?.[0];
  if (first && second) {
    return (first + second).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}

export function ActivityFeedWidget({ enabled = true }: { enabled?: boolean }) {
  const { data, isLoading } = useAuditLogs(
    enabled ? { page_size: MAX_ITEMS } : undefined
  );

  const entries = useMemo(() => data?.results ?? [], [data]);

  if (isLoading) {
    return <DashboardListSkeleton rows={4} showMeta={false} />;
  }

  if (!entries.length) {
    return (
      <DashboardEmptyState
        icon={Activity}
        title="No recent activity"
        description="Activity will appear here as staff use the system."
      />
    );
  }

  return (
    <div className="space-y-1">
      <ul className="space-y-1" aria-label="Recent activity">
        {entries.map((entry) => {
          const meta = getActionMeta(entry.action);
          const Icon = meta.icon;
          const resourceLabel = entry.resource_type
            ? `${entry.resource_type}${entry.resource_id ? ` #${entry.resource_id}` : ''}`
            : null;

          return (
            <li
              key={entry.id}
              className="group flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40"
            >
              <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                <AvatarFallback className="bg-muted text-[10px] font-medium">
                  {getUserInitials(entry.username)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <div className="text-xs leading-relaxed">
                  <span className="font-medium text-foreground">{entry.username}</span>
                  {' '}
                  <span className="text-muted-foreground">{meta.label}</span>
                  {resourceLabel && (
                    <Badge variant="outline" className="ml-1.5 inline-flex h-4 px-1 text-[9px] align-middle">
                      {resourceLabel}
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                  {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                </div>
              </div>

              <Icon className={`h-3.5 w-3.5 shrink-0 mt-1 ${meta.color}`} aria-hidden="true" />
            </li>
          );
        })}
      </ul>

      {(data?.count ?? 0) > MAX_ITEMS && (
        <DashboardFooterLink href="/admin/audit-logs" label="View All Activity" />
      )}
    </div>
  );
}

export default ActivityFeedWidget;
