/**
 * Edit Staff Profile Page
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 *
 * Edit an existing staff profile with role and department assignment.
 */
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Save, User, Building2, Shield, Briefcase, Phone, Mail, IdCard, AlertTriangle, Users, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DatePicker } from '@/components/ui/date-picker';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectEmpty,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MultiSelect,
  MultiSelectTrigger,
  MultiSelectContent,
  MultiSelectInput,
  MultiSelectList,
  MultiSelectGroup,
  MultiSelectItem,
  MultiSelectEmpty,
} from '@/components/kibo-ui/multi-select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/lib/hooks/use-toast';
import { useStaffProfile, useUpdateStaffProfile, useDeleteStaffProfile, useDepartments, useRoles, useStaffList, useOrgMemberships, useCreateOrgMembership, useUpdateOrgMembership, useDeleteOrgMembership } from '@/lib/hooks/use-rbac';
import { facilitiesApi } from '@/lib/api/facilities';
import { DHAPractitionerSearch } from '@/components/sha/practitioner-search';
import type { DHAPractitioner } from '@/lib/types/sha';

export default function EditStaffPage() {
  const router = useRouter();
  const params = useParams();
  const staffId = parseInt(params.id as string);
  const { toast } = useToast();

  const { data: staff, isLoading, error } = useStaffProfile(staffId);
  const updateStaff = useUpdateStaffProfile();
  const terminateStaff = useDeleteStaffProfile();
  const { data: orgMemberships } = useOrgMemberships({ staff_profile: staffId });
  const createMembership = useCreateOrgMembership();
  const updateMembership = useUpdateOrgMembership();
  const deleteMembership = useDeleteOrgMembership();

  const { data: departments } = useDepartments({ is_active: true, page_size: 100 });
  const { data: roles } = useRoles({ page_size: 100 });
  const { data: facilities } = useQuery({
    queryKey: ['facilities-list'],
    queryFn: () => facilitiesApi.list({ page_size: 100 }),
  });
  const { data: staffList } = useStaffList({ page_size: 200, employment_status: 'ACTIVE' });

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    employee_id: '',
    department: '',
    role: '',
    primary_facility: '',
    phone_number: '',
    license_number: '',
    license_expiry: '',
    specialization: '',
    hwr_national_id: '',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [secondaryDepartments, setSecondaryDepartments] = useState<string[]>([]);
  const [secondaryFacilities, setSecondaryFacilities] = useState<string[]>([]);
  const [supervisor, setSupervisor] = useState<string>('');
  const [membershipForm, setMembershipForm] = useState({
    role: '',
    department: '',
    status: 'ACTIVE',
    facilities: [] as string[],
  });
  const [membershipErrors, setMembershipErrors] = useState<Record<string, string>>({});
  const [hwrPopulated, setHwrPopulated] = useState(false);

  // Load staff data into form
  useEffect(() => {
    if (staff) {
      setFormData({
        email: staff.user_email || '',
        first_name: staff.user_first_name || '',
        last_name: staff.user_last_name || '',
        employee_id: staff.employee_id || '',
        department: staff.primary_department?.toString() || '',
        role: staff.primary_role?.toString() || '',
        primary_facility: staff.primary_facility?.toString() || '',
        phone_number: staff.phone_number || '',
        license_number: staff.license_number || '',
        license_expiry: staff.license_expiry || '',
        specialization: staff.specialization || '',
        hwr_national_id: staff.hwr_national_id || '',
      });
      setSecondaryDepartments(
        (staff.secondary_departments ?? []).map(String)
      );
      setSecondaryFacilities(
        (staff.secondary_facilities ?? []).map(String)
      );
      setSupervisor(staff.supervisor?.toString() || '');
    }
  }, [staff]);

  const currentMembership = orgMemberships?.results?.[0] ?? null;

  useEffect(() => {
    if (currentMembership) {
      setMembershipForm({
        role: currentMembership.role.toString(),
        department: currentMembership.department?.toString() || '',
        status: currentMembership.status,
        facilities: currentMembership.facility_ids.map(String),
      });
      return;
    }

    if (!staff) {
      return;
    }

    setMembershipForm({
      role: staff.primary_role?.toString() || '',
      department: staff.primary_department?.toString() || '',
      status: 'ACTIVE',
      facilities: staff.primary_facility ? [staff.primary_facility.toString()] : [],
    });
  }, [currentMembership, staff]);

  useEffect(() => {
    if (!formData.primary_facility) {
      return;
    }

    setSecondaryFacilities((prev) => prev.filter((value) => value !== formData.primary_facility));
  }, [formData.primary_facility]);

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleMembershipFieldChange = (field: 'role' | 'department' | 'status', value: string) => {
    setMembershipForm((prev) => ({ ...prev, [field]: value }));
    if (membershipErrors[field]) {
      setMembershipErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!formData.first_name.trim()) {
      newErrors.first_name = 'First name is required';
    }
    if (!formData.last_name.trim()) {
      newErrors.last_name = 'Last name is required';
    }
    if (!formData.employee_id.trim()) {
      newErrors.employee_id = 'Employee ID is required';
    }
    if (!formData.department) {
      newErrors.department = 'Department is required';
    }
    if (!formData.role) {
      newErrors.role = 'Role is required';
    }
    if (!formData.primary_facility) {
      newErrors.primary_facility = 'Primary facility is required';
    }

    setFormErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      await updateStaff.mutateAsync({
        id: staffId,
        data: {
          email: formData.email,
          first_name: formData.first_name,
          last_name: formData.last_name,
          employee_id: formData.employee_id,
          department: parseInt(formData.department),
          role: parseInt(formData.role),
          primary_facility: parseInt(formData.primary_facility),
          phone_number: formData.phone_number || undefined,
          license_number: formData.license_number || undefined,
          license_expiry: formData.license_expiry || undefined,
          specialization: formData.specialization || undefined,
          hwr_national_id: formData.hwr_national_id || undefined,
          secondary_departments: secondaryDepartments.map(Number),
          secondary_facilities: secondaryFacilities.map(Number),
          supervisor: supervisor && supervisor !== 'none' ? parseInt(supervisor) : null,
        },
      });

      toast({
        title: 'Staff profile updated',
        description: `Successfully updated profile for ${formData.first_name} ${formData.last_name}`,
      });

      router.push('/admin/staff');
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to update staff profile',
      });
    }
  };

  const handleDeactivate = async () => {
    try {
      await terminateStaff.mutateAsync(staffId);

      toast({
        title: 'Staff terminated',
        description: `${staff?.user_first_name} ${staff?.user_last_name} has been terminated`,
      });

      router.push('/admin/staff');
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to terminate staff',
      });
    }
  };

  const validateMembership = () => {
    const nextErrors: Record<string, string> = {};

    if (!membershipForm.role) {
      nextErrors.role = 'Organization role is required';
    }

    setMembershipErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleMembershipSave = async () => {
    if (!validateMembership()) {
      return;
    }

    const payload = {
      staff_profile: staffId,
      role: parseInt(membershipForm.role),
      department: membershipForm.department ? parseInt(membershipForm.department) : null,
      facilities: membershipForm.facilities.map(Number),
      status: membershipForm.status as 'ACTIVE' | 'SUSPENDED' | 'REVOKED',
      is_primary: currentMembership?.is_primary ?? false,
    };

    try {
      if (currentMembership) {
        await updateMembership.mutateAsync({
          id: currentMembership.id,
          data: payload,
        });
      } else {
        await createMembership.mutateAsync(payload);
      }

      toast({
        title: currentMembership ? 'Membership updated' : 'Membership created',
        description: 'Organization-specific role, department, and facility access were saved.',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Membership save failed',
        description: err instanceof Error ? err.message : 'Failed to save organization membership',
      });
    }
  };

  const handleMembershipDelete = async () => {
    if (!currentMembership) {
      return;
    }

    try {
      await deleteMembership.mutateAsync(currentMembership.id);
      toast({
        title: 'Membership removed',
        description: 'The organization membership was deleted.',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Membership delete failed',
        description: err instanceof Error ? err.message : 'Failed to delete organization membership',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-10 w-72" />
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          title="Edit Staff Profile"
          helpContent="Update account, assignment, and professional details for an existing staff record."
        />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : 'Staff profile not found'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const initials = `${(staff.user_first_name || '')[0] || ''}${(staff.user_last_name || '')[0] || ''}`.toUpperCase();
  const supervisorName = staffList?.results?.find((s) => s.id === staff.supervisor);

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
      <PageHeader
        title="Edit Staff Profile"
        helpContent="Update account, assignment, and professional details for an existing staff record."
        actions={
          staff.employment_status === 'ACTIVE' ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">Terminate</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Terminate Staff Member?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will terminate {staff.user_first_name}&apos;s employment and revoke access to the system. They will no longer be able to log in.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeactivate}>
                    Confirm Termination
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null
        }
      />

      {/* Identity Hero Card */}
      <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-card">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.09),transparent_36%)]"
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
          <Avatar className="h-16 w-16 shrink-0 ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
            <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
                {staff.full_name || `${staff.user_first_name} ${staff.user_last_name}`}
              </h2>
              <Badge
                variant={staff.employment_status === 'ACTIVE' ? 'default' : 'secondary'}
                className="shrink-0"
              >
                {formatEmploymentStatus(staff.employment_status)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              @{staff.user_username}
              <span className="mx-1.5">•</span>
              {staff.employee_id}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {staff.primary_department_name || 'No department'}
              </span>
              <span className="flex items-center gap-1">
                <Shield className="h-3.5 w-3.5" />
                {staff.primary_role_name || 'No role'}
              </span>
              {supervisorName && (
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  Reports to {supervisorName.full_name || `${supervisorName.user_first_name} ${supervisorName.user_last_name}`}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-xs text-muted-foreground/70">
              <span>{staff.organization_name || 'No organization'}</span>
              <span className="mx-0.5">•</span>
              <span>{staff.primary_facility_name || 'No facility'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabbed Form */}
      <form onSubmit={handleSubmit}>
        <Tabs defaultValue="personal" className="space-y-4">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="personal" className="gap-1.5">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Personal</span>
              <span className="sm:hidden">Info</span>
            </TabsTrigger>
            <TabsTrigger value="assignment" className="gap-1.5">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Assignment</span>
              <span className="sm:hidden">Role</span>
            </TabsTrigger>
            <TabsTrigger value="professional" className="gap-1.5">
              <Briefcase className="h-4 w-4" />
              <span className="hidden sm:inline">Professional</span>
              <span className="sm:hidden">License</span>
            </TabsTrigger>
          </TabsList>

          {/* ── Personal Information ── */}
          <TabsContent value="personal">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">First Name *</Label>
                    <Input
                      autoComplete="given-name"
                      id="first_name"
                      name="first_name"
                      value={formData.first_name}
                      onChange={(e) => handleChange('first_name', e.target.value)}
                      placeholder="First name…"
                    />
                    {formErrors.first_name && (
                      <p className="text-sm text-destructive">{formErrors.first_name}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last_name">Last Name *</Label>
                    <Input
                      autoComplete="family-name"
                      id="last_name"
                      name="last_name"
                      value={formData.last_name}
                      onChange={(e) => handleChange('last_name', e.target.value)}
                      placeholder="Last name…"
                    />
                    {formErrors.last_name && (
                      <p className="text-sm text-destructive">{formErrors.last_name}</p>
                    )}
                  </div>
                </div>
                <Separator />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">
                      <Mail className="mr-1 inline h-4 w-4" />
                      Email *
                    </Label>
                    <Input
                      autoComplete="email"
                      id="email"
                      name="email"
                      spellCheck={false}
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      placeholder="email@example.com…"
                    />
                    {formErrors.email && (
                      <p className="text-sm text-destructive">{formErrors.email}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone_number">
                      <Phone className="mr-1 inline h-4 w-4" />
                      Phone Number
                    </Label>
                    <Input
                      autoComplete="tel"
                      id="phone_number"
                      inputMode="tel"
                      name="phone_number"
                      type="tel"
                      value={formData.phone_number}
                      onChange={(e) => handleChange('phone_number', e.target.value)}
                      placeholder="+254712345678…"
                    />
                  </div>
                </div>
                <Separator />
                <div className="max-w-sm space-y-2">
                  <Label htmlFor="employee_id">
                    <IdCard className="mr-1 inline h-4 w-4" />
                    Employee ID *
                  </Label>
                  <Input
                    autoComplete="off"
                    id="employee_id"
                    name="employee_id"
                    value={formData.employee_id}
                    onChange={(e) => handleChange('employee_id', e.target.value)}
                    placeholder="EMP-001…"
                  />
                  {formErrors.employee_id && (
                    <p className="text-sm text-destructive">{formErrors.employee_id}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Role & Assignment ── */}
          <TabsContent value="assignment">
            <div className="space-y-4">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="department">
                      <Building2 className="mr-1 inline h-4 w-4" />
                      Department *
                    </Label>
                    <Select
                      value={formData.department}
                      onValueChange={(value) => handleChange('department', value)}
                    >
                      <SelectTrigger id="department" aria-label="Department">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments?.results.map((dept: { id: number; name: string }) => (
                          <SelectItem key={dept.id} value={dept.id.toString()}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formErrors.department && (
                      <p className="text-sm text-destructive">{formErrors.department}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">
                      <Shield className="mr-1 inline h-4 w-4" />
                      Role *
                    </Label>
                    <Select
                      value={formData.role}
                      onValueChange={(value) => handleChange('role', value)}
                    >
                      <SelectTrigger id="role" aria-label="Role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles?.results.map((role) => (
                          <SelectItem key={role.id} value={role.id.toString()}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formErrors.role && (
                      <p className="text-sm text-destructive">{formErrors.role}</p>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="max-w-sm space-y-2">
                  <Label htmlFor="primary_facility">
                    <Building2 className="mr-1 inline h-4 w-4" />
                    Primary Facility *
                  </Label>
                  <Select
                    value={formData.primary_facility}
                    onValueChange={(value) => handleChange('primary_facility', value)}
                  >
                    <SelectTrigger id="primary_facility" aria-label="Primary facility">
                      <SelectValue placeholder="Select primary facility" />
                    </SelectTrigger>
                    <SelectContent>
                      {(facilities?.results ?? []).length > 0 ? (
                        (facilities?.results ?? []).map((item) => (
                          <SelectItem key={item.id} value={item.id.toString()}>
                            {item.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectEmpty>No facilities available</SelectEmpty>
                      )}
                    </SelectContent>
                  </Select>
                  {formErrors.primary_facility && (
                    <p className="text-sm text-destructive">{formErrors.primary_facility}</p>
                  )}
                </div>

                <Separator />

                {/* Supervisor */}
                <div className="max-w-sm space-y-2">
                  <Label htmlFor="supervisor">
                    <Users className="mr-1 inline h-4 w-4" />
                    Supervisor
                  </Label>
                  <Select value={supervisor} onValueChange={setSupervisor}>
                    <SelectTrigger id="supervisor" aria-label="Supervisor">
                      <SelectValue placeholder="Select supervisor (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {(staffList?.results ?? [])
                        .filter((s) => s.id !== staffId)
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id.toString()}>
                            {s.full_name || `${s.user_first_name} ${s.user_last_name}`}
                            {s.primary_department_name ? ` (${s.primary_department_name})` : ''}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Additional Assignments</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <MultiSelect
                    data={(departments?.results ?? [])
                      .filter((d) => d.id.toString() !== formData.department)
                      .map((d) => ({ label: d.name, value: d.id.toString() }))}
                    type="secondary-departments"
                    values={secondaryDepartments}
                    onValuesChange={setSecondaryDepartments}
                  >
                    <MultiSelectTrigger placeholder="Additional departments…" />
                    <MultiSelectContent>
                      <MultiSelectInput placeholder="Search departments…" />
                      <MultiSelectList>
                        <MultiSelectGroup>
                          {(departments?.results ?? [])
                            .filter((d) => d.id.toString() !== formData.department)
                            .map((d) => (
                              <MultiSelectItem key={d.id} value={d.id.toString()}>
                                {d.name}
                              </MultiSelectItem>
                            ))}
                        </MultiSelectGroup>
                        <MultiSelectEmpty>No departments found</MultiSelectEmpty>
                      </MultiSelectList>
                    </MultiSelectContent>
                  </MultiSelect>

                  <MultiSelect
                    data={(facilities?.results ?? [])
                      .filter((f) => f.id.toString() !== formData.primary_facility)
                      .map((f) => ({ label: f.name, value: f.id.toString() }))}
                    type="secondary-facilities"
                    values={secondaryFacilities}
                    onValuesChange={setSecondaryFacilities}
                  >
                    <MultiSelectTrigger placeholder="Additional facilities…" />
                    <MultiSelectContent>
                      <MultiSelectInput placeholder="Search facilities…" />
                      <MultiSelectList>
                        <MultiSelectGroup>
                          {(facilities?.results ?? [])
                            .filter((f) => f.id.toString() !== formData.primary_facility)
                            .map((f) => (
                              <MultiSelectItem key={f.id} value={f.id.toString()}>
                                {f.name}
                              </MultiSelectItem>
                            ))}
                        </MultiSelectGroup>
                        <MultiSelectEmpty>No facilities found</MultiSelectEmpty>
                      </MultiSelectList>
                    </MultiSelectContent>
                  </MultiSelect>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">Organization Membership</p>
                    <p className="text-sm text-muted-foreground">
                      Manage this staff member&apos;s current-organization role, status, and facility access separately from the home-profile fields above.
                    </p>
                  </div>
                  {currentMembership ? (
                    <Badge variant={currentMembership.is_primary ? 'default' : 'secondary'} className="w-fit">
                      {currentMembership.is_primary ? 'Primary membership' : 'Secondary membership'}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="w-fit">No membership record yet</Badge>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="membership-role">Organization Role *</Label>
                    <Select
                      value={membershipForm.role}
                      onValueChange={(value) => handleMembershipFieldChange('role', value)}
                    >
                      <SelectTrigger id="membership-role" aria-label="Organization role">
                        <SelectValue placeholder="Select organization role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles?.results.map((role) => (
                          <SelectItem key={role.id} value={role.id.toString()}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {membershipErrors.role && (
                      <p className="text-sm text-destructive">{membershipErrors.role}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="membership-department">Organization Department</Label>
                    <Select
                      value={membershipForm.department || 'none'}
                      onValueChange={(value) => handleMembershipFieldChange('department', value === 'none' ? '' : value)}
                    >
                      <SelectTrigger id="membership-department" aria-label="Organization department">
                        <SelectValue placeholder="Select organization department" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No department</SelectItem>
                        {departments?.results.map((dept: { id: number; name: string }) => (
                          <SelectItem key={dept.id} value={dept.id.toString()}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="membership-status">Membership Status</Label>
                    <Select
                      value={membershipForm.status}
                      onValueChange={(value) => handleMembershipFieldChange('status', value)}
                    >
                      <SelectTrigger id="membership-status" aria-label="Membership status">
                        <SelectValue placeholder="Select membership status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="SUSPENDED">Suspended</SelectItem>
                        <SelectItem value="REVOKED">Revoked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Allowed Facilities</Label>
                    <MultiSelect
                      data={(facilities?.results ?? []).map((facility) => ({
                        label: facility.name,
                        value: facility.id.toString(),
                      }))}
                      type="membership-facilities"
                      values={membershipForm.facilities}
                      onValuesChange={(values) => setMembershipForm((prev) => ({ ...prev, facilities: values }))}
                    >
                      <MultiSelectTrigger placeholder="Membership facilities…" />
                      <MultiSelectContent>
                        <MultiSelectInput placeholder="Search facilities…" />
                        <MultiSelectList>
                          <MultiSelectGroup>
                            {(facilities?.results ?? []).map((facility) => (
                              <MultiSelectItem key={facility.id} value={facility.id.toString()}>
                                {facility.name}
                              </MultiSelectItem>
                            ))}
                          </MultiSelectGroup>
                          <MultiSelectEmpty>No facilities found</MultiSelectEmpty>
                        </MultiSelectList>
                      </MultiSelectContent>
                    </MultiSelect>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  {currentMembership && !currentMembership.is_primary ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleMembershipDelete}
                      disabled={deleteMembership.isPending}
                    >
                      {deleteMembership.isPending ? 'Removing…' : 'Remove Membership'}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    onClick={handleMembershipSave}
                    disabled={createMembership.isPending || updateMembership.isPending}
                  >
                    {createMembership.isPending || updateMembership.isPending ? 'Saving Membership…' : currentMembership ? 'Save Membership' : 'Create Membership'}
                  </Button>
                </div>
              </CardContent>
            </Card>
            </div>
          </TabsContent>

          {/* ── Professional Information ── */}
          <TabsContent value="professional">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-1">
                  <p className="text-sm font-medium flex items-center gap-2">
                    DHA Health Worker Registry Lookup
                    {hwrPopulated && (
                      <Badge variant="secondary" className="ml-1">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Auto-populated
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Search by National ID to verify and update professional details from the DHA registry
                  </p>
                </div>
                <DHAPractitionerSearch
                  onSelect={(practitioner: DHAPractitioner) => {
                    const currentLicense = practitioner.licenses?.find(l =>
                      l.license_end && l.license_end !== 'None' && new Date(l.license_end) >= new Date()
                    ) || practitioner.licenses?.[0];

                    const licenseExpiryDate = practitioner.membership.license_expires_in_days > 0
                      ? new Date(Date.now() + practitioner.membership.license_expires_in_days * 24 * 60 * 60 * 1000)
                      : undefined;

                    const licenseExpiry = currentLicense?.license_end && currentLicense.license_end !== 'None'
                      ? currentLicense.license_end
                      : licenseExpiryDate ? format(licenseExpiryDate, 'yyyy-MM-dd') : '';

                    setFormData(prev => ({
                      ...prev,
                      license_number: currentLicense?.external_reference_id || prev.license_number,
                      license_expiry: licenseExpiry || prev.license_expiry,
                      specialization: practitioner.professional_details?.professional_cadre || practitioner.professional_details?.specialty || practitioner.membership?.specialty || prev.specialization,
                      phone_number: practitioner.contacts?.phone || prev.phone_number,
                      email: practitioner.contacts?.email?.toLowerCase() || prev.email,
                      hwr_national_id: practitioner.identifiers?.identification_number || prev.hwr_national_id,
                    }));
                    setHwrPopulated(true);
                    toast({
                      title: 'Professional details updated',
                      description: `Populated from DHA registry for ${practitioner.membership.full_name.trim()}`,
                    });
                  }}
                />
                <Separator />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="license_number">License Number</Label>
                    <Input
                      autoComplete="off"
                      id="license_number"
                      name="license_number"
                      spellCheck={false}
                      value={formData.license_number}
                      onChange={(e) => handleChange('license_number', e.target.value)}
                      placeholder="MED-12345…"
                      className={hwrPopulated && formData.license_number ? 'bg-muted' : ''}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="license_expiry">License Expiry</Label>
                    <DatePicker
                      value={formData.license_expiry ? parseISO(formData.license_expiry) : undefined}
                      onChange={(date) => handleChange('license_expiry', date ? format(date, 'yyyy-MM-dd') : '')}
                      placeholder="Select expiry date"
                    />
                  </div>
                </div>
                <Separator />
                <div className="max-w-sm space-y-2">
                  <Label htmlFor="specialization">Specialization</Label>
                  <Input
                    id="specialization"
                    name="specialization"
                    value={formData.specialization}
                    onChange={(e) => handleChange('specialization', e.target.value)}
                    placeholder="e.g., Internal Medicine…"
                    className={hwrPopulated && formData.specialization ? 'bg-muted' : ''}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" asChild>
            <Link href="/admin/staff">Cancel</Link>
          </Button>
          <Button type="submit" disabled={updateStaff.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {updateStaff.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function formatEmploymentStatus(status?: string) {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'ON_LEAVE':
      return 'On Leave';
    case 'SUSPENDED':
      return 'Suspended';
    case 'TERMINATED':
      return 'Terminated';
    default:
      return 'Unknown';
  }
}
