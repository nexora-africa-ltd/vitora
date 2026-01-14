'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Search, X, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUser } from '@/lib/auth';
import {
  useBeds,
  useCreateAdmission,
  useInpatientWards,
} from '@/lib/hooks/use-inpatient';
import { useEncounter, useEncounterDiagnoses } from '@/lib/hooks/use-encounters';
import { useICD10Search } from '@/lib/hooks/use-encounter-form';
import { ICD11Select } from '@/components/billing/sha';
import { cn } from '@/lib/utils/cn';

export default function NewAdmissionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useUser();

  // URL params
  const patientIdParam = searchParams.get('patient');
  const encounterIdParam = searchParams.get('encounter');
  const patientId = patientIdParam ? Number(patientIdParam) : null;
  const encounterId = encounterIdParam ? Number(encounterIdParam) : null;

  // Form state
  const [wardId, setWardId] = useState<string>('');
  const [bedId, setBedId] = useState<string>('');
  const [payerType, setPayerType] = useState<'CASH' | 'SHA' | 'CORPORATE'>('CASH');
  
  // Diagnosis state
  const [useICD11, setUseICD11] = useState(true); // Default to ICD-11 (SHA standard)
  const [icd10Code, setIcd10Code] = useState('');
  const [icd10Text, setIcd10Text] = useState('');
  const [icd11Value, setIcd11Value] = useState<{ code: string; title: string } | null>(null);
  const [icd10SearchQuery, setIcd10SearchQuery] = useState('');
  const [isIcd10SearchOpen, setIsIcd10SearchOpen] = useState(false);
  const [diagnosisPrefilled, setDiagnosisPrefilled] = useState(false);

  // Fetch encounter data if encounterId provided (for prefilling diagnosis)
  const { data: encounter } = useEncounter(encounterId || 0);
  const { data: encounterDiagnoses } = useEncounterDiagnoses(encounterId || 0);

  // Fetch wards and beds
  const { data: wards } = useInpatientWards();
  const selectedWardId = useMemo(() => (wardId ? Number(wardId) : undefined), [wardId]);
  const { data: beds } = useBeds({ ward: selectedWardId, status: 'AVAILABLE' });
  const createAdmission = useCreateAdmission();

  // ICD-10 search
  const { data: icd10SearchResults, isLoading: isSearching } = useICD10Search(icd10SearchQuery);

  // Prefill diagnosis from encounter's primary diagnosis
  useEffect(() => {
    if (encounterDiagnoses && !diagnosisPrefilled) {
      // Find primary diagnosis or use first one
      const primaryDiagnosis = encounterDiagnoses.find((d: any) => d.diagnosis_type === 'PRIMARY') 
        || encounterDiagnoses[0];
      
      if (primaryDiagnosis) {
        // Check if it has ICD-11 code
        if (primaryDiagnosis.icd11_code) {
          setUseICD11(true);
          setIcd11Value({
            code: primaryDiagnosis.icd11_code,
            title: primaryDiagnosis.icd11_display || primaryDiagnosis.free_text_diagnosis || '',
          });
        } 
        // Check if it has ICD-10 code
        else if (primaryDiagnosis.icd10_code || primaryDiagnosis.icd10_display) {
          setUseICD11(false);
          const displayParts = (primaryDiagnosis.icd10_display || '').split(' - ');
          setIcd10Code(displayParts[0] || primaryDiagnosis.icd10_code || '');
          setIcd10Text(displayParts.slice(1).join(' - ') || primaryDiagnosis.free_text_diagnosis || '');
        }
        // Fallback to free text
        else if (primaryDiagnosis.free_text_diagnosis) {
          setIcd10Text(primaryDiagnosis.free_text_diagnosis);
        }
        setDiagnosisPrefilled(true);
      }
    }
  }, [encounterDiagnoses, diagnosisPrefilled]);

  // Handle ICD-10 code selection
  const handleSelectICD10 = (code: any) => {
    setIcd10Code(code.code);
    setIcd10Text(code.short_description || code.description);
    setIcd10SearchQuery('');
    setIsIcd10SearchOpen(false);
  };

  // Clear diagnosis
  const handleClearDiagnosis = () => {
    setIcd10Code('');
    setIcd10Text('');
    setIcd11Value(null);
  };

  // Computed values
  const hasDiagnosis = useICD11 
    ? !!icd11Value 
    : (!!icd10Code || !!icd10Text);
  
  const canSubmit = !!patientId && !!wardId && !!bedId && hasDiagnosis;

  const admittingDiagnosis = useICD11 
    ? icd11Value?.code || ''
    : icd10Code;
  
  const admittingDiagnosisText = useICD11
    ? icd11Value?.title || ''
    : icd10Text;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Link href="/admissions" className="text-sm text-muted-foreground hover:text-primary">
          Back to Admissions
        </Link>
      </div>

      <PageHeader title="New Admission" description="Create an inpatient admission record" />

      {/* Encounter context banner */}
      {encounterId && encounter && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Creating admission from OPD Encounter #{encounterId}. 
            {encounter.chief_complaint && ` Chief complaint: ${encounter.chief_complaint}`}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Admission Details</CardTitle>
          <CardDescription>Enter the patient and ward information for this admission</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Patient ID */}
          <div className="space-y-2">
            <Label>Patient ID</Label>
            <Input value={patientId ?? ''} readOnly placeholder="Select a patient first" />
          </div>

          {/* Ward and Bed Selection */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Ward</Label>
              <Select value={wardId} onValueChange={(v) => {
                setWardId(v);
                setBedId('');
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ward" />
                </SelectTrigger>
                <SelectContent>
                  {((wards as any)?.results ?? wards ?? []).map((w: any) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Bed</Label>
              <Select value={bedId} onValueChange={setBedId} disabled={!wardId}>
                <SelectTrigger>
                  <SelectValue placeholder={wardId ? 'Select bed' : 'Select a ward first'} />
                </SelectTrigger>
                <SelectContent>
                  {(Array.isArray(beds) ? beds : beds?.results ?? []).map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.bed_number} ({b.status_display ?? b.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Diagnosis Section with ICD-10/ICD-11 Toggle */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Admitting Diagnosis</Label>
              <div className="flex items-center gap-2">
                <span className={cn("text-sm", !useICD11 && "font-medium")}>ICD-10</span>
                <Switch
                  checked={useICD11}
                  onCheckedChange={(checked) => {
                    setUseICD11(checked);
                    handleClearDiagnosis();
                  }}
                />
                <span className={cn("text-sm", useICD11 && "font-medium")}>ICD-11</span>
              </div>
            </div>

            {/* Show selected diagnosis */}
            {hasDiagnosis ? (
              <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/50">
                <Badge variant="outline" className="font-mono">
                  {admittingDiagnosis}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {useICD11 ? 'ICD-11' : 'ICD-10'}
                </Badge>
                <span className="flex-1 text-sm truncate">
                  {admittingDiagnosisText}
                </span>
                {diagnosisPrefilled && (
                  <Badge variant="outline" className="text-xs bg-blue-50">
                    From Encounter
                  </Badge>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleClearDiagnosis}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                {/* ICD-11 Search */}
                {useICD11 && (
                  <ICD11Select
                    value={icd11Value}
                    onSelect={setIcd11Value}
                    placeholder="Search ICD-11 codes (e.g., malaria, pneumonia, diabetes)..."
                  />
                )}

                {/* ICD-10 Search */}
                {!useICD11 && (
                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Search ICD-10 codes (e.g., malaria, J18, B50)..."
                        value={icd10SearchQuery}
                        onChange={(e) => {
                          setIcd10SearchQuery(e.target.value);
                          setIsIcd10SearchOpen(true);
                        }}
                        onFocus={() => setIsIcd10SearchOpen(true)}
                        className="pl-9"
                      />
                      
                      {/* Search Results Dropdown */}
                      {isIcd10SearchOpen && icd10SearchQuery.length >= 2 && (
                        <Card className="absolute z-50 mt-1 w-full shadow-lg max-h-64 overflow-y-auto">
                          <CardContent className="p-2">
                            {isSearching ? (
                              <div className="space-y-2">
                                {[1, 2, 3].map((i) => (
                                  <div key={i} className="flex items-center gap-2 p-2">
                                    <Skeleton className="h-5 w-16" />
                                    <Skeleton className="h-4 flex-1" />
                                  </div>
                                ))}
                              </div>
                            ) : icd10SearchResults && icd10SearchResults.length > 0 ? (
                              <ul className="space-y-1">
                                {icd10SearchResults.map((code: any) => (
                                  <li key={code.id}>
                                    <button
                                      type="button"
                                      onClick={() => handleSelectICD10(code)}
                                      className="w-full flex items-start gap-2 p-2 rounded-md hover:bg-accent transition-colors text-left"
                                    >
                                      <Badge variant="outline" className="font-mono shrink-0">
                                        {code.code}
                                      </Badge>
                                      <span className="text-sm">
                                        {code.short_description || code.description}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-center text-muted-foreground py-4 text-sm">
                                No ICD-10 codes found for &quot;{icd10SearchQuery}&quot;
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      )}
                    </div>

                    {/* Manual entry fallback */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="manual-icd10-code">ICD-10 Code (manual)</Label>
                        <Input
                          id="manual-icd10-code"
                          value={icd10Code}
                          onChange={(e) => setIcd10Code(e.target.value.toUpperCase())}
                          placeholder="e.g., B50.0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="manual-diagnosis-text">Diagnosis Description</Label>
                        <Input
                          id="manual-diagnosis-text"
                          value={icd10Text}
                          onChange={(e) => setIcd10Text(e.target.value)}
                          placeholder="e.g., Plasmodium falciparum malaria with cerebral complications"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Payer Type */}
          <div className="space-y-2">
            <Label>Payer Type</Label>
            <Select value={payerType} onValueChange={(v) => setPayerType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="SHA">SHA Insurance</SelectItem>
                <SelectItem value="CORPORATE">Corporate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Submit Button */}
          <div className="flex items-center gap-2 pt-4 border-t">
            <Button
              disabled={!canSubmit || createAdmission.isPending}
              onClick={async () => {
                if (!patientId) return;
                const admissionDate = new Date().toISOString();

                await createAdmission.mutateAsync({
                  patient: patientId,
                  ward: Number(wardId),
                  bed: Number(bedId),
                  payer_type: payerType,
                  admission_date: admissionDate,
                  admitting_diagnosis: admittingDiagnosis,
                  admitting_diagnosis_text: admittingDiagnosisText,
                  admitting_officer: user.id,
                  source_encounter: encounterId || undefined,
                });

                router.push('/admissions');
              }}
            >
              <Save className="h-4 w-4 mr-2" />
              {createAdmission.isPending ? 'Creating...' : 'Create Admission'}
            </Button>
            {createAdmission.error && (
              <p className="text-sm text-destructive">Failed to create admission. Please try again.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
