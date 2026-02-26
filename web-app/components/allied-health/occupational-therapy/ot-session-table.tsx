/**
 * Occupational Therapy Session Table
 * List of sessions for an order
 */

'use client';

import { format, parseISO } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Play, CheckCircle, XCircle, Clock, UserX } from 'lucide-react';
import { SessionStatusBadge } from '@/components/allied-health';
import { EmptyState } from '@/components/shared/empty-state';
import {
  useStartOTSession,
  useCancelOTSession,
  useMarkOTSessionNoShow,
} from '@/lib/hooks/use-occupational-therapy';
import type { OTSessionListItem } from '@/lib/types/occupational-therapy';
import { useToast } from '@/lib/hooks/use-toast';

interface OTSessionTableProps {
  sessions: OTSessionListItem[];
  orderId: number;
}

export function OTSessionTable({ sessions, orderId }: OTSessionTableProps) {
  const { toast } = useToast();
  const startMutation = useStartOTSession();
  const cancelMutation = useCancelOTSession();
  const noShowMutation = useMarkOTSessionNoShow();

  const handleStart = async (sessionId: number) => {
    try {
      await startMutation.mutateAsync(sessionId);
      toast({ title: 'Session started' });
    } catch (err) {
      toast({
        title: 'Failed to start session',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = async (sessionId: number) => {
    try {
      await cancelMutation.mutateAsync({ id: sessionId });
      toast({ title: 'Session cancelled' });
    } catch (err) {
      toast({
        title: 'Failed to cancel session',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleNoShow = async (sessionId: number) => {
    try {
      await noShowMutation.mutateAsync(sessionId);
      toast({ title: 'Session marked as no-show' });
    } catch (err) {
      toast({
        title: 'Failed to mark no-show',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="No sessions"
        description="Generate sessions to schedule therapy appointments"
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>#</TableHead>
          <TableHead>Session</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Time</TableHead>
          <TableHead>Therapist</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((session) => {
          const canStart = session.status === 'SCHEDULED';
          const canCancel = session.status === 'SCHEDULED';
          const canMarkNoShow = session.status === 'SCHEDULED';

          return (
            <TableRow key={session.id}>
              <TableCell>{session.session_sequence}</TableCell>
              <TableCell className="font-mono text-sm">{session.session_number}</TableCell>
              <TableCell>
                {format(parseISO(session.scheduled_date), 'MMM d, yyyy')}
              </TableCell>
              <TableCell>{session.scheduled_time || '-'}</TableCell>
              <TableCell>{session.therapist_name || 'Unassigned'}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {session.outcome || '-'}
              </TableCell>
              <TableCell>
                <SessionStatusBadge status={session.status} />
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canStart && (
                      <DropdownMenuItem onClick={() => handleStart(session.id)}>
                        <Play className="h-4 w-4 mr-2" />
                        Start Session
                      </DropdownMenuItem>
                    )}
                    {canMarkNoShow && (
                      <DropdownMenuItem onClick={() => handleNoShow(session.id)}>
                        <UserX className="h-4 w-4 mr-2" />
                        Mark No-Show
                      </DropdownMenuItem>
                    )}
                    {canCancel && (
                      <DropdownMenuItem
                        onClick={() => handleCancel(session.id)}
                        className="text-destructive"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Cancel
                      </DropdownMenuItem>
                    )}
                    {session.status === 'IN_PROGRESS' && (
                      <DropdownMenuItem>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Complete Session
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
