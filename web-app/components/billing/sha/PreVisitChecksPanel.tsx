/**
 * PreVisitChecksPanel — DHA HIE pre-visit verification widget (Phase 2).
 *
 * Single panel exposing the 8 pre-visit ILM operations plus a local cache
 * of patient contacts:
 *
 * Registries:
 *  - Facility lookup (by MFL/FR/UUID)
 *  - Patient lookup in the Client Registry
 *  - Health Worker lookup
 *
 * Eligibility & benefits:
 *  - SHA eligibility check
 *  - Benefit packages
 *  - Sub-benefits
 *  - Interventions per sub-benefit
 *  - Utilisation per intervention
 *
 * Designed to be embedded on the patient detail page or the SHA claim
 * detail page (alongside ClaimILMPanel) so staff can verify coverage
 * before clinical work begins. All eligibility/benefit calls write a
 * `SHACoverageSnapshot` row when a `patientPk` is supplied.
 */
'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { shaApi } from '@/lib/api/sha';
import type { IlmRegistryResponse } from '@/lib/schemas/sha.schema';

interface PreVisitChecksPanelProps {
  /** Local Patient PK — when supplied, eligibility/benefit calls persist a SHACoverageSnapshot. */
  patientPk?: number;
  /** Local SHAMember PK for cross-linking the snapshot. */
  shaMemberId?: number;
  /** Patient's national/SHA identification number — used to pre-fill the eligibility form. */
  defaultIdentificationNumber?: string;
  defaultIdentificationType?: string;
  /** DHA Client-Registry CR number for benefits/utilisation queries. */
  defaultDhaPatientId?: string;
}

type ActionKey =
  | 'facility'
  | 'patient'
  | 'professional'
  | 'eligibility'
  | 'benefits'
  | 'subBenefits'
  | 'interventions'
  | 'utilization';

