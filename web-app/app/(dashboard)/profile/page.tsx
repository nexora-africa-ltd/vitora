'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, CheckCircle2, KeyRound, Loader2, Mail, Search, Settings, Shield, User as UserIcon, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { DHAPractitionerSearch } from '@/components/sha';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { shaApi } from '@/lib/api/sha';
import { useAuth } from '@/lib/auth/context';
import { useLogout } from '@/lib/auth/hooks';
import type { User } from '@/lib/auth/context';
import { useMyStaffProfile } from '@/lib/hooks/use-rbac';
import type { DHAPractitioner, PractitionerInfo } from '@/lib/types/sha';

const PERMISSIONS_PAGE_SIZE = 8;

function formatLabel(value: string): string {
  return value
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatRole(role?: string, isSuperuser?: boolean, isStaff?: boolean): string {
  if (role) {
    return formatLabel(role);
  }

  if (isSuperuser) {
    return 'Superuser';
  }

  if (isStaff) {
    return 'Staff';
  }

  return 'User';
}

function formatPermission(permission: string): string {
  const [domain, action] = permission.split('.', 2);

  if (!action) {
    return formatLabel(permission);
  }

  return `${formatLabel(domain)} / ${formatLabel(action)}`;
}

function getUserInitials(firstName?: string, lastName?: string, username?: string): string {
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || username?.[0] || ''}`.trim();
  return (initials || 'U').toUpperCase();
}

function normalizeValue(value?: string | null): string {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') || '';
}

function isHwrCompliant(practitioner: DHAPractitioner | null): boolean {
  if (!practitioner) {
    return false;
  }

  const normalizedStatus = practitioner.membership.status.toLowerCase();
  return Boolean(
    practitioner.membership.is_active &&
    practitioner.membership.is_withdrawn !== 1 &&
    ['licensed', 'active'].includes(normalizedStatus)
  );
}

function getLicenseState(practitioner: DHAPractitioner | null): {
  label: string;
  tone: string;
} {
  if (!practitioner) {
    return { label: 'Not verified', tone: 'text-muted-foreground' };
  }

  const days = practitioner.membership.license_expires_in_days;
  if (days < 0) {
    return { label: 'Expired', tone: 'text-destructive' };
  }
  if (days <= 30) {
    return { label: `Expires in ${days} days`, tone: 'text-destructive' };
  }
  if (days <= 90) {
    return { label: `Expires in ${days} days`, tone: 'text-amber-600' };
  }
  return { label: `Valid for ${days} days`, tone: 'text-green-600' };
}

function isProfileMatch(user: User | null, practitioner: DHAPractitioner | null): boolean {
  if (!user || !practitioner) {
    return false;
  }

  const userFullName = normalizeValue(`${user.first_name} ${user.last_name}`);
  const practitionerFullName = normalizeValue(practitioner.membership.full_name);
  const namesMatch = userFullName.length > 0 && userFullName === practitionerFullName;

  const userEmail = normalizeValue(user.email);
  const practitionerEmail = normalizeValue(practitioner.contacts.email);
  const emailMatches = userEmail.length > 0 && practitionerEmail.length > 0 && userEmail === practitionerEmail;

  return namesMatch || emailMatches;
}

function getComplianceTone(isCompliant: boolean): {
  badge: string;
  panel: string;
  icon: typeof CheckCircle2;
  label: string;
} {
  if (isCompliant) {
    return {
      badge: 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300',
      panel: 'border-green-200 bg-green-50/60 dark:border-green-900 dark:bg-green-950/20',
      icon: CheckCircle2,
      label: 'Compliant',
    };
  }

  return {
    badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
    panel: 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20',
    icon: AlertTriangle,
    label: 'Needs review',
  };
}

export default function ProfilePage() {
  const { user } = useAuth();
  const logout = useLogout();
  const { data: staffProfile, isLoading: isStaffProfileLoading } = useMyStaffProfile();
  const [permissionsPage, setPermissionsPage] = useState(0);
  const [verifiedPractitioner, setVerifiedPractitioner] = useState<DHAPractitioner | null>(null);
  const [validatedHwrPractitioner, setValidatedHwrPractitioner] = useState<PractitionerInfo | null>(null);
  const [isValidatingHwr, setIsValidatingHwr] = useState(false);
  const [hwrValidationError, setHwrValidationError] = useState<string | null>(null);

  const displayName = user
    ? `${user.first_name} ${user.last_name}`.trim() || user.username
    : 'User';
  const email = user?.email?.trim() || 'No email address on file';
  const roleLabel = formatRole(user?.role, user?.is_superuser, user?.is_staff);
  const permissions = user?.permissions ?? [];
  const userInitials = getUserInitials(user?.first_name, user?.last_name, user?.username);
  const totalPermissionPages = Math.max(1, Math.ceil(permissions.length / PERMISSIONS_PAGE_SIZE));
  const permissionsStart = permissionsPage * PERMISSIONS_PAGE_SIZE;
  const visiblePermissions = permissions.slice(permissionsStart, permissionsStart + PERMISSIONS_PAGE_SIZE);
  const permissionRangeEnd = permissions.length === 0
    ? 0
    : Math.min(permissionsStart + PERMISSIONS_PAGE_SIZE, permissions.length);

  const hwrCompliant = isHwrCompliant(verifiedPractitioner);
  const complianceTone = getComplianceTone(hwrCompliant);
  const licenseState = getLicenseState(verifiedPractitioner);
  const profileMatchesRegistry = isProfileMatch(user, verifiedPractitioner);
  const ComplianceIcon = complianceTone.icon;

  useEffect(() => {
    let isActive = true;

    const hwrId = staffProfile?.hwr_id?.trim();
    if (!hwrId) {
      setValidatedHwrPractitioner(null);
      setHwrValidationError(null);
      return undefined;
    }

    const validateHwr = async () => {
      setIsValidatingHwr(true);
      setHwrValidationError(null);

      try {
        const response = await shaApi.validatePractitioner({ hwr_number: hwrId });
        if (!isActive) {
          return;
        }

        if (response.valid && response.practitioner) {
          setValidatedHwrPractitioner(response.practitioner);
        } else {
          setValidatedHwrPractitioner(null);
          setHwrValidationError(response.errors[0] || 'Unable to validate HWR number');
        }
      } catch (error) {
        if (!isActive) {
          return;
        }

        setValidatedHwrPractitioner(null);
        setHwrValidationError(error instanceof Error ? error.message : 'Unable to validate HWR number');
      } finally {
        if (isActive) {
          setIsValidatingHwr(false);
        }
      }
    };

    validateHwr();

    return () => {
      isActive = false;
    };
  }, [staffProfile?.hwr_id]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Profile"
        helpContent="Review your account details, role access, and security-related settings."
        actions={(
          <Button asChild variant="outline">
            <Link href="/settings">
              <Settings className="h-4 w-4" />
              Open Settings
            </Link>
          </Button>
        )}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Card className="overflow-hidden border-border/70">
          <div className="h-24 bg-[radial-gradient(circle_at_top_left,_hsl(var(--primary)/0.22),_transparent_55%),linear-gradient(135deg,_hsl(var(--muted))_0%,_hsl(var(--background))_100%)]" />
          <CardContent className="space-y-6 p-6 pt-0">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Avatar className="-mt-8 h-20 w-20 border-4 border-background shadow-sm">
                  <AvatarFallback className="bg-primary text-xl font-semibold text-primary-foreground">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{displayName}</h2>
                    <p className="text-sm text-muted-foreground">@{user?.username || 'unknown-user'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{roleLabel}</Badge>
                    {user?.is_staff && <Badge variant="outline">Staff Account</Badge>}
                    {user?.is_superuser && <Badge>Superuser</Badge>}
                  </div>
                </div>
              </div>

              <Button variant="outline" onClick={logout} className="w-full sm:w-auto">
                Sign Out
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Mail className="h-4 w-4 text-primary" />
                  Email
                </div>
                <p className="mt-2 break-all text-sm text-muted-foreground">{email}</p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <UserIcon className="h-4 w-4 text-primary" />
                  Username
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{user?.username || 'Not available'}</p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Shield className="h-4 w-4 text-primary" />
                  Permissions
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {permissions.length} assigned permission{permissions.length === 1 ? '' : 's'}
                </p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <BadgeCheck className="h-4 w-4 text-primary" />
                  HWR ID
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{staffProfile?.hwr_id || 'Not linked'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">Access Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <span className="text-sm text-muted-foreground">Role</span>
                <span className="text-sm font-medium">{roleLabel}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <span className="text-sm text-muted-foreground">Staff Access</span>
                <span className="text-sm font-medium">{user?.is_staff ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <span className="text-sm text-muted-foreground">Superuser Access</span>
                <span className="text-sm font-medium">{user?.is_superuser ? 'Enabled' : 'Disabled'}</span>
              </div>
            </CardContent>
          </Card>

          <Card className={complianceTone.panel}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <BadgeCheck className="h-4 w-4" />
                HWR Compliance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border bg-background/70 px-3 py-2">
                <span className="text-sm text-muted-foreground">Registry status</span>
                <Badge className={complianceTone.badge} variant="outline">
                  <ComplianceIcon className="h-3.5 w-3.5" />
                  {verifiedPractitioner ? complianceTone.label : (validatedHwrPractitioner ? 'Verified by HWR ID' : 'Not verified')}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-background/70 px-3 py-2">
                <span className="text-sm text-muted-foreground">License window</span>
                <span className={`text-sm font-medium ${verifiedPractitioner ? licenseState.tone : validatedHwrPractitioner ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {verifiedPractitioner ? licenseState.label : validatedHwrPractitioner?.license_status || 'Not verified'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-background/70 px-3 py-2">
                <span className="text-sm text-muted-foreground">Profile match</span>
                <span className="text-sm font-medium">
                  {verifiedPractitioner
                    ? (profileMatchesRegistry ? 'Matched' : 'Review required')
                    : validatedHwrPractitioner
                      ? 'Matched via staff HWR link'
                      : 'Pending lookup'}
                </span>
              </div>
              {verifiedPractitioner ? (
                <div className="rounded-lg border bg-background/70 px-3 py-3 text-sm">
                  <p className="font-medium">{verifiedPractitioner.membership.registration_id}</p>
                  <p className="text-muted-foreground">
                    {verifiedPractitioner.professional_details.professional_cadre} at {verifiedPractitioner.membership.licensing_body}
                  </p>
                </div>
              ) : validatedHwrPractitioner ? (
                <div className="rounded-lg border bg-background/70 px-3 py-3 text-sm">
                  <p className="font-medium">{validatedHwrPractitioner.hwr_number}</p>
                  <p className="text-muted-foreground">
                    {validatedHwrPractitioner.cadre}
                    {validatedHwrPractitioner.registration_board ? ` at ${validatedHwrPractitioner.registration_board}` : ''}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {staffProfile?.hwr_id
                    ? 'This account has an HWR link on file, but it has not produced a valid registry verification yet.'
                    : 'This account does not have an HWR ID on file. Use the DHA practitioner search below to verify and compare.'}
                </p>
              )}

              {isValidatingHwr && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Validating staff-linked HWR ID...
                </div>
              )}

              {hwrValidationError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {hwrValidationError}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">Security & Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border px-3 py-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <KeyRound className="h-4 w-4 text-primary" />
                  Multi-factor authentication
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Manage MFA, SHA integration, and other account settings from the settings page.
                </p>
              </div>
              <Button asChild className="w-full">
                <Link href="/settings">
                  <Settings className="h-4 w-4" />
                  Go to Settings
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Search className="h-4 w-4" />
            DHA Registry Lookup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {staffProfile?.hwr_id
              ? 'The profile now validates the stored HWR link automatically. Use manual search only when you need to compare or troubleshoot the registry record.'
              : 'No HWR ID is linked to this staff profile, so use DHA search to compare or verify a registry record manually.'}
          </p>

          <DHAPractitionerSearch
            showDetailedResult={false}
            onSelect={(practitioner) => setVerifiedPractitioner(practitioner)}
            onError={() => setVerifiedPractitioner(null)}
          />

          {verifiedPractitioner && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {hwrCompliant ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
                  Registry compliance
                </div>
                <p className="mt-2 text-sm font-medium">{hwrCompliant ? 'Active and licensed' : 'Non-compliant or inactive'}</p>
                <p className="mt-1 text-sm text-muted-foreground">{verifiedPractitioner.membership.status}</p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Shield className="h-4 w-4 text-primary" />
                  Regulatory body
                </div>
                <p className="mt-2 text-sm font-medium">{verifiedPractitioner.membership.licensing_body}</p>
                <p className="mt-1 text-sm text-muted-foreground">{verifiedPractitioner.professional_details.professional_cadre}</p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <UserIcon className="h-4 w-4 text-primary" />
                  Account alignment
                </div>
                <p className="mt-2 text-sm font-medium">{profileMatchesRegistry ? 'User profile matches registry' : 'Review name/email alignment'}</p>
                <p className="mt-1 text-sm text-muted-foreground">{verifiedPractitioner.contacts.email || 'No registry email on file'}</p>
              </div>
            </div>
          )}

          {isStaffProfileLoading && (
            <p className="text-sm text-muted-foreground">Loading staff profile linkage...</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base sm:text-lg">Assigned Permissions</CardTitle>
            {permissions.length > 0 && (
              <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground sm:justify-end">
                <span>
                  Showing {permissionsStart + 1}-{permissionRangeEnd} of {permissions.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPermissionsPage((page) => Math.max(0, page - 1))}
                    disabled={permissionsPage === 0}
                  >
                    Previous
                  </Button>
                  <span>
                    {permissionsPage + 1}/{totalPermissionPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPermissionsPage((page) => Math.min(totalPermissionPages - 1, page + 1))}
                    disabled={permissionsPage >= totalPermissionPages - 1}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {permissions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {visiblePermissions.map((permission) => (
                <Badge key={permission} variant="outline" className="py-1">
                  {formatPermission(permission)}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No explicit permissions are assigned to this account.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}