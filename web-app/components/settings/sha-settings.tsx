/**
 * SHA Settings Tab Component
 * Configuration for SHA (Social Health Authority) integration
 * Sprint 1.5-1.6: SHA Integration
 */
'use client';

import { useState } from 'react';
import {
  Shield,
  Building2,
  User,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { FacilityValidation, PractitionerValidation } from '@/components/billing/sha';
import { useToast } from '@/lib/hooks/use-toast';
import type { FacilityInfo, PractitionerInfo } from '@/lib/types/sha';

export function SHASettingsTab() {
  const { toast } = useToast();
  const [facilityCode, setFacilityCode] = useState('');
  const [practitionerLicense, setPractitionerLicense] = useState('');
  const [validatedFacility, setValidatedFacility] = useState<FacilityInfo | null>(null);
  const [validatedPractitioner, setValidatedPractitioner] = useState<PractitionerInfo | null>(null);

  const handleFacilityValidated = (info: FacilityInfo) => {
    setValidatedFacility(info);
    toast({
      title: 'Facility Validated',
      description: `${info.name} is ${info.sha_approved ? 'approved by SHA' : 'not approved by SHA'}`,
    });
  };

  const handlePractitionerValidated = (info: PractitionerInfo) => {
    setValidatedPractitioner(info);
    toast({
      title: 'Practitioner Validated',
      description: `${info.name} - ${info.cadre}`,
    });
  };

  return (
    <div className="space-y-6">
      {/* SHA Integration Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <CardTitle>SHA Integration Status</CardTitle>
          </div>
          <CardDescription>
            Current status of Social Health Authority integration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium">API Connection</p>
                <p className="text-xs text-muted-foreground">Connected</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Client Registry</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Claims Submission</p>
                <p className="text-xs text-muted-foreground">Enabled</p>
              </div>
            </div>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>SHA Integration Active</AlertTitle>
            <AlertDescription>
              Your facility is connected to SHA systems. You can verify patient eligibility,
              submit claims, and use standardized terminologies (ICD-11, LOINC).
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Facility Validation */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <CardTitle>Facility Validation</CardTitle>
          </div>
          <CardDescription>
            Validate your facility's MFL (Master Facility List) code with SHA
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mfl-code">MFL Code</Label>
            <div className="flex gap-2">
              <Input
                id="mfl-code"
                placeholder="Enter MFL code (e.g., 12345)"
                value={facilityCode}
                onChange={(e) => setFacilityCode(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The Master Facility List code assigned by the Ministry of Health
            </p>
          </div>

          {facilityCode && (
            <FacilityValidation
              initialCode={facilityCode}
              onValidated={handleFacilityValidated}
              autoValidate={true}
            />
          )}

          {validatedFacility && (
            <div className="rounded-lg border p-4 bg-muted/50">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium">{validatedFacility.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    Level {validatedFacility.level} • {validatedFacility.county}
                    {validatedFacility.sub_county && `, ${validatedFacility.sub_county}`}
                  </p>
                </div>
                <Badge variant={validatedFacility.sha_approved ? 'default' : 'secondary'}>
                  {validatedFacility.sha_approved ? 'SHA Approved' : 'Not Approved'}
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Practitioner Validation */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5" />
            <CardTitle>Practitioner Validation</CardTitle>
          </div>
          <CardDescription>
            Validate healthcare practitioner licenses with regulatory bodies
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="license-number">License Number</Label>
            <div className="flex gap-2">
              <Input
                id="license-number"
                placeholder="Enter license number"
                value={practitionerLicense}
                onChange={(e) => setPractitionerLicense(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              License number from KMPDB, NCK, or other regulatory body
            </p>
          </div>

          {practitionerLicense && (
            <PractitionerValidation
              initialHwrNumber={practitionerLicense}
              onValidated={handlePractitionerValidated}
              autoValidate={true}
            />
          )}

          {validatedPractitioner && (
            <div className="rounded-lg border p-4 bg-muted/50">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium">{validatedPractitioner.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {validatedPractitioner.cadre}
                    {validatedPractitioner.specialization && ` • ${validatedPractitioner.specialization}`}
                  </p>
                  {validatedPractitioner.license_expiry && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Expires: {new Date(validatedPractitioner.license_expiry).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <Badge variant={validatedPractitioner.license_status === 'Active' ? 'default' : 'destructive'}>
                  {validatedPractitioner.license_status}
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Terminology Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Medical Terminologies</CardTitle>
          <CardDescription>
            Standardized coding systems enabled for SHA claims
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="p-3 rounded-lg border">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="font-mono">ICD-11</Badge>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <p className="text-xs text-muted-foreground">
                Diagnoses & Conditions
              </p>
            </div>

            <div className="p-3 rounded-lg border">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="font-mono">LOINC</Badge>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <p className="text-xs text-muted-foreground">
                Laboratory Tests
              </p>
            </div>

            <div className="p-3 rounded-lg border">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="font-mono">SHA Drugs</Badge>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <p className="text-xs text-muted-foreground">
                Pharmaceutical Products
              </p>
            </div>

            <div className="p-3 rounded-lg border">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="font-mono">ICHI</Badge>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <p className="text-xs text-muted-foreground">
                Health Interventions
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <p className="text-xs text-muted-foreground">
            These terminologies are automatically available in diagnosis, prescription, and lab order forms.
          </p>
        </CardFooter>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>SHA Resources</CardTitle>
          <CardDescription>
            Helpful links and documentation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" className="justify-start" asChild>
              <a href="/billing/sha-claims" className="gap-2">
                <Shield className="h-4 w-4" />
                View SHA Claims
              </a>
            </Button>
            <Button variant="outline" className="justify-start gap-2" disabled>
              <ExternalLink className="h-4 w-4" />
              SHA Provider Portal
            </Button>
            <Button variant="outline" className="justify-start gap-2" disabled>
              <ExternalLink className="h-4 w-4" />
              Claims Guidelines
            </Button>
            <Button variant="outline" className="justify-start gap-2" disabled>
              <ExternalLink className="h-4 w-4" />
              Terminology Browser
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
