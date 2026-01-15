/**
 * SHA Practitioner Search Component
 * 
 * Reusable component that searches the SHA/DHA Health Worker Registry
 * by HWR (Health Worker Registry) number and returns practitioner details.
 * 
 * Can be used to auto-populate staff profile forms with verified data.
 * 
 * @example
 * <SHAPractitionerSearch
 *   onSelect={(practitioner) => {
 *     setFormData({
 *       ...formData,
 *       license_number: practitioner.hwr_number,
 *       first_name: practitioner.name.split(' ')[0],
 *       last_name: practitioner.name.split(' ').slice(1).join(' '),
 *       specialization: practitioner.specialization,
 *       license_expiry: practitioner.license_expiry,
 *     });
 *   }}
 * />
 */
'use client';

import { useState, useCallback } from 'react';
import { Search, CheckCircle2, XCircle, Loader2, UserCheck, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { shaApi } from '@/lib/api/sha';
import type { PractitionerInfo } from '@/lib/types/sha';

export interface SHAPractitionerSearchProps {
  /** Callback when practitioner is selected/verified */
  onSelect?: (practitioner: PractitionerInfo) => void;
  /** Callback when validation fails */
  onError?: (errors: string[]) => void;
  /** Initial HWR number value */
  defaultValue?: string;
  /** Whether the search is disabled */
  disabled?: boolean;
  /** Custom label */
  label?: string;
  /** Custom placeholder */
  placeholder?: string;
  /** Whether to show the result card */
  showResultCard?: boolean;
  /** Custom class name */
  className?: string;
}

export function SHAPractitionerSearch({
  onSelect,
  onError,
  defaultValue = '',
  disabled = false,
  label = 'HWR Number',
  placeholder = 'Enter HWR number (e.g., HW-12345)',
  showResultCard = true,
  className,
}: SHAPractitionerSearchProps) {
  const [hwrNumber, setHwrNumber] = useState(defaultValue);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    valid: boolean;
    practitioner?: PractitionerInfo;
    errors: string[];
  } | null>(null);

  const handleSearch = useCallback(async () => {
    if (!hwrNumber.trim()) {
      setResult({ valid: false, errors: ['Please enter an HWR number'] });
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const response = await shaApi.validatePractitioner({ hwr_number: hwrNumber.trim() });
      setResult(response);

      if (response.valid && response.practitioner) {
        onSelect?.(response.practitioner);
      } else if (response.errors?.length > 0) {
        onError?.(response.errors);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to validate practitioner';
      setResult({ valid: false, errors: [errorMessage] });
      onError?.([errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [hwrNumber, onSelect, onError]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const getLicenseStatusColor = (status: string) => {
    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus === 'active' || normalizedStatus === 'valid') {
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

  return (
    <div className={cn('space-y-3', className)}>
      <div className="space-y-2">
        <Label htmlFor="hwr-search">{label}</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="hwr-search"
              value={hwrNumber}
              onChange={(e) => setHwrNumber(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled || isLoading}
              className="pl-9"
            />
          </div>
          <Button
            type="button"
            onClick={handleSearch}
            disabled={disabled || isLoading || !hwrNumber.trim()}
            variant="secondary"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserCheck className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline">Verify</span>
          </Button>
        </div>
      </div>

      {/* Result display */}
      {result && showResultCard && (
        <Card className={cn(
          'border-2 transition-colors',
          result.valid 
            ? 'border-green-500 bg-green-50/50 dark:bg-green-950/20' 
            : 'border-destructive bg-destructive/5'
        )}>
          <CardContent className="pt-4">
            {result.valid && result.practitioner ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="font-semibold text-green-700 dark:text-green-400">
                    Practitioner Verified
                  </span>
                </div>
                
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Full Name</p>
                    <p className="font-medium">{result.practitioner.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">HWR Number</p>
                    <p className="font-mono text-sm">{result.practitioner.hwr_number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cadre</p>
                    <p className="font-medium">{result.practitioner.cadre}</p>
                  </div>
                  {result.practitioner.specialization && (
                    <div>
                      <p className="text-xs text-muted-foreground">Specialization</p>
                      <p className="font-medium">{result.practitioner.specialization}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">License Status</p>
                    <Badge className={getLicenseStatusColor(result.practitioner.license_status)}>
                      {result.practitioner.license_status}
                    </Badge>
                  </div>
                  {result.practitioner.license_expiry && (
                    <div>
                      <p className="text-xs text-muted-foreground">License Expiry</p>
                      <p className="font-medium">{result.practitioner.license_expiry}</p>
                    </div>
                  )}
                  {result.practitioner.registration_board && (
                    <div>
                      <p className="text-xs text-muted-foreground">Registration Board</p>
                      <p className="font-medium">{result.practitioner.registration_board}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-destructive" />
                  <span className="font-semibold text-destructive">Validation Failed</span>
                </div>
                {result.errors.length > 0 && (
                  <ul className="space-y-1">
                    {result.errors.map((error, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-destructive">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        {error}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Inline status (when showResultCard is false) */}
      {result && !showResultCard && (
        <div className="flex items-center gap-2 text-sm">
          {result.valid ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-green-600">
                Verified: {result.practitioner?.name}
              </span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="text-destructive">
                {result.errors[0] || 'Validation failed'}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default SHAPractitionerSearch;
