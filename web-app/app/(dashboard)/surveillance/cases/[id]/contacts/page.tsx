// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Contact tracing workspace for a single surveillance case.
 * Use by navigating from a case detail page to manage contacts, status transitions,
 * and follow-up records. Inputs come from route param `id` and form fields on page.
 */

'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, HeartPulse, PhoneCall, Plus, UserRound } from 'lucide-react';
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

const RISK_VARIANT: Record<string, 'destructive' | 'warning' | 'secondary'> = {
  HIGH: 'destructive',
  MEDIUM: 'warning',
  LOW: 'secondary',
};

export default function CaseContactTracingPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const caseId = Number(params?.id);

  const [createForm, setCreateForm] = useState({
    full_name: '',
    phone_number: '',
    relationship_to_case: '',
    risk_level: 'MEDIUM' as 'HIGH' | 'MEDIUM' | 'LOW',
    exposure_date: '',
    notes: '',
  });

  const [followupForm, setFollowupForm] = useState({
    contactId: 0,
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

  const { data: caseData } = useQuery({
    queryKey: ['notifiable-case', caseId],
    queryFn: () => surveillanceApi.getNotifiableCase(caseId),
    enabled: Number.isFinite(caseId),
  });

  const { data: contactsData, isLoading } = useQuery({
    queryKey: ['contact-tracing', caseId],
    queryFn: () => surveillanceApi.listCaseContacts(caseId),
    enabled: Number.isFinite(caseId),
  });

  const contacts = contactsData?.results ?? [];

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['contact-tracing', caseId] });
    queryClient.invalidateQueries({ queryKey: ['notifiable-case', caseId] });
  };

  const createContactMutation = useMutation({
    mutationFn: () =>
      surveillanceApi.createCaseContact({
        case: caseId,
        full_name: createForm.full_name.trim(),
        phone_number: createForm.phone_number.trim() || undefined,
        relationship_to_case: createForm.relationship_to_case.trim() || undefined,
        risk_level: createForm.risk_level,
        exposure_date: createForm.exposure_date || undefined,
        notes: createForm.notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast({ title: 'Contact added', description: 'Contact tracing record created.' });
      setCreateForm({
        full_name: '',
        phone_number: '',
        relationship_to_case: '',
        risk_level: 'MEDIUM',
        exposure_date: '',
        notes: '',
      });
      refreshAll();
    },
    onError: () => {
      toast({
        title: 'Unable to add contact',
        description: 'Please review the form and try again.',
        variant: 'destructive',
      });
    },
  });

  const transitionMutation = useMutation({
    mutationFn: ({ contactId, action }: { contactId: number; action: 'mark_contacted' | 'start_monitoring' | 'mark_symptomatic' | 'mark_cleared' }) =>
      surveillanceApi.transitionContactStatus(contactId, action),
    onSuccess: () => {
      refreshAll();
      toast({ title: 'Status updated', description: 'Contact workflow status updated.' });
    },
    onError: () => {
      toast({ title: 'Status update failed', description: 'Try again shortly.', variant: 'destructive' });
    },
  });

  const followupMutation = useMutation({
    mutationFn: () =>
      surveillanceApi.recordContactFollowup(followupForm.contactId, {
        followup_date: followupForm.followup_date,
        next_followup_date: followupForm.next_followup_date || undefined,
        method: followupForm.method,
        symptoms_present: followupForm.symptoms_present,
        temperature_c: followupForm.temperature_c || undefined,
        notes: followupForm.notes || undefined,
        outcome: followupForm.outcome,
      }),
    onSuccess: () => {
      toast({ title: 'Follow-up saved', description: 'Contact follow-up was recorded.' });
      setFollowupForm((prev) => ({
        ...prev,
        contactId: 0,
        notes: '',
        temperature_c: '',
        next_followup_date: '',
      }));
      refreshAll();
    },
    onError: () => {
      toast({ title: 'Unable to save follow-up', description: 'Check required fields and retry.', variant: 'destructive' });
    },
  });

  const canCreate = createForm.full_name.trim().length > 0;

  const statusCounts = useMemo(() => {
    return contacts.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === 'UNDER_MONITORING') {
          acc.monitoring += 1;
        }
        if (item.status === 'SYMPTOMATIC') {
          acc.symptomatic += 1;
        }
        return acc;
      },
      { total: 0, monitoring: 0, symptomatic: 0 }
    );
  }, [contacts]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Contact Tracing"
        helpContent="Register exposed contacts, move them through tracing workflow states, and record follow-up outcomes."
        actions={
          <Button variant="outline" asChild>
            <Link href={`/surveillance/cases/${caseId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Case
            </Link>
          </Button>
        }
      />

      <Card className="p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{caseData?.disease_name || 'Case'} contact tracing</p>
            <p className="text-sm text-muted-foreground">Case #{caseId}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">Total: {statusCounts.total}</Badge>
            <Badge variant="info">Monitoring: {statusCounts.monitoring}</Badge>
            <Badge variant="destructive">Symptomatic: {statusCounts.symptomatic}</Badge>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Add Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              value={createForm.full_name}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, full_name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone_number">Phone Number</Label>
            <Input
              id="phone_number"
              value={createForm.phone_number}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, phone_number: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="relationship_to_case">Relationship</Label>
            <Input
              id="relationship_to_case"
              value={createForm.relationship_to_case}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, relationship_to_case: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Risk Level</Label>
            <Select
              value={createForm.risk_level}
              onValueChange={(value) =>
                setCreateForm((prev) => ({ ...prev, risk_level: value as 'HIGH' | 'MEDIUM' | 'LOW' }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exposure_date">Exposure Date</Label>
            <Input
              id="exposure_date"
              type="date"
              value={createForm.exposure_date}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, exposure_date: e.target.value }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={createForm.notes}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              onClick={() => createContactMutation.mutate()}
              disabled={!canCreate || createContactMutation.isPending}
            >
              <Plus className="mr-2 h-4 w-4" />
              {createContactMutation.isPending ? 'Adding...' : 'Add Contact'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Contacts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading contacts...</p>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contacts have been recorded yet.</p>
          ) : (
            contacts.map((contact) => (
              <div key={contact.id} className="space-y-3 rounded-lg border border-border/70 p-3 sm:p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{contact.full_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {contact.relationship_to_case || 'Relationship not specified'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={RISK_VARIANT[contact.risk_level] || 'secondary'}>
                      {contact.risk_level}
                    </Badge>
                    <Badge variant="info">{contact.status}</Badge>
                  </div>
                </div>

                <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                  <p>Phone: {contact.phone_number_masked || 'Not provided'}</p>
                  <p>
                    Exposure: {contact.exposure_date ? formatDate(contact.exposure_date) : 'Unknown'}
                  </p>
                  <p>
                    Last follow-up:{' '}
                    {contact.last_followup_at ? formatDateTime(contact.last_followup_at) : 'Not yet'}
                  </p>
                  <p>
                    Next follow-up:{' '}
                    {contact.next_followup_date ? formatDate(contact.next_followup_date) : 'Not scheduled'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {contact.status === 'IDENTIFIED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        transitionMutation.mutate({ contactId: contact.id, action: 'mark_contacted' })
                      }
                    >
                      <PhoneCall className="mr-1 h-4 w-4" /> Mark Contacted
                    </Button>
                  )}

                  {contact.status === 'CONTACTED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        transitionMutation.mutate({ contactId: contact.id, action: 'start_monitoring' })
                      }
                    >
                      <HeartPulse className="mr-1 h-4 w-4" /> Start Monitoring
                    </Button>
                  )}

                  {(contact.status === 'UNDER_MONITORING' || contact.status === 'SYMPTOMATIC') && (
                    <>
                      {contact.status === 'UNDER_MONITORING' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            transitionMutation.mutate({
                              contactId: contact.id,
                              action: 'mark_symptomatic',
                            })
                          }
                        >
                          <UserRound className="mr-1 h-4 w-4" /> Mark Symptomatic
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          transitionMutation.mutate({ contactId: contact.id, action: 'mark_cleared' })
                        }
                      >
                        <CheckCircle2 className="mr-1 h-4 w-4" /> Mark Cleared
                      </Button>
                    </>
                  )}

                  <Button
                    size="sm"
                    onClick={() =>
                      setFollowupForm((prev) => ({
                        ...prev,
                        contactId: contact.id,
                      }))
                    }
                  >
                    Record Follow-up
                  </Button>
                </div>

                {followupForm.contactId === contact.id && (
                  <div className="grid gap-3 rounded-md border border-border/60 p-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Follow-up Date</Label>
                      <Input
                        type="date"
                        value={followupForm.followup_date}
                        onChange={(e) =>
                          setFollowupForm((prev) => ({ ...prev, followup_date: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Method</Label>
                      <Select
                        value={followupForm.method}
                        onValueChange={(value) =>
                          setFollowupForm((prev) => ({
                            ...prev,
                            method: value as 'PHONE' | 'HOME_VISIT' | 'SMS' | 'CLINIC',
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PHONE">Phone</SelectItem>
                          <SelectItem value="HOME_VISIT">Home Visit</SelectItem>
                          <SelectItem value="SMS">SMS</SelectItem>
                          <SelectItem value="CLINIC">Clinic</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Next Follow-up (optional)</Label>
                      <Input
                        type="date"
                        value={followupForm.next_followup_date}
                        onChange={(e) =>
                          setFollowupForm((prev) => ({
                            ...prev,
                            next_followup_date: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Outcome</Label>
                      <Select
                        value={followupForm.outcome}
                        onValueChange={(value) =>
                          setFollowupForm((prev) => ({
                            ...prev,
                            outcome: value as
                              | 'CONTINUE_MONITORING'
                              | 'ESCALATE_TESTING'
                              | 'ESCALATE_ISOLATION'
                              | 'CLEARED',
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
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
                      <Input
                        value={followupForm.temperature_c}
                        onChange={(e) =>
                          setFollowupForm((prev) => ({ ...prev, temperature_c: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Notes</Label>
                      <Textarea
                        value={followupForm.notes}
                        onChange={(e) =>
                          setFollowupForm((prev) => ({ ...prev, notes: e.target.value }))
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Button
                        onClick={() => followupMutation.mutate()}
                        disabled={followupMutation.isPending}
                      >
                        {followupMutation.isPending ? 'Saving...' : 'Save Follow-up'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Button variant="ghost" onClick={() => router.push(`/surveillance/cases/${caseId}`)}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Case
      </Button>
    </div>
  );
}
