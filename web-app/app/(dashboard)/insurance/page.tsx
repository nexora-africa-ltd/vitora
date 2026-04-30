'use client';

import { Building2, Construction, CreditCard } from 'lucide-react';
import { SHALogo } from '@/components/ui/sha-logo';
import { PageHeader } from '@/components/shared/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SHAVerificationModal } from '@/components/billing/sha';
import { SHAClaimsPanel } from '@/components/insurance/SHAClaimsPanel';

export default function InsurancePage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Insurance"
        description="Manage insurance verification and coverage workflows"
      />

      <Tabs defaultValue="sha" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="sha">SHA</TabsTrigger>
          <TabsTrigger value="other">Other Insurances</TabsTrigger>
        </TabsList>

        <TabsContent value="sha" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>SHA Verification</CardTitle>
              <CardDescription>
                Lookup Client Registry demographics and verify SHA eligibility using a National ID.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                Use this before billing to confirm coverage and copay.
              </div>
              <SHAVerificationModal
                trigger={
                  <Button>
                    <SHALogo size="sm" className="mr-2" />
                    Verify Member
                  </Button>
                }
              />
            </CardContent>
          </Card>

          <SHAClaimsPanel basePath="/transactions/sha-claims" showHeader={false} />
        </TabsContent>

        <TabsContent value="other" className="space-y-4">
          <Card className="border-dashed border-2 border-muted-foreground/25">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Construction className="h-10 w-10 text-muted-foreground" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">Coming Soon</h2>
              <p className="text-muted-foreground max-w-md">
                Private insurance support (providers, policies, pre-auth, claims, and reconciliation)
                will be implemented in a future phase.
              </p>
              <Badge variant="secondary" className="mt-4">
                <Building2 className="h-3 w-3 mr-1" />
                Placeholder (Other Insurances)
              </Badge>
            </CardContent>
          </Card>

          <Card className="bg-muted/50">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Planned Scope</p>
                  <p className="text-sm text-muted-foreground">
                    Provider registry, member/policy details, coverage rules, pre-authorization, and claims tracking.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
