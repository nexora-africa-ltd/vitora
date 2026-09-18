// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Contact tracing detail page.
 *
 * Use this page to review and manage one traced contact, including workflow
 * transitions and follow-up recording.
 *
 * Inputs/args:
 * - Route param `id` (contact id)
 */

'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, HeartPulse, PhoneCall, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { surveillanceApi } from '@/lib/api/surveillance';
import { toast } from '@/lib/hooks/use-toast';
import { formatDate, formatDateTime } from '@/lib/utils/format';

export default function ContactTracingDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const contactId = Number(params?.id);

  const [followupForm, setFollowupForm] = useState({
    open: false,
    followup_date: new Date().toISOString().slice(0, 10),
    next_followup_date: '',
    method: 'PHONE' as 'PHONE' | 'HOME_VISIT' | 'SMS' | 'CLINIC',
    symptoms_present: false,
    temperature_c: '',
    notes: '',
    outcome: 'CONTINUE_MONITORING' as
      | 'CONTINUE_MONITORING'
      | 'ESCALATE_TESTING'
      | 'ESCALATE_ISOLATION'
      | 'CLEARED',
  });

  const { data: contact, isLoading } = useQuery({
    queryKey: ['surveillance-contact', contactId],
    queryFn: () => surveillanceApi.getContact(contactId),
    enabled: Number.isFinite(contactId),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['surveillance-contact', contactId] });
    queryClient.invalidateQueries({ queryKey: ['surveillance-contact-tracing-index'] });
    if (contact?.case) {
      queryClient.invalidateQueries({ queryKey: ['contact-tracing', contact.case] });
      queryClient.invalidateQueries({ queryKey: ['notifiable-case', contact.case] });
    }
  };

  const transitionMutation = useMutation({
    mutationFn: ({ action }: { action: 'mark_contacted' | 'start_monitoring' | 'mark_symptomatic' | 'mark_cleared' }) =>
      surveillanceApi.transitionContactStatus(contactId, action),
    onSuccess: () => {
      refresh();
      toast({ title: 'Status updated' });
    },
    onError: () => {
      toast({ title: 'Status update failed', variant: 'destructive' });
    },
  });

  const followupMutation = useMutation({
    mutationFn: () =>
      surveillanceApi.recordContactFollowup(contactId, {
        followup_date: followupForm.followup_date,
        next_followup_date: followupForm.next_followup_date || undefined,
        method: followupForm.method,
        symptoms_present: followupForm.symptoms_present,
        temperature_c: followupForm.temperature_c || undefined,
        notes: followupForm.notes || undefined,
        outcome: followupForm.outcome,
      }),
    onSuccess: () => {
      setFollowupForm((prev) => ({
        ...prev,
        open: false,
        notes: '',
        temperature_c: '',
        next_followup_date: '',
      }));
      refresh();
      toast({ title: 'Follow-up recorded' });
    },
    onError: () => {
      toast({ title: 'Could not save follow-up', variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={contact ? contact.full_name : 'Contact'}
        helpContent="Manage one traced contact and their follow-up workflow."
        actions={
          <Button variant="outline" asChild>
            <Link href="/surveillance/contact-tracing">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Contacts
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4 sm:p-6">
          {isLoading || !contact ? (
            <p className="text-sm text-muted-foreground">Loading contact...</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{contact.status}</Badge>
                <Badge variant={contact.risk_level === 'HIGH' ? 'destructive' : contact.risk_level === 'MEDIUM' ? 'warning' : 'secondary'}>
                  {contact.risk_level}
                </Badge>
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p>Case: {contact.case_disease_name} (#{contact.case})</p>
                <p>Phone: {contact.phone_number_masked || 'Not provided'}</p>
                <p>Relationship: {contact.relationship_to_case || 'Not specified'}</p>
                <p>Exposure: {contact.exposure_date ? formatDate(contact.exposure_date) : 'Unknown'}</p>
                <p>Last follow-up: {contact.last_followup_at ? formatDateTime(contact.last_followup_at) : 'Never'}</p>
                <p>
                  Next follow-up: {contact.next_followup_date ? formatDate(contact.next_followup_date) : 'Not scheduled'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {contact.status === 'IDENTIFIED' && (
                  <Button size="sm" variant="outline" onClick={() => transitionMutation.mutate({ action: 'mark_contacted' })}>
                    <PhoneCall className="mr-1 h-4 w-4" /> Mark Contacted
                  </Button>
                )}
                {contact.status === 'CONTACTED' && (
                  <Button size="sm" variant="outline" onClick={() => transitionMutation.mutate({ action: 'start_monitoring' })}>
                    <HeartPulse className="mr-1 h-4 w-4" /> Start Monitoring
                  </Button>
                )}
                {contact.status === 'UNDER_MONITORING' && (
                  <Button size="sm" variant="outline" onClick={() => transitionMutation.mutate({ action: 'mark_symptomatic' })}>
                    <UserRound className="mr-1 h-4 w-4" /> Mark Symptomatic
                  </Button>
                )}
                {(contact.status === 'UNDER_MONITORING' || contact.status === 'SYMPTOMATIC') && (
                  <Button size="sm" variant="outline" onClick={() => transitionMutation.mutate({ action: 'mark_cleared' })}>
                    <CheckCircle2 className="mr-1 h-4 w-4" /> Mark Cleared
                  </Button>
                )}
                <Button size="sm" onClick={() => setFollowupForm((prev) => ({ ...prev, open: !prev.open }))}>
                  {followupForm.open ? 'Close Follow-up' : 'Record Follow-up'}
                </Button>
              </div>

              {followupForm.open && (
                <div className="grid gap-3 rounded-md border border-border/60 p-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Follow-up Date</Label>
                    <Input type="date" value={followupForm.followup_date} onChange={(e) => setFollowupForm((prev) => ({ ...prev, followup_date: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Next Follow-up (optional)</Label>
                    <Input type="date" value={followupForm.next_followup_date} onChange={(e) => setFollowupForm((prev) => ({ ...prev, next_followup_date: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <Select value={followupForm.method} onValueChange={(value) => setFollowupForm((prev) => ({ ...prev, method: value as 'PHONE' | 'HOME_VISIT' | 'SMS' | 'CLINIC' }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PHONE">Phone</SelectItem>
                        <SelectItem value="HOME_VISIT">Home Visit</SelectItem>
                        <SelectItem value="SMS">SMS</SelectItem>
                        <SelectItem value="CLINIC">Clinic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Outcome</Label>
                    <Select value={followupForm.outcome} onValueChange={(value) => setFollowupForm((prev) => ({ ...prev, outcome: value as 'CONTINUE_MONITORING' | 'ESCALATE_TESTING' | 'ESCALATE_ISOLATION' | 'CLEARED' }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CONTINUE_MONITORING">Continue Monitoring</SelectItem>
                        <SelectItem value="ESCALATE_TESTING">Escalate Testing</SelectItem>
                        <SelectItem value="ESCALATE_ISOLATION">Escalate Isolation</SelectItem>
                        <SelectItem value="CLEARED">Cleared</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Temperature (optional)</Label>
                    <Input value={followupForm.temperature_c} onChange={(e) => setFollowupForm((prev) => ({ ...prev, temperature_c: e.target.value }))} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Notes</Label>
                    <Textarea value={followupForm.notes} onChange={(e) => setFollowupForm((prev) => ({ ...prev, notes: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2">
                    <Button onClick={() => followupMutation.mutate()} disabled={followupMutation.isPending}>
                      {followupMutation.isPending ? 'Saving...' : 'Save Follow-up'}
                    </Button>
                  </div>
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Follow-up History</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {contact.followups.length === 0 ? (
                    <p className="text-muted-foreground">No follow-up records yet.</p>
                  ) : (
                    contact.followups.map((entry) => (
                      <div key={entry.id} className="rounded-md border border-border/60 p-2">
                        <p className="font-medium">{formatDate(entry.followup_date)} - {entry.method}</p>
                        <p className="text-muted-foreground">Outcome: {entry.outcome}</p>
                        {entry.notes ? <p className="text-muted-foreground">{entry.notes}</p> : null}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
