/**
 * Today's Sessions List
 * Shows upcoming sessions across all Allied Health modules
 */

'use client';

import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar, Clock, User } from 'lucide-react';
import { SessionStatusBadge } from './status-badges';
import type { TodaySession } from '@/lib/types/allied-health';
import { EmptyState } from '@/components/shared/empty-state';

const moduleLabels: Record<string, string> = {
  PHYSIO: 'Physio',
  NUTRITION: 'Nutrition',
  OT: 'OT',
  SOCIAL_WORK: 'SW',
  COUNSELLING: 'Counselling',
};

const moduleColors: Record<string, string> = {
  PHYSIO: 'bg-blue-100 text-blue-800',
  NUTRITION: 'bg-green-100 text-green-800',
  OT: 'bg-purple-100 text-purple-800',
  SOCIAL_WORK: 'bg-orange-100 text-orange-800',
  COUNSELLING: 'bg-pink-100 text-pink-800',
};

interface TodaysSessionsListProps {
  sessions: TodaySession[];
  isLoading?: boolean;
}

export function TodaysSessionsList({ sessions, isLoading }: TodaysSessionsListProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Today&apos;s Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-muted rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Today&apos;s Sessions
          {sessions.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {sessions.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No sessions today"
            description="No allied health sessions scheduled for today"
          />
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={`${session.module}-${session.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant="secondary"
                        className={moduleColors[session.module]}
                      >
                        {moduleLabels[session.module]}
                      </Badge>
                      <span className="text-sm font-medium truncate">
                        {session.treatment_type}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {session.patient_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {session.scheduled_time}
                      </span>
                    </div>
                  </div>
                  <SessionStatusBadge status={session.status} />
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
