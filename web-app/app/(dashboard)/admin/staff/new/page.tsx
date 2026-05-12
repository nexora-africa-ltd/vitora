/**
 * New Staff Profile Page
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 *
 * Two modes:
 * - "invite" (default): Send invitation email, user sets up own account
 * - "direct": Create account directly with temp password (for offline/no-email scenarios)
 *
 * Professional details section moved first to support DHA registry auto-population.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Save, User, Building2, Shield, Briefcase, Phone, Mail, IdCard, Check, X, Loader2, Sparkles, Send } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectEmpty,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/lib/hooks/use-toast';
import { useCreateStaffProfile, useDepartments, useRoles } from '@/lib/hooks/use-rbac';
import { DatePicker } from '@/components/ui/date-picker';
import { DHAPractitionerSearch } from '@/components/sha/practitioner-search';
import { staffApi } from '@/lib/api/rbac';
import { invitationsApi } from '@/lib/api/onboarding';
import { facilitiesApi } from '@/lib/api/facilities';
import { CredentialDialog } from '@/components/admin/credential-dialog';
import type { DHAPractitioner } from '@/lib/types/sha';
import type { Department, Role } from '@/lib/types/rbac';
import { useFacility } from '@/lib/context/facility-context';
import { useDebouncedCallback } from 'use-debounce';

export default function NewStaffPage() {
  const router = useRouter();
  const { toast } = useToast();
  const createStaff = useCreateStaffProfile();
  const { facility, organization } = useFacility();

  const { data: departments } = useDepartments({ is_active: true, page_size: 100 });
  const { data: roles } = useRoles({ page_size: 100 });
  const { data: facilities } = useQuery({
    queryKey: ['facilities-list'],
    queryFn: () => facilitiesApi.list({ page_size: 100, is_active: true }),
  });

  // Mode: "invite" (default) or "direct"
  const [mode, setMode] = useState<'invite' | 'direct'>('invite');

  // Credential dialog state (for direct creation)
  const [credentialDialog, setCredentialDialog] = useState<{
    open: boolean;
    username: string;
    tempPassword: string;
    fullName: string;
    email: string;
  }>({ open: false, username: '', tempPassword: '', fullName: '', email: '' });

  // Invitation-specific form state
  const [inviteData, setInviteData] = useState({
    email: '',
    organization: '',
    facility: '',
    role: '',
    department: '',
    job_title: '',
    employee_id: '',
    expires_hours: '72',
  });
  const [isInviting, setIsInviting] = useState(false);
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});

  // Organizations for invitation form
  const [organizations, setOrganizations] = useState<Array<{ id: number; name: string }>>([]);
  useEffect(() => {
    async function loadOrgs() {
      try {
        const { organizationsApi } = await import('@/lib/api/organizations');
        const result = await organizationsApi.list({ page_size: 100 });
        setOrganizations(result.results.map((o) => ({ id: o.id, name: o.name })));
      } catch {
        // Silently fail - orgs dropdown will be empty
      }
    }
    loadOrgs();
  }, []);

  useEffect(() => {
    if (!organization?.id && !facility?.id) {
      return;
    }

    setInviteData((prev) => ({
      ...prev,
      organization: prev.organization || (organization?.id ? String(organization.id) : ''),
      facility: prev.facility || (facility?.id ? String(facility.id) : ''),
    }));
  }, [facility?.id, organization?.id]);

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
    primary_facility: '',
    phone_number: '',
    hwr_id: '',
    license_number: '',
    license_expiry: undefined as Date | undefined,
    licensing_body: '',
    specialization: '',
    hwr_national_id: '',
    hire_date: new Date(),
  });

  useEffect(() => {
    if (!facility?.id) {
      return;
    }

    setFormData((prev) => ({
      ...prev,
      primary_facility: prev.primary_facility || String(facility.id),
    }));
  }, [facility?.id]);

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

      // Store national ID for periodic HWR verification
      if (practitioner.identifiers?.identification_number) {
        newData.hwr_national_id = practitioner.identifiers.identification_number;
      }

      // License number is from licenses[].external_reference_id (the actual license/reg number)
      if (currentLicense?.external_reference_id) {
        newData.license_number = currentLicense.external_reference_id;
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
        const specialty = practitioner.professional_details.professional_cadre ||
          practitioner.professional_details.specialty ||
          practitioner.membership.specialty;
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

  // Pick up HWR practitioner data stored by HWR Lookup page
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('hwr_practitioner');
      if (stored) {
        sessionStorage.removeItem('hwr_practitioner');
        const practitioner = JSON.parse(stored) as DHAPractitioner;
        handlePractitionerSelect(practitioner);
      }
    } catch {
      // ignore parse or sessionStorage errors
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!formData.primary_facility) {
      newErrors.primary_facility = 'Primary facility is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      const result = await createStaff.mutateAsync({
        username: formData.username,
        email: formData.email,
        first_name: formData.first_name,
        last_name: formData.last_name,
        middle_name: formData.middle_name || undefined,
        employee_id: formData.employee_id,
        department: parseInt(formData.department),
        role: parseInt(formData.role),
        primary_facility: parseInt(formData.primary_facility),
        phone_number: formData.phone_number || undefined,
        hwr_id: formData.hwr_id || undefined,
        license_number: formData.license_number || undefined,
        license_expiry: formData.license_expiry?.toISOString().split('T')[0],
        licensing_body: formData.licensing_body || undefined,
        specialization: formData.specialization || undefined,
        hwr_national_id: formData.hwr_national_id || undefined,
        hire_date: formData.hire_date?.toISOString().split('T')[0],
      });

      // Check if response includes temp_password (direct creation)
      const resultAny = result as unknown as Record<string, unknown>;
      if (resultAny.temp_password) {
        setCredentialDialog({
          open: true,
          username: String(resultAny.user_username || formData.username),
          tempPassword: String(resultAny.temp_password),
          fullName: `${formData.first_name} ${formData.last_name}`,
          email: formData.email,
        });
      } else {
        toast({
          title: 'Staff profile created',
          description: `Successfully created profile for ${formData.first_name} ${formData.last_name}`,
        });
        router.push('/admin/staff');
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create staff profile',
      });
    }
  };

  // Invitation submit handler
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!inviteData.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteData.email)) newErrors.email = 'Invalid email';
    if (!inviteData.organization) newErrors.organization = 'Organization is required';

    setInviteErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsInviting(true);
    try {
      await invitationsApi.create({
        email: inviteData.email,
        organization: parseInt(inviteData.organization),
        facility: inviteData.facility ? parseInt(inviteData.facility) : undefined,
        role: inviteData.role ? parseInt(inviteData.role) : undefined,
        department: inviteData.department ? parseInt(inviteData.department) : undefined,
        job_title: inviteData.job_title || undefined,
        employee_id: inviteData.employee_id || undefined,
        expires_hours: parseInt(inviteData.expires_hours) || 72,
      });

      toast({
        title: 'Invitation sent',
        description: `Invitation email sent to ${inviteData.email}. They can set up their own account.`,
      });
      router.push('/admin/staff');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error sending invitation',
        description: error instanceof Error ? error.message : 'Failed to send invitation',
      });
    } finally {
      setIsInviting(false);
    }
  };

  const filteredInviteFacilities = (facilities?.results ?? []).filter((item) => {
    if (!inviteData.organization) {
      return true;
    }
    return item.organization === Number(inviteData.organization);
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
      <PageHeader
        title="Add Staff Member"
        helpContent="Invite a new staff member by email (recommended) or create their account directly."
      />

      <Tabs value={mode} onValueChange={(v) => setMode(v as 'invite' | 'direct')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="invite" className="gap-2">
            <Send className="h-4 w-4" />
            <span className="sm:hidden">Invite</span>
            <span className="hidden sm:inline">Send Invitation</span>
          </TabsTrigger>
          <TabsTrigger value="direct" className="gap-2">
            <User className="h-4 w-4" />
            <span className="sm:hidden">Create</span>
            <span className="hidden sm:inline">Create Directly</span>
          </TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* INVITATION MODE                                                   */}
        {/* ================================================================ */}
        <TabsContent value="invite" className="space-y-6 mt-6">
          <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
            Send an invitation email. The staff member will set up their own username and password.
            You configure their role, department, and organizational assignment.
          </div>

          <form onSubmit={handleInviteSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Invitation Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="invite_email">
                    Email Address <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="invite_email"
                      type="email"
                      value={inviteData.email}
                      onChange={(e) => {
                        setInviteData(prev => ({ ...prev, email: e.target.value }));
                        if (inviteErrors.email) setInviteErrors(prev => ({ ...prev, email: '' }));
                      }}
                      placeholder="staff@facility.com"
                      className={`pl-9 ${inviteErrors.email ? 'border-destructive' : ''}`}
                    />
                  </div>
                  {inviteErrors.email && (
                    <p className="text-sm text-destructive">{inviteErrors.email}</p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>
                      Organization <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={inviteData.organization}
                      onValueChange={(v) => {
                        setInviteData((prev) => {
                          const nextFacility = prev.facility && (facilities?.results ?? []).some(
                            (item) => item.id === Number(prev.facility) && item.organization === Number(v)
                          )
                            ? prev.facility
                            : '';
                          return { ...prev, organization: v, facility: nextFacility };
                        });
                        if (inviteErrors.organization) setInviteErrors(prev => ({ ...prev, organization: '' }));
                      }}
                    >
                      <SelectTrigger className={inviteErrors.organization ? 'border-destructive' : ''}>
                        <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                        <SelectValue placeholder="Select organization" />
                      </SelectTrigger>
                      <SelectContent>
                        {organizations.length > 0 ? (
                          organizations.map((org) => (
                            <SelectItem key={org.id} value={org.id.toString()}>
                              {org.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectEmpty>No organizations</SelectEmpty>
                        )}
                      </SelectContent>
                    </Select>
                    {inviteErrors.organization && (
                      <p className="text-sm text-destructive">{inviteErrors.organization}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Primary Facility</Label>
                    <Select
                      value={inviteData.facility}
                      onValueChange={(v) => setInviteData((prev) => ({ ...prev, facility: v }))}
                    >
                      <SelectTrigger>
                        <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                        <SelectValue placeholder="Select facility" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredInviteFacilities.length > 0 ? (
                          filteredInviteFacilities.map((item) => (
                            <SelectItem key={item.id} value={item.id.toString()}>
                              {item.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectEmpty>No facilities available</SelectEmpty>
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Optional, but recommended when the staff member should land in a specific facility.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Invitation Expiry</Label>
                    <Select
                      value={inviteData.expires_hours}
                      onValueChange={(v) => setInviteData(prev => ({ ...prev, expires_hours: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24">24 hours</SelectItem>
                        <SelectItem value="72">3 days (default)</SelectItem>
                        <SelectItem value="168">7 days</SelectItem>
                        <SelectItem value="336">14 days</SelectItem>
                        <SelectItem value="720">30 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Role & Assignment
                </CardTitle>
                <CardDescription>
                  Pre-configure the role and department for the new staff member
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select
                      value={inviteData.role}
                      onValueChange={(v) => setInviteData(prev => ({ ...prev, role: v }))}
                    >
                      <SelectTrigger>
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
                  </div>

                  <div className="space-y-2">
                    <Label>Department</Label>
                    <Select
                      value={inviteData.department}
                      onValueChange={(v) => setInviteData(prev => ({ ...prev, department: v }))}
                    >
                      <SelectTrigger>
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
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="invite_job_title">Job Title</Label>
                    <Input
                      id="invite_job_title"
                      value={inviteData.job_title}
                      onChange={(e) => setInviteData(prev => ({ ...prev, job_title: e.target.value }))}
                      placeholder="e.g., Senior Nurse"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite_employee_id">Employee ID</Label>
                    <Input
                      id="invite_employee_id"
                      value={inviteData.employee_id}
                      onChange={(e) => setInviteData(prev => ({ ...prev, employee_id: e.target.value }))}
                      placeholder="Auto-generated if blank"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="outline" type="button" asChild>
                <Link href="/admin/staff">Cancel</Link>
              </Button>
              <Button type="submit" disabled={isInviting}>
                <Send className="h-4 w-4 mr-2" />
                {isInviting ? 'Sending…' : 'Send Invitation'}
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* ================================================================ */}
        {/* DIRECT CREATION MODE                                              */}
        {/* ================================================================ */}
        <TabsContent value="direct" className="space-y-6 mt-6">
          <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
            Create the account directly with a temporary password. Use this when email is unavailable
            or the staff member needs immediate access. Start with DHA registry lookup when available
            so licensing fields are populated consistently before assigning the user account.
          </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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
                  autoComplete="off"
                  id="hwr_id"
                  name="hwr_id"
                  spellCheck={false}
                  value={formData.hwr_id}
                  onChange={(e) => handleChange('hwr_id', e.target.value)}
                  placeholder="e.g., PUID-059839…"
                  className={isProfessionalDataPopulated && formData.hwr_id ? 'bg-muted' : ''}
                />
                <p className="text-xs text-muted-foreground">
                  Health Worker Registry ID from DHA
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="license_number">License Number</Label>
                <Input
                  autoComplete="off"
                  id="license_number"
                  name="license_number"
                  spellCheck={false}
                  value={formData.license_number}
                  onChange={(e) => handleChange('license_number', e.target.value)}
                  placeholder="e.g., COC-Clinical Officer-2026-620095…"
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
                  name="licensing_body"
                  value={formData.licensing_body}
                  onChange={(e) => handleChange('licensing_body', e.target.value)}
                  placeholder="e.g., Clinical Officers Council…"
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
                  name="specialization"
                  value={formData.specialization}
                  onChange={(e) => handleChange('specialization', e.target.value)}
                  placeholder="e.g., Clinical Officer…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone_number">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    autoComplete="tel"
                    id="phone_number"
                    inputMode="tel"
                    name="phone_number"
                    type="tel"
                    value={formData.phone_number}
                    onChange={(e) => handleChange('phone_number', e.target.value)}
                    placeholder="+254712345678…"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

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
                  autoComplete="given-name"
                  id="first_name"
                  name="first_name"
                  value={formData.first_name}
                  onChange={(e) => handleChange('first_name', e.target.value)}
                  onBlur={suggestUsername}
                  placeholder="James…"
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
                  name="middle_name"
                  value={formData.middle_name}
                  onChange={(e) => handleChange('middle_name', e.target.value)}
                  placeholder="Kamau (optional)…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">
                  Last Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  autoComplete="family-name"
                  id="last_name"
                  name="last_name"
                  value={formData.last_name}
                  onChange={(e) => handleChange('last_name', e.target.value)}
                  onBlur={suggestUsername}
                  placeholder="Mwangi…"
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
                    name="username"
                    spellCheck={false}
                    autoComplete="off"
                    value={formData.username}
                    onChange={(e) => handleChange('username', e.target.value.toLowerCase().replace(/\s/g, ''))}
                    placeholder="e.g., james.mwangi…"
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
                    autoComplete="email"
                    id="email"
                    name="email"
                    spellCheck={false}
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    placeholder="email@facility.com…"
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
                    autoComplete="off"
                    id="employee_id"
                    name="employee_id"
                    value={formData.employee_id}
                    onChange={(e) => handleChange('employee_id', e.target.value)}
                    placeholder="EMP-001…"
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
              <div className="space-y-2">
                <Label htmlFor="primary_facility">
                  Primary Facility <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.primary_facility}
                  onValueChange={(value) => handleChange('primary_facility', value)}
                >
                  <SelectTrigger className={errors.primary_facility ? 'border-destructive' : ''}>
                    <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Select facility" />
                  </SelectTrigger>
                  <SelectContent>
                    {facilities?.results && facilities.results.length > 0 ? (
                      facilities.results.map((item) => (
                        <SelectItem key={item.id} value={item.id.toString()}>
                          {item.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectEmpty>No facilities available</SelectEmpty>
                    )}
                  </SelectContent>
                </Select>
                {errors.primary_facility && (
                  <p className="text-sm text-destructive">{errors.primary_facility}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  The selected facility becomes the staff member&apos;s primary assignment and drives organization resolution.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" type="button" asChild>
            <Link href="/admin/staff">Cancel</Link>
          </Button>
          <Button type="submit" disabled={createStaff.isPending || usernameStatus === 'taken'}>
            <Save className="h-4 w-4 mr-2" />
            {createStaff.isPending ? 'Creating…' : 'Create Staff Profile'}
          </Button>
        </div>
      </form>
        </TabsContent>
      </Tabs>

      {/* Credential Dialog for direct creation */}
      <CredentialDialog
        open={credentialDialog.open}
        onClose={() => {
          setCredentialDialog(prev => ({ ...prev, open: false }));
          router.push('/admin/staff');
        }}
        username={credentialDialog.username}
        tempPassword={credentialDialog.tempPassword}
        fullName={credentialDialog.fullName}
        email={credentialDialog.email}
      />
    </div>
  );
}
