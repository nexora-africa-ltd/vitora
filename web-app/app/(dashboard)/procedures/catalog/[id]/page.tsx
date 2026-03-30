'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Clock,
  Edit,
  FileText,
  Heart,
  Shield,
  Syringe,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { proceduresApi } from '@/lib/api/procedures';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { ProcedureCatalogDetail } from '@/lib/types/procedure';
import { RISK_LEVEL_COLORS } from '@/lib/types/procedure';

const CATEGORY_LABELS: Record<string, string> = {
  MINOR: 'Minor Procedure', DIAGNOSTIC: 'Diagnostic', THERAPEUTIC: 'Therapeutic',
  PREVENTIVE: 'Preventive', EMERGENCY: 'Emergency', DENTAL: 'Dental',
  OPHTHALMIC: 'Ophthalmic', ENT: 'ENT', OBSTETRIC: 'Obstetric',
  WOUND_CARE: 'Wound Care', INJECTION: 'Injection/Infusion', OTHER: 'Other',
};

const BODY_SYSTEM_LABELS: Record<string, string> = {
  INTEGUMENTARY: 'Integumentary (Skin)', MUSCULOSKELETAL: 'Musculoskeletal',
  RESPIRATORY: 'Respiratory', CARDIOVASCULAR: 'Cardiovascular', DIGESTIVE: 'Digestive',
  URINARY: 'Urinary', REPRODUCTIVE: 'Reproductive', NERVOUS: 'Nervous',
  ENDOCRINE: 'Endocrine', LYMPHATIC: 'Lymphatic', SENSORY: 'Sensory (Eye/Ear)',
  DENTAL: 'Dental', GENERAL: 'General/Multiple',
};

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function BoolRow({ label, value }: { label: string; value: boolean }) {
  return (
    <InfoRow label={label}>
      <span className={value ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
        {value ? 'Yes' : 'No'}
      </span>
    </InfoRow>
  );
}

export default function ProcedureCatalogDetailPage() {
  const params = useParams();
  const router = useRouter();
  const procedureId = Number(params.id);

  const { data: procedure, isLoading, error } = useQuery<ProcedureCatalogDetail>({
    queryKey: ['procedure-catalog-entry', procedureId],
    queryFn: () => proceduresApi.getCatalogEntry(procedureId),
    enabled: Number.isFinite(procedureId),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !procedure) {
    return (
      <div className="space-y-4">
        <PageHeader title="Procedure Details" />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Procedure not found or failed to load.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={procedure.name}
        helpContent="View procedure details including coding, consent requirements, clinical protocols, and billing information."
        actions={
          <Button onClick={() => router.push(`/procedures/catalog/${procedureId}/edit`)}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="font-mono text-sm text-muted-foreground">{procedure.code}</p>
          <p className="text-sm text-muted-foreground">
            {CATEGORY_LABELS[procedure.category] || procedure.category}
            {' · '}
            {BODY_SYSTEM_LABELS[procedure.body_system] || procedure.body_system}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <Badge className={`${RISK_LEVEL_COLORS[procedure.risk_level] || ''} w-fit`}>
            {procedure.risk_level} Risk
          </Badge>
          <Badge variant={procedure.is_active ? 'default' : 'secondary'} className="w-fit">
            {procedure.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </div>

      {procedure.description && (
        <p className="text-sm text-muted-foreground">{procedure.description}</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Coding & Classification */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Coding & Classification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow label="Code">{procedure.code}</InfoRow>
            {procedure.ichi_code && <InfoRow label="ICHI">{procedure.ichi_code}</InfoRow>}
            {procedure.cpt_code && <InfoRow label="CPT">{procedure.cpt_code}</InfoRow>}
            {procedure.icd10_pcs_code && <InfoRow label="ICD-10-PCS">{procedure.icd10_pcs_code}</InfoRow>}
            <InfoRow label="Category">{CATEGORY_LABELS[procedure.category] || procedure.category}</InfoRow>
            <InfoRow label="Body System">{BODY_SYSTEM_LABELS[procedure.body_system] || procedure.body_system}</InfoRow>
            <InfoRow label="Risk Level">
              <Badge className={`${RISK_LEVEL_COLORS[procedure.risk_level] || ''} w-fit`}>
                {procedure.risk_level}
              </Badge>
            </InfoRow>
          </CardContent>
        </Card>

        {/* Clinical Requirements */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Syringe className="h-4 w-4" />
              Clinical Requirements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow label="Duration">{procedure.typical_duration_minutes} min</InfoRow>
            <BoolRow label="Anesthesia Required" value={procedure.requires_anesthesia} />
            {procedure.anesthesia_type && (
              <InfoRow label="Anesthesia Type">{procedure.anesthesia_type}</InfoRow>
            )}
            <BoolRow label="Fasting Required" value={procedure.requires_fasting} />
            <InfoRow label="Min. Staff">{procedure.minimum_staff_count}</InfoRow>
            {procedure.required_qualifications && (
              <InfoRow label="Qualifications">{procedure.required_qualifications}</InfoRow>
            )}
          </CardContent>
        </Card>

        {/* Consent Requirements */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Consent Requirements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <BoolRow label="Consent Required" value={procedure.consent_required} />
            <BoolRow label="Guardian Consent" value={procedure.guardian_consent_required} />
            <BoolRow label="Witness Required" value={procedure.witness_required} />
            {procedure.consent_template && (
              <div className="pt-2 border-t">
                <p className="text-muted-foreground text-xs mb-1">Consent Template</p>
                <p className="whitespace-pre-wrap">{procedure.consent_template}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Billing & SHA */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Billing & SHA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {procedure.base_fee != null && (
              <InfoRow label="Base Fee">{formatCurrency(procedure.base_fee)}</InfoRow>
            )}
            {procedure.billing_service_name && (
              <InfoRow label="Billing Service">{procedure.billing_service_name}</InfoRow>
            )}
            {procedure.billing_price != null && (
              <InfoRow label="Billing Price">{formatCurrency(procedure.billing_price)}</InfoRow>
            )}
            {procedure.sha_tariff_code && (
              <InfoRow label="SHA Tariff">{procedure.sha_tariff_code}</InfoRow>
            )}
            {procedure.sha_package_code && (
              <InfoRow label="SHA Package">{procedure.sha_package_code}</InfoRow>
            )}
          </CardContent>
        </Card>

        {/* Follow-up */}
        {procedure.requires_follow_up && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Follow-up
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow label="Follow-up Days">{procedure.default_follow_up_days}</InfoRow>
            </CardContent>
          </Card>
        )}

        {/* Pre/Post Instructions */}
        {(procedure.pre_procedure_instructions || procedure.post_procedure_instructions) && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Patient Instructions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {procedure.pre_procedure_instructions && (
                <div>
                  <p className="font-medium mb-1">Pre-Procedure</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {procedure.pre_procedure_instructions}
                  </p>
                </div>
              )}
              {procedure.post_procedure_instructions && (
                <div>
                  <p className="font-medium mb-1">Post-Procedure</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {procedure.post_procedure_instructions}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
