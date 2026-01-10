/**
 * Patient Form with SHA Client Registry Integration
 * Enhances patient registration with CR lookup and auto-fill
 * 
 * @see docs/sha-frontend-integration-guide.md - Flow 1
 */
'use client';

import React, { useState, useCallback } from 'react';
import { Search, CheckCircle2, AlertCircle, Info, Loader2, UserCheck, UserPlus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, parse } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import type { 
  ClientRegistryClient, 
  CRLookupStatus,
} from '@/lib/types/sha';

// ============================================================================
// Types
// ============================================================================

interface CRLookupSectionProps {
  /** Callback when client data should be used to pre-fill form */
  onClientFound: (client: ClientRegistryClient) => void;
  /** Current CR status */
  crStatus: CRLookupStatus;
  /** Set CR status */
  setCrStatus: (status: CRLookupStatus) => void;
  /** Current CR client */
  crClient: ClientRegistryClient | null;
  /** Set CR client */
  setCrClient: (client: ClientRegistryClient | null) => void;
  /** Whether the lookup is disabled */
  disabled?: boolean;
}

// ============================================================================
// CR Lookup Section Component
// ============================================================================

export function CRLookupSection({
  onClientFound,
  crStatus,
  setCrStatus,
  crClient,
  setCrClient,
  disabled = false,
}: CRLookupSectionProps) {
  const [identifierType, setIdentifierType] = useState<'national_id' | 'huduma_number' | 'passport_number'>('national_id');
  const [identifierValue, setIdentifierValue] = useState('');
  const [errorMessage, setErrorMessage] = useState<string>();

  const handleLookup = useCallback(async () => {
    if (!identifierValue || identifierValue.trim().length < 3) {
      return;
    }

    setCrStatus('searching');
    setCrClient(null);
    setErrorMessage(undefined);

    try {
      const response = await shaApi.fetchFromClientRegistry({
        [identifierType]: identifierValue.trim(),
      });

      if (response.found && response.client) {
        setCrClient(response.client);
        setCrStatus('found');
        onClientFound(response.client);
      } else {
        setCrStatus('not_found');
      }
    } catch (error) {
      console.error('Client Registry lookup failed:', error);
      setErrorMessage(
        error instanceof Error ? error.message : 'An unexpected error occurred'
      );
      setCrStatus('error');
    }
  }, [identifierValue, identifierType, setCrStatus, setCrClient, onClientFound]);

  const identifierLabels = {
    national_id: 'National ID',
    huduma_number: 'Huduma Number',
    passport_number: 'Passport Number',
  };

  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
          <Search className="h-5 w-5" />
          SHA Client Registry Lookup
        </CardTitle>
        <CardDescription>
          Search the national Client Registry to auto-fill patient information and verify identity
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Identifier Type Tabs */}
        <Tabs 
          value={identifierType} 
          onValueChange={(v) => setIdentifierType(v as typeof identifierType)}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="national_id">National ID</TabsTrigger>
            <TabsTrigger value="huduma_number">Huduma No.</TabsTrigger>
            <TabsTrigger value="passport_number">Passport</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Identifier Input */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              value={identifierValue}
              onChange={(e) => setIdentifierValue(e.target.value)}
              placeholder={`Enter ${identifierLabels[identifierType]}`}
              disabled={disabled || crStatus === 'searching'}
              className={cn(
                crStatus === 'found' && 'border-green-500 focus:ring-green-500',
                crStatus === 'error' && 'border-red-500 focus:ring-red-500'
              )}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleLookup();
                }
              }}
            />
          </div>
          <Button
            type="button"
            onClick={handleLookup}
            disabled={disabled || crStatus === 'searching' || !identifierValue || identifierValue.trim().length < 3}
            variant={crStatus === 'found' ? 'outline' : 'default'}
            className={cn(
              crStatus === 'found' && 'border-green-500 text-green-600 hover:text-green-700'
            )}
          >
            {crStatus === 'searching' ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : crStatus === 'found' ? (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            {crStatus === 'found' ? 'Verified' : 'Verify'}
          </Button>
        </div>

        {/* Status Messages */}
        {crStatus === 'searching' && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Searching Client Registry...</span>
          </div>
        )}

        {crStatus === 'found' && crClient && (
          <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-3">
              <UserCheck className="h-5 w-5 text-green-600" />
              <span className="font-medium text-green-700 dark:text-green-300">
                Client Found
              </span>
              <Badge variant="outline" className="ml-auto text-green-600 border-green-600">
                {crClient.client_number}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div>
                <Label className="text-muted-foreground text-xs">Name</Label>
                <p className="font-medium">
                  {crClient.first_name} {crClient.middle_name && `${crClient.middle_name} `}{crClient.last_name}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Date of Birth</Label>
                <p className="font-medium">{crClient.date_of_birth}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Gender</Label>
                <p className="font-medium">
                  {crClient.gender === 'M' ? 'Male' : crClient.gender === 'F' ? 'Female' : 'Other'}
                </p>
              </div>
            </div>
            <Alert className="mt-3 border-green-500 bg-green-100 dark:bg-green-900">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700 dark:text-green-300">
                Form fields have been pre-filled with verified data from the Client Registry.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {crStatus === 'not_found' && (
          <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <UserPlus className="h-4 w-4 text-yellow-600" />
            <AlertTitle className="text-yellow-700">Not Found in Client Registry</AlertTitle>
            <AlertDescription className="text-yellow-600">
              No matching record found. You can proceed to register the patient manually.
              They will be registered in the Client Registry when saved.
            </AlertDescription>
          </Alert>
        )}

        {crStatus === 'error' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Lookup Failed</AlertTitle>
            <AlertDescription>
              {errorMessage || 'Unable to connect to Client Registry. You can proceed with manual entry.'}
            </AlertDescription>
          </Alert>
        )}

        {crStatus === 'idle' && (
          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-700 dark:text-blue-300">
              Enter the patient&apos;s identifier and click Verify to search the SHA Client Registry.
              This will auto-fill verified information and speed up registration.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Hook for managing CR state in parent form
// ============================================================================

export function useCRLookup() {
  const [crStatus, setCrStatus] = useState<CRLookupStatus>('idle');
  const [crClient, setCrClient] = useState<ClientRegistryClient | null>(null);
  const [crNumber, setCrNumber] = useState<string | null>(null);

  const handleClientFound = useCallback((client: ClientRegistryClient) => {
    setCrClient(client);
    setCrNumber(client.client_number);
    return client;
  }, []);

  const reset = useCallback(() => {
    setCrStatus('idle');
    setCrClient(null);
    setCrNumber(null);
  }, []);

  return {
    crStatus,
    setCrStatus,
    crClient,
    setCrClient,
    crNumber,
    handleClientFound,
    reset,
  };
}

// ============================================================================
// Helper to map CR client to form values
// ============================================================================

export function mapCRClientToFormValues(
  client: ClientRegistryClient,
  setFormValue: (field: string, value: unknown) => void
) {
  // Map basic fields
  if (client.first_name) {
    setFormValue('first_name', client.first_name);
  }
  if (client.last_name) {
    setFormValue('last_name', client.last_name);
  }
  if (client.date_of_birth) {
    try {
      // Try parsing date in various formats
      const dob = parse(client.date_of_birth, 'yyyy-MM-dd', new Date());
      setFormValue('date_of_birth', dob);
    } catch {
      // If parsing fails, try direct ISO date
      const dob = new Date(client.date_of_birth);
      if (!isNaN(dob.getTime())) {
        setFormValue('date_of_birth', dob);
      }
    }
  }
  if (client.gender) {
    setFormValue('gender', client.gender);
  }
  if (client.national_id) {
    setFormValue('national_id', client.national_id);
  }
  if (client.phone_number) {
    setFormValue('phone_number', client.phone_number);
  }
  if (client.email) {
    setFormValue('email', client.email);
  }
}

// ============================================================================
// CR Verified Badge
// ============================================================================

interface CRVerifiedBadgeProps {
  crNumber: string;
  className?: string;
}

export function CRVerifiedBadge({ crNumber, className }: CRVerifiedBadgeProps) {
  return (
    <Badge 
      variant="outline" 
      className={cn(
        'bg-green-50 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-300 dark:border-green-700',
        className
      )}
    >
      <CheckCircle2 className="h-3 w-3 mr-1" />
      CR: {crNumber}
    </Badge>
  );
}

export default CRLookupSection;
