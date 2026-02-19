/**
 * Clinic Settings Page
 *
 * Manage clinic configuration, schedule, and staff assignments.
 *
 * Route: /clinics/[clinicId]/settings
 */
'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Settings,
  Calendar,
  Users,
  Clock,
  Building2,
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
import { ClinicNavigation } from '@/components/clinics/clinic-navigation';

export default function ClinicSettingsPage() {
  const params = useParams();
  const clinicId = Number(params.clinicId);

  const { data: clinic, isLoading: clinicLoading } = useClinic(clinicId);
  const { data: schedule, isLoading: scheduleLoading } = useClinicSchedule(clinicId);
  const { data: staff, isLoading: staffLoading } = useClinicStaff(clinicId);

  if (clinicLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 sm:h-96" />
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="flex flex-col items-center justify-center py-8 sm:py-12">
        <Building2 className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-4" />
        <h3 className="text-base sm:text-lg font-semibold mb-2">Clinic not found</h3>
        <Button asChild size="sm">
          <Link href="/clinics">Back to Clinics</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`${clinic.name} Settings`}
        helpContent="Manage clinic configuration, schedule, and staff assignments."
      />

      {/* Navigation */}
      <ClinicNavigation clinicId={clinicId} />

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="h-auto flex-wrap gap-1 p-1">
          <TabsTrigger value="general" className="gap-1.5 px-3 py-2">
            <Settings className="h-4 w-4" />
            <span>General</span>
          </TabsTrigger>
          <TabsTrigger value="schedule" className="gap-1.5 px-3 py-2">
            <Calendar className="h-4 w-4" />
            <span>Schedule</span>
          </TabsTrigger>
          <TabsTrigger value="staff" className="gap-1.5 px-3 py-2">
            <Users className="h-4 w-4" />
            <span>Staff</span>
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Clinic Information</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 space-y-4">
              <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">Clinic Name</Label>
                  <Input value={clinic.name} disabled className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">Clinic Code</Label>
                  <Input value={clinic.code} disabled className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">Clinic Type</Label>
                  <Input value={clinic.clinic_type_display} disabled className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">Location</Label>
                  <Input value={clinic.location || 'Not set'} disabled className="h-9" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Description</Label>
                <Textarea value={clinic.description || 'No description'} disabled rows={2} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Operational Settings</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 space-y-3 sm:space-y-4">
              <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label className="text-sm">Requires Appointment</Label>
                    <p className="text-xs text-muted-foreground hidden sm:block">Patients need prior appointment</p>
                  </div>
                  <Switch checked={clinic.requires_appointment} disabled />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label className="text-sm">Accepts Walk-ins</Label>
                    <p className="text-xs text-muted-foreground hidden sm:block">Walk-in patients accepted</p>
                  </div>
                  <Switch checked={clinic.accepts_walk_ins} disabled />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label className="text-sm">Requires Referral</Label>
                    <p className="text-xs text-muted-foreground hidden sm:block">Patients need referral</p>
                  </div>
                  <Switch checked={clinic.requires_referral} disabled />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label className="text-sm">Triage Required</Label>
                    <p className="text-xs text-muted-foreground hidden sm:block">Triage before clinic</p>
                  </div>
                  <Switch checked={clinic.triage_required} disabled />
                </div>
              </div>
            </CardContent>
          </Card>

          {clinic.is_sensitive && (
            <Card className="border-yellow-500/50">
              <CardHeader className="p-3 sm:p-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                    Sensitive
                  </Badge>
                  Sensitive Clinic
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  This clinic handles sensitive patient data (HIV, GBV, Mental Health).
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </TabsContent>

        {/* Schedule */}
        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Operating Schedule</CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              {scheduleLoading ? (
                <Skeleton className="h-32 sm:h-48 mx-3 sm:mx-0\" />
              ) : !schedule || schedule.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-center">
                  <Calendar className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold mb-2 text-sm sm:text-base">No schedule</h3>
                  <Button size="sm" asChild>
                    <Link href={`/clinics/${clinicId}/schedule`}>
                      <Clock className="h-4 w-4 mr-2" />
                      Add Schedule
                    </Link>
                  </Button>
                </div>
              ) : (
                <>
                  {/* Mobile Cards */}
                  <div className="sm:hidden space-y-2 px-3 pb-3">
                    {schedule.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <span className="font-medium text-sm">{entry.day_display}</span>
                          <p className="text-xs text-muted-foreground">{entry.start_time} - {entry.end_time}</p>
                        </div>
                        <Badge variant={entry.is_active ? 'default' : 'secondary'} className="text-xs">
                          {entry.is_active ? 'Active' : 'Off'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  {/* Desktop Table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Day</TableHead>
                          <TableHead>Start</TableHead>
                          <TableHead>End</TableHead>
                          <TableHead>Max</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {schedule.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-medium">{entry.day_display}</TableCell>
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
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Staff */}
        <TabsContent value="staff" className="space-y-4">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Assigned Staff</CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              {staffLoading ? (
                <Skeleton className="h-32 sm:h-48 mx-3 sm:mx-0" />
              ) : !staff || staff.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-center">
                  <Users className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold mb-2 text-sm sm:text-base">No staff</h3>
                  <Button size="sm" asChild>
                    <Link href={`/clinics/${clinicId}/staff`}>
                      <Users className="h-4 w-4 mr-2" />
                      Assign Staff
                    </Link>
                  </Button>
                </div>
              ) : (
                <>
                  {/* Mobile Cards */}
                  <div className="sm:hidden space-y-2 px-3 pb-3">
                    {staff.map((member) => (
                      <div key={member.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{member.user_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{member.user_email}</p>
                          </div>
                          <Badge variant={member.is_active ? 'default' : 'secondary'} className="text-xs shrink-0 ml-2">
                            {member.is_active ? 'Active' : 'Off'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">{member.role_display}</Badge>
                          {member.is_primary && <Badge className="bg-blue-500 text-xs">Primary</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop Table */}
                  <div className="hidden sm:block overflow-x-auto">
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
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
