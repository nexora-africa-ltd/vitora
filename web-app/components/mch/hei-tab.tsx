'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Shield, AlertTriangle, Loader2, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HelpPopover } from '@/components/shared/help-popover';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';
import { heiFollowUpApi } from '@/lib/api/mch';
import type {
  HEIStatus,
  HEIFollowUpCreateData,
  MotherARTStatus,
  InfantARVProphylaxis,
  HEIBreastfeedingStatus,
  PCRResult,
} from '@/lib/types/mch';

interface HEITabProps {
  registrationId: number;
  infantId?: number | null;
}

const statusColors: Record<HEIStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  CONFIRMED_NEGATIVE: 'bg-blue-100 text-blue-800',
  CONFIRMED_POSITIVE: 'bg-red-100 text-red-800',
  LOST_TO_FOLLOW_UP: 'bg-orange-100 text-orange-800',
  TRANSFERRED: 'bg-yellow-100 text-yellow-800',
  DECEASED: 'bg-gray-100 text-gray-800',
};

const pcrResultColors: Record<PCRResult, string> = {
  POSITIVE: 'bg-red-100 text-red-800',
  NEGATIVE: 'bg-green-100 text-green-800',
  INDETERMINATE: 'bg-yellow-100 text-yellow-800',
  PENDING: 'bg-blue-100 text-blue-800',
};

