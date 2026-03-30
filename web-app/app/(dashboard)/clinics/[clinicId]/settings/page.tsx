/**
 * Clinic Settings Page
 *
 * Manage clinic configuration, schedule, staff assignments, and eligibility rules.
 *
 * Route: /clinics/[clinicId]/settings
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Settings,
  Calendar,
  Users,
  Clock,
  Building2,
  ShieldCheck,
  Plus,
  X,
  Save,
  Loader2,
  Pencil,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { HelpPopover } from '@/components/shared/help-popover';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
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
  useClinics,
  useClinicSchedule,
  useClinicStaff,
  useUpdateClinic,
} from '@/lib/hooks/use-clinics';
import { toast } from '@/lib/hooks/use-toast';
import { ClinicNavigation } from '@/components/clinics/clinic-navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectEmpty,
} from '@/components/ui/select';
import type { ClinicEligibilityRules } from '@/lib/types/clinic';

const GENDER_OPTIONS = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
  { value: 'O', label: 'Other' },
] as const;

const COMMON_CONDITIONS = [
  'pregnancy',
  'diabetes',
  'hypertension',
  'hiv',
  'tuberculosis',
  'asthma',
  'epilepsy',
  'cancer',
  'chronic_kidney_disease',
  'sickle_cell',
] as const;

export default function ClinicSettingsPage() {
  const params = useParams();
  const clinicId = Number(params.clinicId);

  const { data: clinic, isLoading: clinicLoading } = useClinic(clinicId);
  const { data: schedule, isLoading: scheduleLoading } = useClinicSchedule(clinicId);
  const { data: staff, isLoading: staffLoading } = useClinicStaff(clinicId);
  const { data: allClinicsData } = useClinics({ page_size: 200, status: 'ACTIVE' });
  const { refresh, isRefreshing } = usePageRefresh();
  const updateClinic = useUpdateClinic();

  // Eligibility rules state
  const [eligibility, setEligibility] = useState<ClinicEligibilityRules>({});
  const [newCondition, setNewCondition] = useState('');
  const [eligibilityDirty, setEligibilityDirty] = useState(false);

  // Available clinics for enrollment picker (exclude current clinic)
  const availableClinics = (allClinicsData?.results ?? []).filter(
    (c) => c.id !== clinicId,
  );

  // Sync eligibility state when clinic loads
  useEffect(() => {
    if (clinic?.eligibility_rules) {
      setEligibility(clinic.eligibility_rules as ClinicEligibilityRules);
    } else {
      setEligibility({});
    }
    setEligibilityDirty(false);
  }, [clinic]);

  const updateEligibilityField = useCallback(<K extends keyof ClinicEligibilityRules>(
    key: K,
    value: ClinicEligibilityRules[K],
  ) => {
    setEligibility((prev) => ({ ...prev, [key]: value }));
    setEligibilityDirty(true);
  }, []);

  const handleGenderToggle = useCallback((gender: string, checked: boolean) => {
    setEligibility((prev) => {
      const current = prev.gender ?? [];
      const next = checked ? [...current, gender] : current.filter((g) => g !== gender);
      return { ...prev, gender: next.length > 0 ? next : undefined };
    });
    setEligibilityDirty(true);
  }, []);

  const addCondition = useCallback((condition: string) => {
    const trimmed = condition.trim();
    if (!trimmed) return;
    setEligibility((prev) => {
      if ((prev.conditions ?? []).includes(trimmed)) return prev;
      return { ...prev, conditions: [...(prev.conditions ?? []), trimmed] };
    });
    setNewCondition('');
    setEligibilityDirty(true);
  }, []);

  const removeCondition = useCallback((index: number) => {
    setEligibility((prev) => ({
      ...prev,
      conditions: (prev.conditions ?? []).filter((_, i) => i !== index),
    }));
    setEligibilityDirty(true);
  }, []);

  const addEnrollment = useCallback((code: string) => {
    if (!code) return;
    setEligibility((prev) => {
      if ((prev.required_enrollments ?? []).includes(code)) return prev;
      return { ...prev, required_enrollments: [...(prev.required_enrollments ?? []), code] };
    });
    setEligibilityDirty(true);
  }, []);

  const removeEnrollment = useCallback((index: number) => {
    setEligibility((prev) => ({
      ...prev,
      required_enrollments: (prev.required_enrollments ?? []).filter((_, i) => i !== index),
    }));
    setEligibilityDirty(true);
  }, []);

  const saveEligibility = useCallback(async () => {
    // Clean up empty arrays and undefined values
    const cleaned: ClinicEligibilityRules = {};
    if (eligibility.min_age !== undefined && eligibility.min_age !== null) cleaned.min_age = eligibility.min_age;
    if (eligibility.max_age !== undefined && eligibility.max_age !== null) cleaned.max_age = eligibility.max_age;
    if (eligibility.gender && eligibility.gender.length > 0) cleaned.gender = eligibility.gender;
    if (eligibility.conditions && eligibility.conditions.length > 0) cleaned.conditions = eligibility.conditions;
    if (eligibility.required_enrollments && eligibility.required_enrollments.length > 0) cleaned.required_enrollments = eligibility.required_enrollments;

    const hasRules = Object.keys(cleaned).length > 0;

    try {
      await updateClinic.mutateAsync({
        id: clinicId,
        data: { eligibility_rules: hasRules ? (cleaned as Record<string, unknown>) : null },
      });
      toast({ title: 'Eligibility rules saved' });
      setEligibilityDirty(false);
    } catch {
      toast({ title: 'Failed to save eligibility rules', variant: 'destructive' });
    }
  }, [eligibility, clinicId, updateClinic]);

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
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
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
          <TabsTrigger value="eligibility" className="gap-1.5 px-3 py-2">
            <ShieldCheck className="h-4 w-4" />
            <span>Eligibility</span>
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader className="p-3 sm:p-6 flex flex-row items-center justify-between">
              <CardTitle className="text-base sm:text-lg">Clinic Information</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/clinics/${clinicId}/edit`}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Link>
              </Button>
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
                <div className="flex items-center gap-2">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                      Sensitive
                    </Badge>
                    Sensitive Clinic
                  </CardTitle>
                  <HelpPopover content="This clinic handles sensitive patient data (HIV, GBV, Mental Health). Access requires special permissions." />
                </div>
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

        {/* Eligibility */}
        <TabsContent value="eligibility" className="space-y-4">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base sm:text-lg">Eligibility Rules</CardTitle>
                  <HelpPopover content="Define patient eligibility criteria for this clinic. When set, patients who don't meet these criteria will see a warning during routing and enrollment." />
                </div>
                <Button
                  size="sm"
                  onClick={saveEligibility}
                  disabled={!eligibilityDirty || updateClinic.isPending}
                >
                  {updateClinic.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 space-y-4 sm:space-y-6">
              {/* Age Restrictions */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Age Restrictions</Label>
                <p className="text-xs text-muted-foreground">Leave empty for no age restriction.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs sm:text-sm">Minimum Age (years)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={150}
                      placeholder="No minimum"
                      value={eligibility.min_age ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateEligibilityField('min_age', val === '' ? undefined : Number(val));
                      }}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs sm:text-sm">Maximum Age (years)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={150}
                      placeholder="No maximum"
                      value={eligibility.max_age ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateEligibilityField('max_age', val === '' ? undefined : Number(val));
                      }}
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              {/* Gender Restrictions */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Gender Restrictions</Label>
                <p className="text-xs text-muted-foreground">Select which genders are eligible. Leave all unchecked for no restriction.</p>
                <div className="flex flex-wrap gap-4">
                  {GENDER_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Checkbox
                        checked={(eligibility.gender ?? []).includes(option.value)}
                        onCheckedChange={(checked) =>
                          handleGenderToggle(option.value, checked === true)
                        }
                      />
                      <span className="text-sm">{option.label}</span>
                    </label>
                  ))}
                </div>
                {eligibility.gender && eligibility.gender.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {eligibility.gender
                        .map((g) => GENDER_OPTIONS.find((o) => o.value === g)?.label ?? g)
                        .join(', ')} only
                    </Badge>
                  </div>
                )}
              </div>

              {/* Required Conditions */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Required Conditions</Label>
                <p className="text-xs text-muted-foreground">Conditions a patient must have to be eligible for this clinic.</p>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_CONDITIONS.map((condition) => {
                    const isSelected = (eligibility.conditions ?? []).includes(condition);
                    return (
                      <button
                        key={condition}
                        type="button"
                        aria-label={isSelected ? `Remove ${condition}` : `Add ${condition}`}
                        onClick={() =>
                          isSelected
                            ? removeCondition((eligibility.conditions ?? []).indexOf(condition))
                            : addCondition(condition)
                        }
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                        }`}
                      >
                        {condition.replace(/_/g, ' ')}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Custom condition..."
                    value={newCondition}
                    onChange={(e) => setNewCondition(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCondition(newCondition);
                      }
                    }}
                    className="h-9"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addCondition(newCondition)}
                    disabled={!newCondition.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {(eligibility.conditions ?? []).filter((c) => !COMMON_CONDITIONS.includes(c as typeof COMMON_CONDITIONS[number])).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {eligibility.conditions!
                      .filter((c) => !COMMON_CONDITIONS.includes(c as typeof COMMON_CONDITIONS[number]))
                      .map((condition) => {
                        const origIndex = eligibility.conditions!.indexOf(condition);
                        return (
                          <Badge key={condition} variant="secondary" className="gap-1 pr-1">
                            {condition}
                            <button
                              type="button"
                              aria-label={`Remove ${condition}`}
                              onClick={() => removeCondition(origIndex)}
                              className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Required Enrollments */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Required Program Enrollments</Label>
                <p className="text-xs text-muted-foreground">Patient must be enrolled in these clinics/programs to be eligible.</p>
                <Select
                  value=""
                  onValueChange={(code) => addEnrollment(code)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select a clinic/program..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableClinics.length === 0 ? (
                      <SelectEmpty>No other clinics available</SelectEmpty>
                    ) : (
                      availableClinics
                        .filter((c) => !(eligibility.required_enrollments ?? []).includes(c.code))
                        .map((c) => (
                          <SelectItem key={c.id} value={c.code}>
                            {c.name} ({c.code})
                          </SelectItem>
                        ))
                    )}
                  </SelectContent>
                </Select>
                {(eligibility.required_enrollments ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {eligibility.required_enrollments!.map((code, i) => {
                      const matchedClinic = availableClinics.find((c) => c.code === code);
                      return (
                        <Badge key={code} variant="secondary" className="gap-1 pr-1">
                          {matchedClinic ? matchedClinic.name : code}
                          <button
                            type="button"
                            aria-label={`Remove ${matchedClinic?.name ?? code}`}
                            onClick={() => removeEnrollment(i)}
                            className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Summary */}
              {!eligibilityDirty && !clinic.eligibility_rules && (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <ShieldCheck className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No eligibility restrictions configured. All patients are eligible for this clinic.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </PullToRefresh>
  );
}
