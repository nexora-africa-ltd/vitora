/**
 * Clinic Visit Card Component
 *
 * Displays an active consultation card with patient info,
 * time tracking, and action buttons.
 */
'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock,
  User,
  CheckCircle,
  ArrowRight,
  FileText,
  Stethoscope,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ClinicPriorityBadge } from './clinic-priority-badge';
import { useCompleteVisit } from '@/lib/hooks/use-clinics';
import { toast } from '@/lib/hooks/use-toast';
import type { ClinicVisit } from '@/lib/types/clinic';
import { cn } from '@/lib/utils/cn';

interface ClinicVisitCardProps {
  visit: ClinicVisit;
  clinicId: number;
  onRefresh: () => void;
}

function formatDuration(startTime: string | null): string {
  if (!startTime) return '--';
  const start = new Date(startTime);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return 'Just started';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function formatTime(dateString: string | null): string {
  if (!dateString) return '--';
  return new Date(dateString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function ClinicVisitCard({ visit, clinicId, onRefresh }: ClinicVisitCardProps) {
  const router = useRouter();
  const { mutateAsync: completeVisit, isPending: completing } = useCompleteVisit();

  const handleComplete = useCallback(async () => {
    try {
      await completeVisit(visit.id);
      toast({
        title: 'Visit Completed',
        description: `Consultation for ${visit.patient.full_name} has been completed.`,
      });
      onRefresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to complete visit. Please try again.',
        variant: 'destructive',
      });
    }
  }, [completeVisit, visit, onRefresh]);

  const handleViewEncounter = () => {
    if (visit.encounter) {
      router.push(`/encounters/${visit.encounter}`);
    }
  };

  const handleViewPatient = () => {
    router.push(`/patients/${visit.patient.id}`);
  };

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-blue-100 text-blue-600">
                {getInitials(visit.patient.full_name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base">{visit.patient.full_name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {visit.patient.mrn} • {visit.patient.age ? `${visit.patient.age}y` : ''}{' '}
                {visit.patient.gender}
              </p>
            </div>
          </div>
          <ClinicPriorityBadge priority={visit.priority} size="sm" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Time Info */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Started {formatTime(visit.consultation_started_at)}</span>
          </div>
          <Badge variant="outline" className="font-mono">
            {formatDuration(visit.consultation_started_at)}
          </Badge>
        </div>

        {/* Clinician */}
        {visit.assigned_clinician_name && (
          <div className="flex items-center gap-2 text-sm">
            <Stethoscope className="h-4 w-4 text-muted-foreground" />
            <span>Dr. {visit.assigned_clinician_name}</span>
          </div>
        )}

        {/* Chief Complaint */}
        {(visit.chief_complaint || visit.notes) && (
          <div className="text-sm">
            <span className="text-muted-foreground">Reason: </span>
            <span>{visit.chief_complaint || visit.notes}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          {visit.encounter ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleViewEncounter}
            >
              <FileText className="h-4 w-4 mr-1" />
              View Encounter
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleViewPatient}
            >
              <User className="h-4 w-4 mr-1" />
              View Patient
            </Button>
          )}
          <Button
            size="sm"
            className="flex-1"
            onClick={handleComplete}
            disabled={completing}
          >
            <CheckCircle className="h-4 w-4 mr-1" />
            Complete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