const ART_OPTIONS: { value: MotherARTStatus; label: string }[] = [
  { value: 'ON_ART', label: 'On ART' },
  { value: 'NOT_ON_ART', label: 'Not on ART' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

const ARV_OPTIONS: { value: InfantARVProphylaxis; label: string }[] = [
  { value: 'NONE', label: 'None selected' },
  { value: 'NVP', label: 'Nevirapine (NVP)' },
  { value: 'AZT', label: 'Zidovudine (AZT)' },
  { value: 'NVP_AZT', label: 'NVP + AZT' },
];

const FEEDING_OPTIONS: { value: HEIBreastfeedingStatus; label: string }[] = [
  { value: 'EXCLUSIVE', label: 'Exclusive Breastfeeding' },
  { value: 'MIXED', label: 'Mixed Feeding' },
  { value: 'FORMULA', label: 'Formula Only' },
  { value: 'STOPPED', label: 'Stopped' },
];

export function HEITab({ registrationId, infantId }: HEITabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [pcrDialogOpen, setPcrDialogOpen] = useState(false);

  // Enroll form state
  const [enrollmentDate, setEnrollmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [motherArt, setMotherArt] = useState<MotherARTStatus>('ON_ART');
  const [infantArv, setInfantArv] = useState<InfantARVProphylaxis>('NONE');
  const [feedingStatus, setFeedingStatus] = useState<HEIBreastfeedingStatus>('EXCLUSIVE');
  const [notes, setNotes] = useState('');

  // PCR form state
  const [pcrHeiId, setPcrHeiId] = useState<number | null>(null);
  const [testNumber, setTestNumber] = useState('1');
  const [actualDate, setActualDate] = useState(new Date().toISOString().split('T')[0]);
  const [pcrResult, setPcrResult] = useState<PCRResult>('PENDING');
  const [labReference, setLabReference] = useState('');
  const [pcrNotes, setPcrNotes] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['hei-followups', infantId],
    queryFn: () => heiFollowUpApi.list({ infant: infantId! }),
    enabled: !!infantId,
  });

  const followups = data?.results || [];

  const createMutation = useMutation({
    mutationFn: (data: HEIFollowUpCreateData) => heiFollowUpApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hei-followups', infantId] });
      toast({ title: 'HEI Follow-up Created' });
      setEnrollDialogOpen(false);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create HEI follow-up.', variant: 'destructive' });
    },
  });

  const pcrMutation = useMutation({
    mutationFn: () =>
      heiFollowUpApi.recordPCR(pcrHeiId!, {
        test_number: parseInt(testNumber),
        actual_date: actualDate!,
        result: pcrResult,
        lab_reference: labReference,
        notes: pcrNotes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hei-followups', infantId] });
      toast({ title: 'PCR Test Recorded' });
      setPcrDialogOpen(false);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to record PCR test.', variant: 'destructive' });
    },
  });

  const handleEnroll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!infantId) return;
    createMutation.mutate({
      infant: infantId,
      mch_registration: registrationId,
      enrollment_date: enrollmentDate,
      mother_art_status: motherArt,
      infant_arv_prophylaxis: infantArv,
      breastfeeding_status: feedingStatus,
      notes,
    });
  };

  if (!infantId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          HEI follow-up requires a linked baby. Record a delivery first.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (error) {
    return <div className="text-destructive">Failed to load HEI follow-up records.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">HEI Follow-up</h3>
          <HelpPopover content="HIV-Exposed Infant follow-up tracking. Monitor PCR tests at 6 weeks, 9 months, and 18 months. Track ARV prophylaxis and feeding status." />
        </div>
        {followups.length === 0 && (
          <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Enroll in HEI
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Enroll Infant in HEI Follow-up</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleEnroll} className="space-y-4">
                <div className="space-y-2">
                  <Label>Enrollment Date</Label>
                  <Input
                    type="date"
                    value={enrollmentDate}
                    onChange={(e) => setEnrollmentDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mother ART Status</Label>
                  <Select value={motherArt} onValueChange={(v) => setMotherArt(v as MotherARTStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ART_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Infant ARV Prophylaxis</Label>
                  <Select value={infantArv} onValueChange={(v) => setInfantArv(v as InfantARVProphylaxis)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ARV_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Breastfeeding Status</Label>
                  <Select value={feedingStatus} onValueChange={(v) => setFeedingStatus(v as HEIBreastfeedingStatus)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {FEEDING_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setEnrollDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Enroll
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {followups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No HEI follow-up enrollment yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {followups.map((hei) => (
            <Card key={hei.id}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    HEI {hei.hei_number}
                  </CardTitle>
                  <Badge className={statusColors[hei.status]}>
                    {hei.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Enrolled {formatDate(hei.enrollment_date)}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Mother ART:</span>{' '}
                    {hei.mother_art_status.replace(/_/g, ' ')}
                  </div>
                  <div>
                    <span className="text-muted-foreground">ARV Prophylaxis:</span>{' '}
                    {hei.infant_arv_prophylaxis || 'N/A'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Feeding:</span>{' '}
                    {hei.breastfeeding_status?.replace(/_/g, ' ') || 'N/A'}
                  </div>
                </div>

                {/* PCR Test button */}
                {hei.status === 'ACTIVE' && (
                  <div className="flex justify-end">
                    <Dialog open={pcrDialogOpen} onOpenChange={setPcrDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() => setPcrHeiId(hei.id)}
                        >
                          <FlaskConical className="h-4 w-4" />
                          Record PCR Test
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Record PCR Test</DialogTitle>
                        </DialogHeader>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            pcrMutation.mutate();
                          }}
                          className="space-y-4"
                        >
                          <div className="space-y-2">
                            <Label>Test Number</Label>
                            <Select value={testNumber} onValueChange={setTestNumber}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1 — 6 weeks</SelectItem>
                                <SelectItem value="2">2 — 9 months</SelectItem>
                                <SelectItem value="3">3 — Confirmatory (18 months)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Test Date</Label>
                            <Input
                              type="date"
                              value={actualDate}
                              onChange={(e) => setActualDate(e.target.value)}
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Result</Label>
                            <Select value={pcrResult} onValueChange={(v) => setPcrResult(v as PCRResult)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="PENDING">Pending</SelectItem>
                                <SelectItem value="NEGATIVE">Negative</SelectItem>
                                <SelectItem value="POSITIVE">Positive</SelectItem>
                                <SelectItem value="INDETERMINATE">Indeterminate</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Lab Reference</Label>
                            <Input
                              value={labReference}
                              onChange={(e) => setLabReference(e.target.value)}
                              placeholder="Lab reference number"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Notes</Label>
                            <Textarea
                              value={pcrNotes}
                              onChange={(e) => setPcrNotes(e.target.value)}
                              rows={2}
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setPcrDialogOpen(false)}>
                              Cancel
                            </Button>
                            <Button type="submit" disabled={pcrMutation.isPending}>
                              {pcrMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Record Test
                            </Button>
                          </div>
                        </form>
                      </DialogContent>
                    </Dialog>
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
