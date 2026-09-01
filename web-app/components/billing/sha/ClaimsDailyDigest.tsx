/**
 * ClaimsDailyDigest — End-of-day SHA claims summary dashboard.
 *
 * Shows:
 * - Claims created/submitted today
 * - Pending submission count and amount
 * - Time-bar risk alerts
 * - Outstanding queries
 */
'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Clock,
  AlertTriangle,
  FileCheck,
  Send,
  DollarSign,
  MessageSquareWarning,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { shaApi, type DailyDigest } from '@/lib/api/sha';

export function ClaimsDailyDigest() {
  const { data: digest, isLoading } = useQuery<DailyDigest>({
    queryKey: ['sha', 'daily-digest'],
    queryFn: () => shaApi.getDailyDigest(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!digest) return null;

  const { summary, action_items } = digest;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Today&apos;s Claims Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={<FileCheck className="h-4 w-4 text-blue-500" />}
            label="Created"
            value={summary.created_today}
          />
          <StatCard
            icon={<Send className="h-4 w-4 text-green-500" />}
            label="Submitted"
            value={summary.submitted_today}
          />
          <StatCard
            icon={<Clock className="h-4 w-4 text-amber-500" />}
            label="Pending"
            value={summary.pending_submission}
          />
          <StatCard
            icon={<DollarSign className="h-4 w-4 text-emerald-500" />}
            label="Approved"
            value={`KES ${Number(summary.approved_today_amount).toLocaleString()}`}
            isText
          />
        </div>

        {/* Revenue at risk */}
        {summary.pending_submission > 0 && (
          <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800/60 dark:bg-amber-900/20">
            <span className="text-sm text-amber-800 dark:text-amber-300">
              Revenue pending submission
            </span>
            <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              KES {Number(summary.pending_amount).toLocaleString()}
            </span>
          </div>
        )}

        {/* Action items */}
        {(action_items.time_bar_risk.length > 0 || action_items.queries.length > 0) && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Action Required</h4>

            {/* Time-bar risk */}
            {action_items.time_bar_risk.map((claim) => (
              <div
                key={claim.id}
                className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800/60 dark:bg-red-900/20"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                <span className="flex-1 text-xs">
                  <span className="font-medium">{claim.claim_number}</span> — Time bar in{' '}
                  <Badge variant="destructive" className="px-1 text-[10px]">
                    {claim.hours_remaining}h
                  </Badge>
                </span>
              </div>
            ))}

            {/* Outstanding queries */}
            {action_items.queries.map((claim) => (
              <div
                key={claim.id}
                className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-800/60 dark:bg-orange-900/20"
              >
                <MessageSquareWarning className="h-4 w-4 shrink-0 text-orange-600" />
                <span className="flex-1 text-xs">
                  <span className="font-medium">{claim.claim_number}</span> — Query from SHA
                  <span className="ml-1 text-muted-foreground">({claim.patient})</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({
  icon,
  label,
  value,
  isText,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  isText?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border p-2">
      {icon}
      <div className="min-w-0">
        <p className="truncate text-[10px] text-muted-foreground">{label}</p>
        <p className={`font-semibold ${isText ? 'text-xs' : 'text-sm'} truncate`}>{value}</p>
      </div>
    </div>
  );
}
