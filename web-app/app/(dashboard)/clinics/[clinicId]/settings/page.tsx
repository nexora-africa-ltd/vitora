/**
 * Clinic Settings Page
 *
 * Manage clinic configuration, schedule, and staff assignments.
 *
 * Route: /clinics/[clinicId]/settings
 */
'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Settings,
  Calendar,
  Users,
  Clock,
  Building2,
  Save,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useClinic,
  useClinicSchedule,
  useClinicStaff,
} from '@/lib/hooks/use-clinics';
import { cn } from '@/lib/utils/cn';

const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export default function ClinicSettingsPage() {
  const params = useParams();
  const clinicId = Number(params.clinicId);

  const { data: clinic, isLoading: clinicLoading } = useClinic(clinicId);
  const { data: schedule, isLoading: scheduleLoading } = useClinicSchedule(clinicId);
  const { data: staff, isLoading: staffLoading } = useClinicStaff(clinicId);

  if (clinicLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Clinic not found</h3>
        <Button asChild>
          <Link href="/clinics">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Clinics
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/clinics/${clinicId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {clinic.name} Settings
          </h1>
          <p className="text-muted-foreground">
            Manage clinic configuration, schedule, and staff
          </p>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">
            <Settings className="h-4 w-4 mr-2" />
            General
          </TabsTrigger>
          <TabsTrigger value="schedule">
            <Calendar className="h-4 w-4 mr-2" />
            Schedule
          </TabsTrigger>
          <TabsTrigger value="staff">
            <Users className="h-4 w-4 mr-2" />
            Staff
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Clinic Information</CardTitle>
              <CardDescription>Basic clinic details and configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Clinic Name</Label>
                  <Input value={clinic.name} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Clinic Code</Label>
                  <Input value={clinic.code} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Clinic Type</Label>
                  <Input value={clinic.clinic_type_display} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input value={clinic.location || 'Not set'} disabled />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={clinic.description || 'No description'} disabled rows={3} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Operational Settings</CardTitle>
              <CardDescription>How the clinic operates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <Label>Requires Appointment</Label>
                    <p className="text-sm text-muted-foreground">
                      Patients need prior appointment
                    </p>
                  </div>
                  <Switch checked={clinic.requires_appointment} disabled />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <Label>Accepts Walk-ins</Label>
                    <p className="text-sm text-muted-foreground">
                      Walk-in patients accepted
                    </p>
                  </div>
                  <Switch checked={clinic.accepts_walk_ins} disabled />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <Label>Requires Referral</Label>
                    <p className="text-sm text-muted-foreground">
                      Patients need referral
                    </p>
                  </div>
                  <Switch checked={clinic.requires_referral} disabled />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <Label>Triage Required</Label>
                    <p className="text-sm text-muted-foreground">
                      Triage before clinic
                    </p>
                  </div>
                  <Switch checked={clinic.triage_required} disabled />
                </div>
              </div>
            </CardContent>
          </Card>

          {clinic.is_sensitive && (
            <Card className="border-yellow-500/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                    Sensitive
                  </Badge>
                  Sensitive Clinic
                </CardTitle>
                <CardDescription>
                  This clinic handles sensitive patient data (HIV, GBV, Mental Health).
                  Access is restricted to authorized personnel only.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </TabsContent>

        {/* Schedule */}
        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Operating Schedule</CardTitle>
              <CardDescription>
                Days and times when the clinic operates
              </CardDescription>
            </CardHeader>
            <CardContent>
              {scheduleLoading ? (
                <Skeleton className="h-48" />
              ) : !schedule || schedule.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold mb-2">No schedule configured</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Add operating hours for this clinic
                  </p>
                  <Button>
                    <Clock className="h-4 w-4 mr-2" />
                    Add Schedule
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day</TableHead>
                      <TableHead>Start Time</TableHead>
                      <TableHead>End Time</TableHead>
                      <TableHead>Max Patients</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedule.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">
                          {entry.day_of_week_display}
                        </TableCell>
                        <TableCell>{entry.start_time}</TableCell>
                        <TableCell>{entry.end_time}</TableCell>
                        <TableCell>{entry.max_patients}</TableCell>
                        <TableCell>
                          <Badge variant={entry.is_active ? 'default' : 'secondary'}>
                            {entry.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Staff */}
        <TabsContent value="staff" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Assigned Staff</CardTitle>
              <CardDescription>
                Healthcare workers assigned to this clinic
              </CardDescription>
            </CardHeader>
            <CardContent>
              {staffLoading ? (
                <Skeleton className="h-48" />
              ) : !staff || staff.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold mb-2">No staff assigned</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Assign healthcare workers to this clinic
                  </p>
                  <Button>
                    <Users className="h-4 w-4 mr-2" />
                    Assign Staff
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Primary</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{member.user_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {member.user_email}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{member.role_display}</Badge>
                        </TableCell>
                        <TableCell>
                          {member.is_primary && (
                            <Badge className="bg-blue-500">Primary</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {new Date(member.start_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={member.is_active ? 'default' : 'secondary'}>
                            {member.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
