// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Global emergency-access status banner.
 *
 * Usage:
 * - Render inside the dashboard layout to keep users aware of active
 *   break-glass sessions.
 * - Supports ending an active session directly from the banner.
 *
 * Inputs:
 * - No props. Reads authenticated user's active sessions from core API.
 */
'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { coreApi } from '@/lib/api/core';
import { useToast } from '@/lib/hooks/use-toast';

function summarizeSession(count: number): string {
  if (count <= 0) return '';
  if (count === 1) return '1 emergency-access session is active.';
  return `${count} emergency-access sessions are active.`;
}

export function EmergencyAccessBanner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['core', 'emergency-access', 'my-active'],
    queryFn: () => coreApi.myActiveEmergencyAccess(),
  });

  const sessions = useMemo(() => data ?? [], [data]);
  const latestSession = sessions[0] ?? null;

  const closeMutation = useMutation({
    mutationFn: coreApi.closeEmergencyAccess,
    onSuccess: () => {
      toast({ title: 'Emergency access session ended' });
      queryClient.invalidateQueries({ queryKey: ['core', 'emergency-access'] });
    },
    onError: () => {
      toast({ title: 'Unable to end emergency session', variant: 'destructive' });
    },
  });

  if (sessions.length === 0) return null;

  return (
    <Alert className="mb-4 border-amber-500/50 bg-amber-50">
      <ShieldAlert className="h-4 w-4 text-amber-700" />
      <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-amber-900">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          {summarizeSession(sessions.length)}
          <span className="ml-1 text-amber-800/90">All actions remain audited until session close.</span>
        </span>
        <span className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-amber-400 bg-white text-amber-900 hover:bg-amber-100"
            onClick={() => latestSession && closeMutation.mutate(latestSession.id)}
            disabled={!latestSession || closeMutation.isPending}
          >
            End latest session
          </Button>
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="text-amber-900 hover:bg-amber-200/60"
          >
            <Link href="/safety/emergency-access">Open Safety</Link>
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
