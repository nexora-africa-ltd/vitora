/**
 * DHA Practitioner Search Component
 *
 * Reusable component that searches the DHA (Digital Health Authority)
 * Health Worker Registry by National ID or Passport number.
 *
 * Returns comprehensive practitioner information including:
 * - Membership status and registration details
 * - License history with validity dates
 * - Professional qualifications and cadre
 * - Contact information
 *
 * Based on: https://uat.dha.go.ke/v1/practitioner-search API
 *
 * @example
 * <DHAPractitionerSearch
 *   onSelect={(practitioner) => {
 *     setFormData({
 *       ...formData,
 *       first_name: practitioner.membership.first_name,
 *       last_name: practitioner.membership.last_name,
 *       email: practitioner.contacts.email,
 *       phone_number: practitioner.contacts.phone,
 *       license_number: practitioner.membership.registration_id,
 *       specialization: practitioner.professional_details.specialty,
 *     });
 *   }}
 * />
 */
'use client';

import { useState, useCallback } from 'react';
import {
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  UserCheck,
  UserX,
  GraduationCap,
  Phone,
  Mail,
  MapPin,
  Calendar,
  IdCard,
} from 'lucide-react';
import { SHALogo } from '@/components/ui/sha-logo';
import { KenyaCoatOfArms } from '@/components/ui/kenya-coat-of-arms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils/cn';
import { shaApi } from '@/lib/api/sha';
import type { DHAPractitioner, DHAPractitionerLicense } from '@/lib/types/sha';

export interface DHAPractitionerSearchProps {
  /** Callback when practitioner is found and selected */
  onSelect?: (practitioner: DHAPractitioner) => void;
  /** Callback when search fails */
  onError?: (error: string) => void;
  /** Whether the search is disabled */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
  /** Whether to show the detailed result card */
  showDetailedResult?: boolean;
  /** Whether to auto-select on successful search */
  autoSelect?: boolean;
}

type IdentificationType = 'National ID' | 'passport';

