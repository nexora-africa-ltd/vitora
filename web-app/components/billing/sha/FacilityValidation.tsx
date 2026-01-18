/**
 * Facility Validation Component
 * Validates facility MFL code with DHA
 *
 * @see docs/sha-frontend-integration-guide.md - Flow 5
 */
'use client';

import React, { useState, useCallback } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building2,
  Shield,
  Calendar,
  MapPin,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import type {
  FacilityInfo,
  FacilityValidationStatus,
  PractitionerInfo,
} from '@/lib/types/sha';
import { format, parseISO, isPast } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

interface FacilityValidationProps {
  /** Initial facility code */
  initialCode?: string;
  /** Callback when facility is validated */
  onValidated?: (facility: FacilityInfo) => void;
  /** Callback when validation fails */
  onError?: (errors: string[]) => void;
  /** Whether to auto-validate on mount */
  autoValidate?: boolean;
  /** Custom class name */
  className?: string;
  /** Whether the component is read-only */
  readOnly?: boolean;
}

interface PractitionerValidationProps {
  /** Initial HWR number */
  initialHwrNumber?: string;
  /** Callback when practitioner is validated */
  onValidated?: (practitioner: PractitionerInfo) => void;
  /** Callback when validation fails */
  onError?: (errors: string[]) => void;
  /** Whether to auto-validate on mount */
  autoValidate?: boolean;
  /** Custom class name */
  className?: string;
  /** Whether the component is read-only */
  readOnly?: boolean;
}

// ============================================================================
// Facility Details Card
// ============================================================================

interface FacilityDetailsProps {
  facility: FacilityInfo;
  warnings?: string[];
}

