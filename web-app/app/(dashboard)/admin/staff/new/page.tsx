/**
 * New Staff Profile Page
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 *
 * Create a new staff profile with user account, role, and department.
 * Professional details section moved first to support DHA registry auto-population.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, User, Building2, Shield, Briefcase, Phone, Mail, IdCard, Check, X, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectEmpty,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/lib/hooks/use-toast';
import { useCreateStaffProfile, useDepartments, useRoles } from '@/lib/hooks/use-rbac';
import { DatePicker } from '@/components/ui/date-picker';
import { DHAPractitionerSearch } from '@/components/sha/practitioner-search';
import { staffApi } from '@/lib/api/rbac';
import type { DHAPractitioner } from '@/lib/types/sha';
import type { Department, Role } from '@/lib/types/rbac';
import { useDebouncedCallback } from 'use-debounce';

export default function NewStaffPage() {
  const router = useRouter();
  const { toast } = useToast();
  const createStaff = useCreateStaffProfile();

  const { data: departments } = useDepartments({ is_active: true });
  const { data: roles } = useRoles();

  // Form state
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    employee_id: '',
    department: '',
    role: '',
    phone_number: '',
    hwr_id: '',
    license_number: '',
    license_expiry: undefined as Date | undefined,
    licensing_body: '',
    specialization: '',
    hire_date: new Date(),
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Username validation state
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);

  // Track if professional details were auto-populated
  const [isProfessionalDataPopulated, setIsProfessionalDataPopulated] = useState(false);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Debounced username check
  const checkUsername = useDebouncedCallback(async (username: string) => {
    if (!username || username.length < 3) {
      setUsernameStatus('idle');
      setUsernameSuggestions([]);
      return;
    }

    setUsernameStatus('checking');
    try {
      const result = await staffApi.checkUsername(username);
      setUsernameStatus(result.available ? 'available' : 'taken');
      setUsernameSuggestions(result.suggestions);
    } catch {
      setUsernameStatus('idle');
    }
  }, 500);

  // Watch username changes
  useEffect(() => {
    checkUsername(formData.username);
  }, [formData.username, checkUsername]);

  // Debounced username suggestion based on names
  const suggestUsernameFromNames = useDebouncedCallback(
    async (firstName: string, lastName: string, middleName: string) => {
      // Need at least first name (2+ chars) and last name (2+ chars) to suggest
      if (firstName.length >= 2 && lastName.length >= 2) {
        try {
          const result = await staffApi.suggestUsername(firstName, lastName, middleName);
          if (result.suggestions.length > 0) {
            setUsernameSuggestions(result.suggestions);
          }
        } catch {
          // Silently fail
        }
      }
    },
    400 // Debounce for 400ms
  );

  // Auto-suggest usernames as names are typed
  useEffect(() => {
    suggestUsernameFromNames(formData.first_name, formData.last_name, formData.middle_name);
  }, [formData.first_name, formData.last_name, formData.middle_name, suggestUsernameFromNames]);

  // Legacy callback for programmatic suggestion (e.g., after DHA select)
  const suggestUsername = useCallback(async () => {
    if (formData.first_name && formData.last_name) {
      try {
        const result = await staffApi.suggestUsername(
          formData.first_name,
          formData.last_name,
          formData.middle_name
        );
        if (result.suggestions.length > 0) {
          setUsernameSuggestions(result.suggestions);
        }
      } catch {
        // Silently fail
      }
    }
  }, [formData.first_name, formData.last_name, formData.middle_name]);

  // Handle practitioner selection from DHA search
  const handlePractitionerSelect = (practitioner: DHAPractitioner) => {
    // Get the current/latest license
    const currentLicense = practitioner.licenses?.find(l =>
      l.license_end && l.license_end !== 'None' && new Date(l.license_end) >= new Date()
    ) || practitioner.licenses?.[0];

    // Calculate license expiry date from days if no license end date
    const licenseExpiryDate = practitioner.membership.license_expires_in_days > 0
      ? new Date(Date.now() + practitioner.membership.license_expires_in_days * 24 * 60 * 60 * 1000)
      : undefined;

    const licenseExpiry = currentLicense?.license_end && currentLicense.license_end !== 'None'
      ? new Date(currentLicense.license_end)
      : licenseExpiryDate;

    // Count how many fields will be populated
    let fieldsPopulated = 0;

    setFormData(prev => {
      const newData = { ...prev };

      // Names
      if (!prev.first_name && practitioner.membership.first_name) {
        newData.first_name = practitioner.membership.first_name;
        fieldsPopulated++;
      }
      if (!prev.middle_name && practitioner.membership.middle_name) {
        newData.middle_name = practitioner.membership.middle_name;
        fieldsPopulated++;
      }
      if (!prev.last_name && practitioner.membership.last_name) {
        newData.last_name = practitioner.membership.last_name;
        fieldsPopulated++;
      }

      // Contact
      if (!prev.email && practitioner.contacts.email) {
        newData.email = practitioner.contacts.email.toLowerCase();
        fieldsPopulated++;
      }
      if (!prev.phone_number && practitioner.contacts.phone) {
        newData.phone_number = practitioner.contacts.phone;
        fieldsPopulated++;
      }

      // Professional details - these always get set from registry
      // HWR ID is the registration_id
      newData.hwr_id = practitioner.membership.registration_id || practitioner.membership.id;
      fieldsPopulated++;

      // License number is from licenses[].id
      if (currentLicense?.id) {
        newData.license_number = currentLicense.id;
        fieldsPopulated++;
      }

      // Licensing body
      if (practitioner.membership.licensing_body) {
        newData.licensing_body = practitioner.membership.licensing_body;
        fieldsPopulated++;
      }

      // License expiry (readonly from registry)
      if (licenseExpiry) {
        newData.license_expiry = licenseExpiry;
        fieldsPopulated++;
      }

      // Specialization
      if (!prev.specialization) {
        const specialty = practitioner.professional_details.specialty ||
          practitioner.membership.specialty ||
          practitioner.professional_details.professional_cadre;
        if (specialty) {
          newData.specialization = specialty;
          fieldsPopulated++;
        }
      }

      return newData;
    });

    setIsProfessionalDataPopulated(true);

    // Show success toast with populated fields count
    toast({
      title: 'Practitioner Details Loaded',
      description: `${practitioner.membership.full_name.trim()} - ${practitioner.professional_details.professional_cadre} (${fieldsPopulated} fields auto-populated)`,
    });

    // Suggest username after populating names
    setTimeout(() => suggestUsername(), 100);
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    } else if (usernameStatus === 'taken') {
      newErrors.username = 'Username is already taken';
    }
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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      await createStaff.mutateAsync({
        username: formData.username,
        email: formData.email,
        first_name: formData.first_name,
        last_name: formData.last_name,
        middle_name: formData.middle_name || undefined,
        employee_id: formData.employee_id,
        department: parseInt(formData.department),
        role: parseInt(formData.role),
        phone_number: formData.phone_number || undefined,
        hwr_id: formData.hwr_id || undefined,
        license_number: formData.license_number || undefined,
        license_expiry: formData.license_expiry?.toISOString().split('T')[0],
        licensing_body: formData.licensing_body || undefined,
        specialization: formData.specialization || undefined,
        hire_date: formData.hire_date?.toISOString().split('T')[0],
      });

      toast({
        title: 'Staff profile created',
        description: `Successfully created profile for ${formData.first_name} ${formData.last_name}`,
      });

      router.push('/admin/staff');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create staff profile',
      });
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/staff">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Staff Profile</h1>
          <p className="text-muted-foreground">Create a new staff member account</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Professional Details - FIRST for DHA lookup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IdCard className="h-5 w-5" />
              Professional Details
              {isProfessionalDataPopulated && (
                <Badge variant="secondary" className="ml-2">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Auto-populated
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Search by National ID to auto-populate from DHA Health Worker Registry, or enter manually
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* DHA Practitioner Search */}
            <DHAPractitionerSearch onSelect={handlePractitionerSelect} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="hwr_id">HWR ID (Registry Number)</Label>
                <Input
                  id="hwr_id"
                  value={formData.hwr_id}
                  onChange={(e) => handleChange('hwr_id', e.target.value)}
                  placeholder="e.g., PUID-059839"
                  className={isProfessionalDataPopulated && formData.hwr_id ? 'bg-muted' : ''}
                />
                <p className="text-xs text-muted-foreground">
                  Health Worker Registry ID from DHA
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="license_number">License Number</Label>
                <Input
                  id="license_number"
                  value={formData.license_number}
                  onChange={(e) => handleChange('license_number', e.target.value)}
                  placeholder="e.g., COC-Clinical Officer-2026-620095"
                  className={isProfessionalDataPopulated && formData.license_number ? 'bg-muted' : ''}
                />
                <p className="text-xs text-muted-foreground">
                  Current license ID from regulatory body
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="licensing_body">Licensing Body</Label>
                <Input
                  id="licensing_body"
                  value={formData.licensing_body}
                  onChange={(e) => handleChange('licensing_body', e.target.value)}
                  placeholder="e.g., Clinical Officers Council"
                  className={isProfessionalDataPopulated && formData.licensing_body ? 'bg-muted' : ''}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="license_expiry">License Expiry</Label>
                <DatePicker
                  value={formData.license_expiry}
                  onChange={() => {}} // Read-only - only set by registry lookup
                  placeholder="Set by registry lookup"
                  disabled={true}
                />
                <p className="text-xs text-muted-foreground">
                  Auto-populated from DHA registry (read-only)
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="specialization">Specialization</Label>
                <Input
                  id="specialization"
                  value={formData.specialization}
                  onChange={(e) => handleChange('specialization', e.target.value)}
                  placeholder="e.g., Clinical Officer, Nursing"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone_number">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone_number"
                    value={formData.phone_number}
                    onChange={(e) => handleChange('phone_number', e.target.value)}
                    placeholder="+254712345678"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Account */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              User Account
            </CardTitle>
            <CardDescription>
              Basic account information for the staff member
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="first_name">
                  First Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => handleChange('first_name', e.target.value)}
                  onBlur={suggestUsername}
                  placeholder="James"
                  className={errors.first_name ? 'border-destructive' : ''}
                />
                {errors.first_name && (
                  <p className="text-sm text-destructive">{errors.first_name}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="middle_name">Middle Name</Label>
                <Input
                  id="middle_name"
                  value={formData.middle_name}
                  onChange={(e) => handleChange('middle_name', e.target.value)}
                  placeholder="Kamau (optional)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">
                  Last Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => handleChange('last_name', e.target.value)}
                  onBlur={suggestUsername}
                  placeholder="Mwangi"
                  className={errors.last_name ? 'border-destructive' : ''}
                />
                {errors.last_name && (
                  <p className="text-sm text-destructive">{errors.last_name}</p>
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="username">
                  Username <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) => handleChange('username', e.target.value.toLowerCase().replace(/\s/g, ''))}
                    placeholder="e.g., james.mwangi"
                    className={`pr-10 ${errors.username ? 'border-destructive' : usernameStatus === 'available' ? 'border-green-500' : usernameStatus === 'taken' ? 'border-destructive' : ''}`}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameStatus === 'checking' && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {usernameStatus === 'available' && (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                    {usernameStatus === 'taken' && (
                      <X className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                </div>
                {errors.username && (
                  <p className="text-sm text-destructive">{errors.username}</p>
                )}
                {usernameStatus === 'available' && formData.username && (
                  <p className="text-sm text-green-600">Username is available</p>
                )}
                {usernameSuggestions.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      {usernameStatus === 'taken' ? 'Username taken. Try:' : 'Suggested usernames:'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {usernameSuggestions.slice(0, 5).map((suggestion) => (
                        <Button
                          key={suggestion}
                          type="button"
                          variant={formData.username === suggestion ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleChange('username', suggestion)}
                        >
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">
                  Email <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    placeholder="email@facility.com"
                    className={`pl-9 ${errors.email ? 'border-destructive' : ''}`}
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Employment Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Employment Details
            </CardTitle>
            <CardDescription>
              Department, role, and employee information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="employee_id">
                  Employee ID <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="employee_id"
                    value={formData.employee_id}
                    onChange={(e) => handleChange('employee_id', e.target.value)}
                    placeholder="EMP-001"
                    className={`pl-9 ${errors.employee_id ? 'border-destructive' : ''}`}
                  />
                </div>
                {errors.employee_id && (
                  <p className="text-sm text-destructive">{errors.employee_id}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="hire_date">Hire Date</Label>
                <DatePicker
                  value={formData.hire_date instanceof Date ? formData.hire_date : undefined}
                  onChange={(date) => setFormData(prev => ({ ...prev, hire_date: date || new Date() }))}
                  placeholder="Select hire date"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="department">
                  Department <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.department}
                  onValueChange={(value) => handleChange('department', value)}
                >
                  <SelectTrigger className={errors.department ? 'border-destructive' : ''}>
                    <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments?.results && departments.results.length > 0 ? (
                      departments.results.map((dept: Department) => (
                        <SelectItem key={dept.id} value={dept.id.toString()}>
                          {dept.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectEmpty>No departments available</SelectEmpty>
                    )}
                  </SelectContent>
                </Select>
                {errors.department && (
                  <p className="text-sm text-destructive">{errors.department}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">
                  Role <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => handleChange('role', value)}
                >
                  <SelectTrigger className={errors.role ? 'border-destructive' : ''}>
                    <Shield className="h-4 w-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles?.results && roles.results.length > 0 ? (
                      roles.results.map((role: Role) => (
                        <SelectItem key={role.id} value={role.id.toString()}>
                          {role.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectEmpty>No roles available</SelectEmpty>
                    )}
                  </SelectContent>
                </Select>
                {errors.role && (
                  <p className="text-sm text-destructive">{errors.role}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button variant="outline" type="button" asChild>
            <Link href="/admin/staff">Cancel</Link>
          </Button>
          <Button type="submit" disabled={createStaff.isPending || usernameStatus === 'taken'}>
            <Save className="h-4 w-4 mr-2" />
            {createStaff.isPending ? 'Creating...' : 'Create Staff Profile'}
          </Button>
        </div>
      </form>
    </div>
  );
}
