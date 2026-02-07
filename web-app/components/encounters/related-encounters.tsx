/**
 * Related Encounters Component
 *
 * Displays encounters linked to a given encounter (follow-up visits).
 * Sprint 2 - Phase 2B: Encounter Linking
 */
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { encountersApi } from '@/lib/api/encounters';
import type { RelatedEncounter } from '@/lib/types/encounter';
import { EncounterStatusBadge } from './encounter-status-badge';
import { Link2, Calendar, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface RelatedEncountersProps {
  encounterId: number;
  patientId: number;
}

export function RelatedEncounters({ encounterId, patientId }: RelatedEncountersProps) {
  const [related, setRelated] = useState<RelatedEncounter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRelated = async () => {
      try {
        const data = await encountersApi.getRelated(encounterId);
        setRelated(data);
      } catch {
        setError('Failed to load related encounters');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRelated();
  }, [encounterId]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </CardContent>
      </Card>
    );
  }

  if (related.length === 0) {
    return null; // Don't show if no related encounters
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="h-4 w-4" />
          Related Visits ({related.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {related.map((encounter) => (
          <Link
            key={encounter.id}
            href={`/patients/${patientId}/encounters/${encounter.id}`}
            className="block"
          >
            <div className="flex items-center justify-between rounded-md border p-3 hover:bg-accent transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {encounter.encounter_type}
                  </Badge>
                  <EncounterStatusBadge status={encounter.status} size="sm" />
                </div>
                <p className="text-sm text-muted-foreground truncate max-w-[250px]">
                  {encounter.chief_complaint}
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {new Date(encounter.encounter_date).toLocaleDateString()}
              </div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