export function PreVisitChecksPanel({
  patientPk,
  shaMemberId,
  defaultIdentificationNumber = '',
  defaultIdentificationType = 'National ID',
  defaultDhaPatientId = '',
}: PreVisitChecksPanelProps) {
  const [busy, setBusy] = useState<ActionKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IlmRegistryResponse | null>(null);

  // Registries
  const [facilityIdentifier, setFacilityIdentifier] = useState('');
  const [facilityIdentifierType, setFacilityIdentifierType] = useState('mfl');
  const [facilityName, setFacilityName] = useState('');

  const [patientIdNumber, setPatientIdNumber] = useState(defaultIdentificationNumber);
  const [patientIdType, setPatientIdType] = useState(defaultIdentificationType);

  const [professionalIdNumber, setProfessionalIdNumber] = useState('');
  const [professionalIdType, setProfessionalIdType] = useState('National ID');
  const [professionalRegulator, setProfessionalRegulator] = useState('KMPDC');

  // Eligibility
  const [eligIdNumber, setEligIdNumber] = useState(defaultIdentificationNumber);
  const [eligIdType, setEligIdType] = useState(defaultIdentificationType);

  // Benefits
  const [dhaPatientId, setDhaPatientId] = useState(defaultDhaPatientId);
  const [subBenefitCode, setSubBenefitCode] = useState('');
  const [interventionCode, setInterventionCode] = useState('');

  async function run<T extends ActionKey>(action: T, fn: () => Promise<IlmRegistryResponse>) {
    setBusy(action);
    setError(null);
    try {
      setResult(await fn());
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Request failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pre-visit DHA HIE Checks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {result && (
          <Alert>
            <AlertTitle>
              Last response (HTTP {result.http_status}
              {result.snapshot_id ? `, snapshot #${result.snapshot_id}` : ''})
            </AlertTitle>
            <AlertDescription>
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(result.data ?? {}, null, 2)}
              </pre>
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="eligibility">
          <TabsList>
            <TabsTrigger value="eligibility">Eligibility</TabsTrigger>
            <TabsTrigger value="benefits">Benefits</TabsTrigger>
            <TabsTrigger value="registries">Registries</TabsTrigger>
          </TabsList>

          {/* --- Eligibility ------------------------------------------- */}
          <TabsContent value="eligibility" className="space-y-3 pt-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="elig-id">Identification number</Label>
                <Input
                  id="elig-id"
                  value={eligIdNumber}
                  onChange={(e) => setEligIdNumber(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="elig-type">Identification type</Label>
                <Input
                  id="elig-type"
                  value={eligIdType}
                  onChange={(e) => setEligIdType(e.target.value)}
                />
              </div>
            </div>
            <Button
              size="sm"
              disabled={!eligIdNumber || !eligIdType || busy === 'eligibility'}
              onClick={() =>
                run('eligibility', () =>
                  shaApi.ilmEligibility({
                    identification_number: eligIdNumber,
                    identification_type: eligIdType,
                    patient_pk: patientPk,
                    sha_member_id: shaMemberId,
                  })
                )
              }
            >
              {busy === 'eligibility' && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Check eligibility
            </Button>
          </TabsContent>

          {/* --- Benefits --------------------------------------------- */}
          <TabsContent value="benefits" className="space-y-3 pt-3">
            <div>
              <Label htmlFor="dha-pid">DHA patient_id (CR number)</Label>
              <Input
                id="dha-pid"
                value={dhaPatientId}
                onChange={(e) => setDhaPatientId(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!dhaPatientId || busy === 'benefits'}
                onClick={() =>
                  run('benefits', () =>
                    shaApi.ilmBenefits({
                      patient_id: dhaPatientId,
                      patient_pk: patientPk,
                      sha_member_id: shaMemberId,
                    })
                  )
                }
              >
                {busy === 'benefits' && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Benefits
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!dhaPatientId || busy === 'subBenefits'}
                onClick={() =>
                  run('subBenefits', () =>
                    shaApi.ilmSubBenefits({
                      patient_id: dhaPatientId,
                      patient_pk: patientPk,
                      sha_member_id: shaMemberId,
                    })
                  )
                }
              >
                {busy === 'subBenefits' && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Sub-benefits
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="sub-bcode">Sub-benefit code</Label>
                <Input
                  id="sub-bcode"
                  value={subBenefitCode}
                  onChange={(e) => setSubBenefitCode(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="int-code">Intervention code</Label>
                <Input
                  id="int-code"
                  value={interventionCode}
                  onChange={(e) => setInterventionCode(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!dhaPatientId || !subBenefitCode || busy === 'interventions'}
                onClick={() =>
                  run('interventions', () =>
                    shaApi.ilmBenefitInterventions({
                      patient_id: dhaPatientId,
                      sub_benefit_code: subBenefitCode,
                      patient_pk: patientPk,
                      sha_member_id: shaMemberId,
                    })
                  )
                }
              >
                {busy === 'interventions' && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Interventions
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!dhaPatientId || !interventionCode || busy === 'utilization'}
                onClick={() =>
                  run('utilization', () =>
                    shaApi.ilmUtilization({
                      patient_id: dhaPatientId,
                      intervention_code: interventionCode,
                      patient_pk: patientPk,
                      sha_member_id: shaMemberId,
                    })
                  )
                }
              >
                {busy === 'utilization' && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Utilisation
              </Button>
            </div>
          </TabsContent>

          {/* --- Registries ------------------------------------------ */}
          <TabsContent value="registries" className="space-y-4 pt-3">
            {/* Facility */}
            <section className="space-y-2">
              <h4 className="text-sm font-medium">Facility Registry</h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <Label htmlFor="fac-id">Identifier</Label>
                  <Input
                    id="fac-id"
                    value={facilityIdentifier}
                    onChange={(e) => setFacilityIdentifier(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="fac-type">Identifier type</Label>
                  <Input
                    id="fac-type"
                    value={facilityIdentifierType}
                    onChange={(e) => setFacilityIdentifierType(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="fac-name">Name (optional)</Label>
                  <Input
                    id="fac-name"
                    value={facilityName}
                    onChange={(e) => setFacilityName(e.target.value)}
                  />
                </div>
              </div>
              <Button
                size="sm"
                disabled={!facilityIdentifier || !facilityIdentifierType || busy === 'facility'}
                onClick={() =>
                  run('facility', () =>
                    shaApi.ilmFacilitySearch({
                      identifier: facilityIdentifier,
                      identifier_type: facilityIdentifierType,
                      name: facilityName || undefined,
                    })
                  )
                }
              >
                {busy === 'facility' && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Search facility
              </Button>
            </section>

            {/* Patient */}
            <section className="space-y-2">
              <h4 className="text-sm font-medium">Client Registry</h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor="pat-id">Identification number</Label>
                  <Input
                    id="pat-id"
                    value={patientIdNumber}
                    onChange={(e) => setPatientIdNumber(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="pat-type">Identification type</Label>
                  <Input
                    id="pat-type"
                    value={patientIdType}
                    onChange={(e) => setPatientIdType(e.target.value)}
                  />
                </div>
              </div>
              <Button
                size="sm"
                disabled={!patientIdNumber || !patientIdType || busy === 'patient'}
                onClick={() =>
                  run('patient', () =>
                    shaApi.ilmPatientLookup({
                      identification_number: patientIdNumber,
                      identification_type: patientIdType,
                      patient_pk: patientPk,
                      sha_member_id: shaMemberId,
                    })
                  )
                }
              >
                {busy === 'patient' && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Lookup patient
              </Button>
            </section>

            {/* Professional */}
            <section className="space-y-2">
              <h4 className="text-sm font-medium">Health Worker Registry</h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <Label htmlFor="pro-id">Identification number</Label>
                  <Input
                    id="pro-id"
                    value={professionalIdNumber}
                    onChange={(e) => setProfessionalIdNumber(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="pro-type">Identification type</Label>
                  <Input
                    id="pro-type"
                    value={professionalIdType}
                    onChange={(e) => setProfessionalIdType(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="pro-reg">Regulator</Label>
                  <Input
                    id="pro-reg"
                    value={professionalRegulator}
                    onChange={(e) => setProfessionalRegulator(e.target.value)}
                  />
                </div>
              </div>
              <Button
                size="sm"
                disabled={
                  !professionalIdNumber ||
                  !professionalIdType ||
                  !professionalRegulator ||
                  busy === 'professional'
                }
                onClick={() =>
                  run('professional', () =>
                    shaApi.ilmProfessionalSearch({
                      identification_number: professionalIdNumber,
                      identification_type: professionalIdType,
                      regulator: professionalRegulator,
                    })
                  )
                }
              >
                {busy === 'professional' && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Search practitioner
              </Button>
            </section>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
