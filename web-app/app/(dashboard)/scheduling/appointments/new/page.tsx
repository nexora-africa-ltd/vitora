'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Loader2, Search, CalendarDays } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { appointmentsApi, resourcesApi } from '@/lib/api/scheduling';
import { patientsApi } from '@/lib/api/patients';
import type { AppointmentType, AppointmentPriority, AppointmentCreateData, AvailabilitySlot } from '@/lib/types/scheduling';

const TYPE_OPTIONS: { value: AppointmentType; label: string }[] = [
  { value: 'CONSULTATION', label: 'Consultation' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'PROCEDURE', label: 'Procedure' },
  { value: 'LAB_TEST', label: 'Lab Test' },
  { value: 'IMAGING', label: 'Imaging' },
  { value: 'VACCINATION', label: 'Vaccination' },
  { value: 'THERAPY', label: 'Therapy' },
  { value: 'OTHER', label: 'Other' },
];

const PRIORITY_OPTIONS: { value: AppointmentPriority; label: string }[] = [
  { value: 'ROUTINE', label: 'Routine' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'EMERGENCY', label: 'Emergency' },
];

export default function NewAppointmentPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Patient search
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [selectedPatientName, setSelectedPatientName] = useState('');

  // Resource
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(null);

  // Appointment fields
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('CONSULTATION');
  const [priority, setPriority] = useState<AppointmentPriority>('ROUTINE');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  // Patient search query
  const { data: patientResults } = useQuery({
    queryKey: ['patient-search', patientSearch],
    queryFn: () => patientsApi.getPatients({ search: patientSearch, page_size: 10 }),
    enabled: patientSearch.length >= 2,
  });

  // Resources list
  const { data: resourceData, isLoading: resourcesLoading } = useQuery({
    queryKey: ['scheduling-resources-all'],
    queryFn: () => resourcesApi.list({ is_active: true, page_size: 200, ordering: 'resource_type,name' }),
  });

  // Availability for selected resource + date
  const { data: availability } = useQuery({
    queryKey: ['resource-availability', selectedResourceId, date],
    queryFn: () => resourcesApi.getAvailability(selectedResourceId!, date),
    enabled: !!selectedResourceId && !!date,
  });

  const resources = resourceData?.results || [];
  const slots = availability?.slots || [];

  const createMutation = useMutation({
    mutationFn: (data: AppointmentCreateData) => appointmentsApi.create(data),
    onSuccess: (apt) => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-appointments'] });
      toast({ title: 'Appointment Created', description: `${apt.appointment_number} scheduled.` });
      router.push(`/scheduling/appointments/${apt.id}`);
    },
    onError: (err: Error & { response?: { data?: Record<string, string[]> } }) => {
      const detail = err.response?.data;
      const msg = detail
        ? Object.values(detail).flat().join('; ')
        : 'Failed to create appointment.';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  function handleSlotSelect(slot: AvailabilitySlot) {
    setStartTime(slot.start_time);
    setEndTime(slot.end_time);
  }

  function handleSubmit() {
    if (!selectedPatientId || !selectedResourceId || !date || !startTime || !endTime || !reason.trim()) {
      toast({ title: 'Validation', description: 'Please fill all required fields.', variant: 'destructive' });
      return;
    }

    const scheduledStart = `${date}T${startTime}`;
    const scheduledEnd = `${date}T${endTime}`;

    createMutation.mutate({
      patient: selectedPatientId,
      resource: selectedResourceId,
      appointment_type: appointmentType,
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      reason,
      notes,
      priority,
    });
  }

  const canSubmit =
    !!selectedPatientId && !!selectedResourceId && !!date && !!startTime && !!endTime && !!reason.trim();

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Appointment"
        helpContent="Schedule a new appointment. Search for a patient, select a resource and date, then pick an available slot."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Patient Selection */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Patient</CardTitle>
              <HelpPopover content="Search by name or MRN to find the patient." />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patient by name or MRN..."
                className="pl-8"
                value={patientSearch}
                onChange={(e) => {
                  setPatientSearch(e.target.value);
                  if (!e.target.value) {
                    setSelectedPatientId(null);
                    setSelectedPatientName('');
                  }
                }}
              />
            </div>
            {selectedPatientId ? (
              <div className="p-2 rounded-md bg-primary/10 flex items-center justify-between">
                <span className="text-sm font-medium">{selectedPatientName}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedPatientId(null);
                    setSelectedPatientName('');
                    setPatientSearch('');
                  }}
                >
                  Change
                </Button>
              </div>
            ) : patientResults?.results && patientResults.results.length > 0 ? (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {patientResults.results.map((p) => (
                  <div
                    key={p.id}
                    className="p-2 rounded-md hover:bg-muted cursor-pointer text-sm"
                    onClick={() => {
                      setSelectedPatientId(p.id);
                      setSelectedPatientName(`${p.first_name} ${p.last_name} (${p.mrn})`);
                      setPatientSearch('');
                    }}
                  >
                    <span className="font-medium">{p.first_name} {p.last_name}</span>
                    <span className="text-muted-foreground ml-2">{p.mrn}</span>
                  </div>
                ))}
              </div>
            ) : patientSearch.length >= 2 ? (
              <p className="text-sm text-muted-foreground">No patients found.</p>
            ) : null}
          </CardContent>
        </Card>

        {/* Appointment Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Appointment Type</Label>
              <Select value={appointmentType} onValueChange={(v) => setAppointmentType(v as AppointmentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as AppointmentPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason *</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for appointment..."
                rows={2}
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes (optional)..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Resource & Scheduling */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Resource & Time</CardTitle>
              <HelpPopover content="Select a resource and date to see available time slots." />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label>Resource *</Label>
                <Select
                  value={selectedResourceId?.toString() || ''}
                  onValueChange={(v) => setSelectedResourceId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select resource..." />
                  </SelectTrigger>
                  <SelectContent>
                    {resourcesLoading ? (
                      <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading resources...
                      </div>
                    ) : resources.length === 0 ? (
                      <div className="py-4 text-center text-sm text-muted-foreground">
                        No resources available. Create one in{' '}
                        <a href="/scheduling/resources" className="underline text-primary">
                          Resources
                        </a>.
                      </div>
                    ) : (
                      resources.map((r) => (
                        <SelectItem key={r.id} value={r.id.toString()}>
                          {r.name} ({r.resource_type})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>Start *</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <Label>End *</Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Available Slots */}
            {selectedResourceId && date && (
              <div>
                <p className="text-sm font-medium mb-2">
                  Available Slots
                  {availability && (
                    <span className="text-muted-foreground font-normal"> ({slots.length} available)</span>
                  )}
                </p>
                {slots.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {slots.map((slot, i) => {
                      const isSelected = slot.start_time === startTime && slot.end_time === endTime;
                      return (
                        <Badge
                          key={i}
                          variant={isSelected ? 'default' : 'outline'}
                          className="cursor-pointer px-3 py-1.5"
                          onClick={() => handleSlotSelect(slot)}
                        >
                          {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
                        </Badge>
                      );
                    })}
                  </div>
                ) : availability ? (
                  <p className="text-sm text-muted-foreground">
                    No available slots for this date. You can still enter times manually.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Loading availability...</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Submit */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit || createMutation.isPending}>
          {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Schedule Appointment
        </Button>
      </div>
    </div>
  );
}
