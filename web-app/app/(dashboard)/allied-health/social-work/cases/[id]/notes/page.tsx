/**
 * Case Notes List Page
 * Shows all notes for a social work case.
 */

'use client';

import { useParams, useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { FileText, Plus, Clock, User } from 'lucide-react';
import { useSWCase, useCaseNotes } from '@/lib/hooks/use-social-work';

const CONTACT_METHOD_LABELS: Record<string, string> = {
  PHONE: 'Phone',
  IN_PERSON: 'In Person',
  HOME_VISIT: 'Home Visit',
  VIDEO_CALL: 'Video Call',
  EMAIL: 'Email',
  OTHER: 'Other',
};

export default function CaseNotesListPage() {
  const params = useParams();
  const router = useRouter();
  const caseId = Number(params.id);

  const { data: swCase } = useSWCase(caseId);
  const { data: notesData, isLoading } = useCaseNotes({ case_id: caseId });

  const notes = notesData?.results || [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Case Notes — ${swCase?.case_number || `Case #${caseId}`}`}
        helpContent="All notes recorded for this social work case, ordered by most recent."
        actions={
          swCase && !swCase.status.startsWith('CLOSED') ? (
            <Button
              onClick={() =>
                router.push(`/allied-health/social-work/cases/${caseId}/notes/new`)
              }
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Note
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : notes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No case notes recorded yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <Card
              key={note.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() =>
                router.push(`/allied-health/social-work/cases/${caseId}`)
              }
            >
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm truncate">
                      {note.author.full_name}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {CONTACT_METHOD_LABELS[note.contact_method] || note.contact_method}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="h-3 w-3" />
                    {format(parseISO(note.created_at), 'PPp')}
                  </div>
                </div>
                <p className="text-sm line-clamp-3">{note.note_content}</p>
                {note.follow_up_required && (
                  <div className="mt-2">
                    <Badge variant="secondary" className="text-xs">
                      Follow-up required
                      {note.follow_up_date &&
                        ` — ${format(parseISO(note.follow_up_date), 'PP')}`}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
