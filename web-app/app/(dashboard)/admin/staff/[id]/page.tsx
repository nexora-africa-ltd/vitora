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
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Save, User, Building2, Shield, Briefcase, Phone, Mail, IdCard, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useStaffProfile, useUpdateStaffProfile, useDeleteStaffProfile, useDepartments, useRoles } from '@/lib/hooks/use-rbac';

export default function EditStaffPage() {
  const router = useRouter();
  const params = useParams();
  const staffId = parseInt(params.id as string);
  const { toast } = useToast();

  const { data: staff, isLoading, error } = useStaffProfile(staffId);
  const updateStaff = useUpdateStaffProfile();
  const terminateStaff = useDeleteStaffProfile();

  const { data: departments } = useDepartments({ is_active: true, page_size: 100 });
  const { data: roles } = useRoles({ page_size: 100 });

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    employee_id: '',
    department: '',
    role: '',
    phone_number: '',
    license_number: '',
    license_expiry: '',
    specialization: '',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

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
        phone_number: staff.phone_number || '',
        license_number: staff.license_number || '',
        license_expiry: staff.license_expiry || '',
        specialization: staff.specialization || '',
      });
    }
  }, [staff]);

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
          phone_number: formData.phone_number || undefined,
          license_number: formData.license_number || undefined,
          license_expiry: formData.license_expiry || undefined,
          specialization: formData.specialization || undefined,
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

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 max-w-3xl">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="space-y-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div className="container mx-auto py-6 max-w-3xl">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/staff">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Edit Staff Profile</h1>
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : 'Staff profile not found'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/staff">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Edit Staff Profile</h1>
            <p className="text-muted-foreground">
              {staff.full_name || `${staff.user_first_name} ${staff.user_last_name}`}
              {' • '}
              <Badge variant={staff.employment_status === 'ACTIVE' ? 'default' : 'secondary'}>
                {staff.employment_status === 'ACTIVE' ? 'Active' : staff.employment_status?.toLowerCase() || 'Unknown'}
              </Badge>
            </p>
          </div>
        </div>

        {staff.employment_status === 'ACTIVE' && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Terminate</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Terminate Staff Member?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will terminate {staff.user_first_name}&apos;s employment and revoke access to the system.
                  They will no longer be able to log in. Their termination date will be recorded.
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
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Staff Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Staff Information
            </CardTitle>
            <CardDescription>
              Username: {staff.user_username}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name *</Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => handleChange('first_name', e.target.value)}
                  placeholder="First name"
                />
                {formErrors.first_name && (
                  <p className="text-sm text-destructive">{formErrors.first_name}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name *</Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => handleChange('last_name', e.target.value)}
                  placeholder="Last name"
                />
                {formErrors.last_name && (
                  <p className="text-sm text-destructive">{formErrors.last_name}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">
                  <Mail className="h-4 w-4 inline mr-1" />
                  Email *
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="email@example.com"
                />
                {formErrors.email && (
                  <p className="text-sm text-destructive">{formErrors.email}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone_number">
                  <Phone className="h-4 w-4 inline mr-1" />
                  Phone Number
                </Label>
                <Input
                  id="phone_number"
                  value={formData.phone_number}
                  onChange={(e) => handleChange('phone_number', e.target.value)}
                  placeholder="+254..."
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee_id">
                <IdCard className="h-4 w-4 inline mr-1" />
                Employee ID *
              </Label>
              <Input
                id="employee_id"
                value={formData.employee_id}
                onChange={(e) => handleChange('employee_id', e.target.value)}
                placeholder="EMP-XXX"
              />
              {formErrors.employee_id && (
                <p className="text-sm text-destructive">{formErrors.employee_id}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Role Assignment */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Role Assignment
            </CardTitle>
            <CardDescription>
              Assign department and role to determine permissions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="department">
                  <Building2 className="h-4 w-4 inline mr-1" />
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
                  <Shield className="h-4 w-4 inline mr-1" />
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
          </CardContent>
        </Card>

        {/* License Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Professional Information
            </CardTitle>
            <CardDescription>
              License and specialization details (optional)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="license_number">License Number</Label>
                <Input
                  id="license_number"
                  value={formData.license_number}
                  onChange={(e) => handleChange('license_number', e.target.value)}
                  placeholder="MED-XXXXX"
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
            <div className="space-y-2">
              <Label htmlFor="specialization">Specialization</Label>
              <Input
                id="specialization"
                value={formData.specialization}
                onChange={(e) => handleChange('specialization', e.target.value)}
                placeholder="e.g., Internal Medicine, Pediatrics"
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/admin/staff">Cancel</Link>
          </Button>
          <Button type="submit" disabled={updateStaff.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {updateStaff.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