export function DHAPractitionerSearch({
  onSelect,
  onError,
  disabled = false,
  className,
  showDetailedResult = true,
  autoSelect = true,
}: DHAPractitionerSearchProps) {
  const [idType, setIdType] = useState<IdentificationType>('National ID');
  const [idNumber, setIdNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [practitioner, setPractitioner] = useState<DHAPractitioner | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!idNumber.trim()) {
      setError('Please enter an identification number');
      return;
    }

    setIsLoading(true);
    setError(null);
    setNotFound(false);
    setPractitioner(null);

    try {
      const response = await shaApi.searchPractitioner({
        identification_type: idType,
        identification_number: idNumber.trim(),
      });

      if (response.message) {
        setPractitioner(response.message);
        if (autoSelect && onSelect) {
          onSelect(response.message);
        }
      } else {
        setNotFound(true);
        onError?.('No practitioner found');
      }
    } catch (err: unknown) {
      // Check if it's a 404 (not found) response - treat as "not found" not an error
      const is404 = 
        (err && typeof err === 'object' && 'response' in err && 
          (err as { response?: { status?: number } }).response?.status === 404) ||
        (err instanceof Error && err.message.includes('404'));
      
      if (is404) {
        setNotFound(true);
        onError?.('No practitioner found');
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Failed to search practitioner';
        setError(errorMessage);
        onError?.(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  }, [idType, idNumber, autoSelect, onSelect, onError]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleUseData = () => {
    if (practitioner && onSelect) {
      onSelect(practitioner);
    }
  };

  const getStatusColor = (status: string, isActive: number) => {
    if (!isActive) {
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    }
    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus === 'licensed' || normalizedStatus === 'active') {
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    }
    if (normalizedStatus === 'expired') {
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    }
    if (normalizedStatus === 'suspended') {
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    }
    return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  };

  const formatLicenseExpiry = (days: number) => {
    if (days < 0) return { text: 'Expired', color: 'text-red-600' };
    if (days <= 30) return { text: `${days} days`, color: 'text-red-600' };
    if (days <= 90) return { text: `${days} days`, color: 'text-yellow-600' };
    return { text: `${days} days`, color: 'text-green-600' };
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search Form */}
      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <KenyaCoatOfArms size={16} />
          Search DHA Health Worker Registry
        </Label>
        <div className="flex gap-2">
          <Select
            value={idType}
            onValueChange={(value) => setIdType(value as IdentificationType)}
            disabled={disabled || isLoading}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="National ID">National ID</SelectItem>
              <SelectItem value="passport">Passport</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={idType === 'National ID' ? 'Enter National ID number' : 'Enter Passport number'}
              disabled={disabled || isLoading}
              className="pl-9"
            />
          </div>
          <Button
            type="button"
            onClick={handleSearch}
            disabled={disabled || isLoading || !idNumber.trim()}
            variant="secondary"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline">Search</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Search the Kenya Digital Health Authority registry to verify and auto-fill practitioner details
        </p>
      </div>

      {/* Not Found Display */}
      {notFound && (
        <Card className="border-2 border-amber-400 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                <UserX className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-semibold text-amber-800 dark:text-amber-300">
                  Practitioner Not Found
                </h4>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  No practitioner was found in the DHA Health Worker Registry with {idType}{' '}
                  <span className="font-mono font-medium">{idNumber}</span>
                </p>
                <div className="pt-2 space-y-1 text-xs text-amber-600 dark:text-amber-500">
                  <p>This could mean:</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-1">
                    <li>The identification number was entered incorrectly</li>
                    <li>The practitioner is not registered with a Kenyan licensing body</li>
                    <li>The registration is under a different ID type (try Passport or National ID)</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <XCircle className="h-5 w-5 text-destructive shrink-0" />
          <span className="text-sm text-destructive">{error}</span>
        </div>
      )}

      {/* Result Display */}
      {practitioner && showDetailedResult && (
        <Card className="border-2 border-green-500 bg-green-50/50 dark:bg-green-950/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <CardTitle className="text-lg text-green-700 dark:text-green-400">
                  Practitioner Found
                </CardTitle>
              </div>
              {!autoSelect && (
                <Button size="sm" onClick={handleUseData}>
                  <UserCheck className="h-4 w-4 mr-2" />
                  Use This Data
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Membership Info */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold flex items-center gap-2">
                  <SHALogo size="sm" />
                  Registration Details
                </h4>
                <Badge className={getStatusColor(practitioner.membership.status, practitioner.membership.is_active)}>
                  {practitioner.membership.status}
                </Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Full Name</p>
                  <p className="font-medium">
                    {practitioner.membership.salutation} {practitioner.membership.full_name.trim()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Registration ID</p>
                  <p className="font-mono text-sm">{practitioner.membership.registration_id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Licensing Body</p>
                  <p className="font-medium text-sm">{practitioner.membership.licensing_body}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Specialty</p>
                  <p className="font-medium text-sm">{practitioner.membership.specialty || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">License Expires In</p>
                  {(() => {
                    const expiry = formatLicenseExpiry(practitioner.membership.license_expires_in_days);
                    return <p className={cn('font-medium text-sm', expiry.color)}>{expiry.text}</p>;
                  })()}
                </div>
                {practitioner.membership.is_withdrawn === 1 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Withdrawal Reason</p>
                    <p className="font-medium text-sm text-red-600">{practitioner.membership.withdrawal_reason || 'N/A'}</p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Professional Details */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                Professional Details
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Professional Cadre</p>
                  <p className="font-medium text-sm">{practitioner.professional_details.professional_cadre}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Practice Type</p>
                  <p className="font-medium text-sm">{practitioner.professional_details.practice_type}</p>
                </div>
                {practitioner.professional_details.specialty && (
                  <div>
                    <p className="text-xs text-muted-foreground">Specialty</p>
                    <p className="font-medium text-sm">{practitioner.professional_details.specialty}</p>
                  </div>
                )}
                {practitioner.professional_details.subspecialty && (
                  <div>
                    <p className="text-xs text-muted-foreground">Subspecialty</p>
                    <p className="font-medium text-sm">{practitioner.professional_details.subspecialty}</p>
                  </div>
                )}
              </div>
              {practitioner.professional_details.educational_qualifications && (
                <div>
                  <p className="text-xs text-muted-foreground">Educational Qualifications</p>
                  <p className="font-medium text-sm">{practitioner.professional_details.educational_qualifications}</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Contact Info */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Contact Information
              </h4>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {practitioner.contacts.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{practitioner.contacts.phone}</span>
                  </div>
                )}
                {practitioner.contacts.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm lowercase">{practitioner.contacts.email}</span>
                  </div>
                )}
                {practitioner.contacts.postal_address && (
                  <div className="flex items-center gap-2 col-span-full">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">{practitioner.contacts.postal_address}</span>
                  </div>
                )}
              </div>
            </div>

            {/* License History */}
            {practitioner.licenses && practitioner.licenses.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    License History
                  </h4>
                  <div className="space-y-2">
                    {practitioner.licenses.map((license, index) => (
                      <div
                        key={license.id || index}
                        className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm"
                      >
                        <div>
                          <span className="font-medium">{license.license_type}</span>
                          <span className="text-muted-foreground ml-2">({license.external_reference_id})</span>
                        </div>
                        <div className="text-right text-muted-foreground">
                          {license.license_start !== 'None' && (
                            <span>{license.license_start} → </span>
                          )}
                          <span className={
                            new Date(license.license_end) < new Date() ? 'text-red-600' : ''
                          }>
                            {license.license_end}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Identifiers */}
            <Separator />
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <IdCard className="h-4 w-4" />
                Identifiers
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">{practitioner.identifiers.identification_type}</p>
                  <p className="font-mono text-sm">{practitioner.identifiers.identification_number}</p>
                </div>
                {practitioner.identifiers.client_registry_id && (
                  <div>
                    <p className="text-xs text-muted-foreground">Client Registry ID</p>
                    <p className="font-mono text-sm">{practitioner.identifiers.client_registry_id}</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compact result (when showDetailedResult is false) */}
      {practitioner && !showDetailedResult && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium text-green-700 dark:text-green-400">
                {practitioner.membership.full_name.trim()}
              </p>
              <p className="text-sm text-green-600 dark:text-green-500">
                {practitioner.professional_details.professional_cadre} • {practitioner.membership.licensing_body}
              </p>
            </div>
          </div>
          <Badge className={getStatusColor(practitioner.membership.status, practitioner.membership.is_active)}>
            {practitioner.membership.status}
          </Badge>
        </div>
      )}
    </div>
  );
}

// Re-export for backward compatibility (alias)
export { DHAPractitionerSearch as SHAPractitionerSearch };

export default DHAPractitionerSearch;