function FacilityDetails({ facility, warnings }: FacilityDetailsProps) {
  const isLicenseExpired = facility.license_expiry
    ? isPast(parseISO(facility.license_expiry))
    : false;

  return (
    <Card className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-green-600" />
          <CardTitle className="text-lg text-green-700 dark:text-green-300">
            Facility Validated
          </CardTitle>
          <Badge variant="outline" className="ml-auto text-green-600 border-green-600">
            MFL: {facility.facility_code}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Facility Name */}
        <div>
          <h3 className="font-semibold text-lg">{facility.name}</h3>
          <p className="text-sm text-muted-foreground">{facility.facility_type}</p>
        </div>

        {/* Key Info Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <Label className="text-muted-foreground text-xs">Level</Label>
            <p className="font-medium">Level {facility.level}</p>
            {facility.keph_level && (
              <p className="text-xs text-muted-foreground">{facility.keph_level}</p>
            )}
          </div>

          <div>
            <Label className="text-muted-foreground text-xs">Location</Label>
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3 text-muted-foreground" />
              <p className="font-medium">{facility.county}</p>
            </div>
            {facility.sub_county && (
              <p className="text-xs text-muted-foreground">{facility.sub_county}</p>
            )}
          </div>

          <div>
            <Label className="text-muted-foreground text-xs">Status</Label>
            <Badge
              variant={facility.operational_status === 'Operational' ? 'default' : 'secondary'}
              className="mt-1"
            >
              {facility.operational_status}
            </Badge>
          </div>

          <div>
            <Label className="text-muted-foreground text-xs">SHA Approved</Label>
            <div className="flex items-center gap-1 mt-1">
              {facility.sha_approved ? (
                <>
                  <Shield className="h-4 w-4 text-green-600" />
                  <span className="text-green-600 font-medium">Yes</span>
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 text-red-600" />
                  <span className="text-red-600 font-medium">No</span>
                </>
              )}
            </div>
          </div>

          {facility.license_expiry && (
            <div>
              <Label className="text-muted-foreground text-xs">License Expiry</Label>
              <div className="flex items-center gap-1 mt-1">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <span className={cn(
                  'font-medium',
                  isLicenseExpired && 'text-red-600'
                )}>
                  {format(parseISO(facility.license_expiry), 'MMM d, yyyy')}
                </span>
              </div>
              {isLicenseExpired && (
                <p className="text-xs text-red-600">Expired</p>
              )}
            </div>
          )}

          {facility.beds && (
            <div>
              <Label className="text-muted-foreground text-xs">Beds</Label>
              <p className="font-medium">{facility.beds}</p>
            </div>
          )}

          {facility.owner && (
            <div>
              <Label className="text-muted-foreground text-xs">Owner</Label>
              <p className="font-medium">{facility.owner}</p>
            </div>
          )}
        </div>

        {/* Warnings */}
        {warnings && warnings.length > 0 && (
          <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertTitle className="text-yellow-600">Warnings</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside text-sm text-yellow-600">
                {warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Facility Validation Component
// ============================================================================

export function FacilityValidation({
  initialCode = '',
  onValidated,
  onError,
  autoValidate = false,
  className,
  readOnly = false,
}: FacilityValidationProps) {
  const [facilityCode, setFacilityCode] = useState(initialCode);
  const [status, setStatus] = useState<FacilityValidationStatus>('idle');
  const [facility, setFacility] = useState<FacilityInfo | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const handleValidate = useCallback(async () => {
    if (!facilityCode || facilityCode.trim().length < 3) {
      return;
    }

    setStatus('validating');
    setFacility(null);
    setErrors([]);
    setWarnings([]);

    try {
      const response = await shaApi.validateFacility({
        facility_code: facilityCode.trim(),
      });

      if (response.valid && response.facility) {
        setFacility(response.facility);
        setWarnings(response.warnings || []);
        setStatus('valid');
        onValidated?.(response.facility);
      } else {
        setErrors(response.errors);
        setStatus('invalid');
        onError?.(response.errors);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validation failed';
      setErrors([errorMessage]);
      setStatus('error');
      onError?.([errorMessage]);
    }
  }, [facilityCode, onValidated, onError]);

  // Auto-validate on mount if enabled
  React.useEffect(() => {
    if (autoValidate && initialCode) {
      handleValidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Input Section */}
      <div className="space-y-2">
        <Label htmlFor="facility-code">MFL Code (Facility Code)</Label>
        <div className="flex gap-2">
          <Input
            id="facility-code"
            value={facilityCode}
            onChange={(e) => {
              setFacilityCode(e.target.value);
              if (status !== 'idle') {
                setStatus('idle');
              }
            }}
            placeholder="Enter MFL code (e.g., 24979)"
            disabled={readOnly || status === 'validating'}
            className={cn(
              status === 'valid' && 'border-green-500',
              (status === 'invalid' || status === 'error') && 'border-red-500'
            )}
          />
          <Button
            type="button"
            onClick={handleValidate}
            disabled={
              readOnly ||
              status === 'validating' ||
              !facilityCode ||
              facilityCode.trim().length < 3
            }
            variant={status === 'valid' ? 'outline' : 'secondary'}
            className={cn(
              status === 'valid' && 'border-green-500 text-green-600'
            )}
          >
            {status === 'validating' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : status === 'valid' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
            <span className="ml-2">
              {status === 'valid' ? 'Validated' : 'Validate'}
            </span>
          </Button>
        </div>
      </div>

      {/* Status Display */}
      {status === 'validating' && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Validating facility with DHA...</span>
        </div>
      )}

      {/* Errors */}
      {(status === 'invalid' || status === 'error') && errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Validation Failed</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Facility Details */}
      {status === 'valid' && facility && (
        <FacilityDetails facility={facility} warnings={warnings} />
      )}
    </div>
  );
}

// ============================================================================
// Practitioner Details Card
// ============================================================================

interface PractitionerDetailsProps {
  practitioner: PractitionerInfo;
}

function PractitionerDetails({ practitioner }: PractitionerDetailsProps) {
  const isLicenseExpired = practitioner.license_expiry
    ? isPast(parseISO(practitioner.license_expiry))
    : false;

  return (
    <Card className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <CardTitle className="text-lg text-green-700 dark:text-green-300">
            Practitioner Validated
          </CardTitle>
          <Badge variant="outline" className="ml-auto text-green-600 border-green-600">
            HWR: {practitioner.hwr_number}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <Label className="text-muted-foreground text-xs">Name</Label>
            <p className="font-medium">{practitioner.name}</p>
          </div>

          <div>
            <Label className="text-muted-foreground text-xs">Cadre</Label>
            <p className="font-medium">{practitioner.cadre}</p>
          </div>

          {practitioner.specialization && (
            <div>
              <Label className="text-muted-foreground text-xs">Specialization</Label>
              <p className="font-medium">{practitioner.specialization}</p>
            </div>
          )}

          <div>
            <Label className="text-muted-foreground text-xs">License Status</Label>
            <Badge
              variant={practitioner.license_status === 'Active' ? 'default' : 'secondary'}
              className={cn(
                'mt-1',
                practitioner.license_status === 'Active' && 'bg-green-600'
              )}
            >
              {practitioner.license_status}
            </Badge>
          </div>

          {practitioner.license_expiry && (
            <div>
              <Label className="text-muted-foreground text-xs">License Expiry</Label>
              <div className="flex items-center gap-1 mt-1">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <span className={cn(
                  'font-medium',
                  isLicenseExpired && 'text-red-600'
                )}>
                  {format(parseISO(practitioner.license_expiry), 'MMM d, yyyy')}
                </span>
              </div>
            </div>
          )}

          {practitioner.registration_board && (
            <div>
              <Label className="text-muted-foreground text-xs">Registration Board</Label>
              <p className="font-medium">{practitioner.registration_board}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Practitioner Validation Component
// ============================================================================

export function PractitionerValidation({
  initialHwrNumber = '',
  onValidated,
  onError,
  autoValidate = false,
  className,
  readOnly = false,
}: PractitionerValidationProps) {
  const [hwrNumber, setHwrNumber] = useState(initialHwrNumber);
  const [status, setStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid' | 'error'>('idle');
  const [practitioner, setPractitioner] = useState<PractitionerInfo | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const handleValidate = useCallback(async () => {
    if (!hwrNumber || hwrNumber.trim().length < 3) {
      return;
    }

    setStatus('validating');
    setPractitioner(null);
    setErrors([]);

    try {
      const response = await shaApi.validatePractitioner({
        hwr_number: hwrNumber.trim(),
      });

      if (response.valid && response.practitioner) {
        setPractitioner(response.practitioner);
        setStatus('valid');
        onValidated?.(response.practitioner);
      } else {
        setErrors(response.errors);
        setStatus('invalid');
        onError?.(response.errors);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validation failed';
      setErrors([errorMessage]);
      setStatus('error');
      onError?.([errorMessage]);
    }
  }, [hwrNumber, onValidated, onError]);

  // Auto-validate on mount if enabled
  React.useEffect(() => {
    if (autoValidate && initialHwrNumber) {
      handleValidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Input Section */}
      <div className="space-y-2">
        <Label htmlFor="hwr-number">HWR Number (Health Worker Registry)</Label>
        <div className="flex gap-2">
          <Input
            id="hwr-number"
            value={hwrNumber}
            onChange={(e) => {
              setHwrNumber(e.target.value);
              if (status !== 'idle') {
                setStatus('idle');
              }
            }}
            placeholder="Enter HWR number"
            disabled={readOnly || status === 'validating'}
            className={cn(
              status === 'valid' && 'border-green-500',
              (status === 'invalid' || status === 'error') && 'border-red-500'
            )}
          />
          <Button
            type="button"
            onClick={handleValidate}
            disabled={
              readOnly ||
              status === 'validating' ||
              !hwrNumber ||
              hwrNumber.trim().length < 3
            }
            variant={status === 'valid' ? 'outline' : 'secondary'}
            className={cn(
              status === 'valid' && 'border-green-500 text-green-600'
            )}
          >
            {status === 'validating' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : status === 'valid' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Shield className="h-4 w-4" />
            )}
            <span className="ml-2">
              {status === 'valid' ? 'Validated' : 'Validate'}
            </span>
          </Button>
        </div>
      </div>

      {/* Status Display */}
      {status === 'validating' && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Validating practitioner with HWR...</span>
        </div>
      )}

      {/* Errors */}
      {(status === 'invalid' || status === 'error') && errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Validation Failed</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Practitioner Details */}
      {status === 'valid' && practitioner && (
        <PractitionerDetails practitioner={practitioner} />
      )}
    </div>
  );
}

export default FacilityValidation;
