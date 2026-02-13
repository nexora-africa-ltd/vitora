'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Bed,
  Building2,
  Calendar,
  ClipboardList,
  Clock,
  FileText,
  LogOut,
  MoveRight,
  Stethoscope,
  User,
  Activity,
  Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  useAdmission,
  useAdmissionWardRounds,
  useKardexByAdmission
} from '@/lib/hooks/use-inpatient';
import { AdmissionOrdersTab } from '@/components/inpatient';
import { formatDate, formatDateTime } from '@/lib/utils/format';

export default function AdmissionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const admissionId = Number(params.id);

  const { data: admission, isLoading, error } = useAdmission(admissionId);
  const { data: wardRounds, isLoading: wardRoundsLoading } = useAdmissionWardRounds(admissionId);
  const { data: kardex, isLoading: kardexLoading } = useKardexByAdmission(admissionId);

  if (isLoading) {
    return <AdmissionDetailSkeleton />;
  }

  if (error || !admission) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-xl font-semibold">Admission not found</p>
        <p className="text-muted-foreground mt-2">
          The admission record you&apos;re looking for doesn&apos;t exist or has been removed.
        </p>
        <Button onClick={() => router.push('/admissions')} className="mt-4">
          View Admissions
        </Button>
      </div>
    );
  }

  const daysAdmitted = Math.ceil(
    (new Date().getTime() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-lg sm:text-xl font-bold truncate">
            {admission.admission_number}
          </p>
          <p className="text-sm text-muted-foreground truncate">
            Patient: <span className="font-medium">{admission.patient_name}</span>
          </p>
        </div>
        <Badge
          variant={getStatusVariant(admission.admission_status)}
          className="shrink-0 w-fit self-start sm:self-auto"
        >
          {admission.admission_status_display || admission.admission_status}
        </Badge>
      </div>

      {/* Actions */}
      {admission.admission_status === 'ACTIVE' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="outline" asChild>
            <Link href={`/admissions/${admission.id}/ward-round`}>
              <Stethoscope className="h-4 w-4 mr-2" />
              Ward Round
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/admissions/${admission.id}/transfer`}>
              <MoveRight className="h-4 w-4 mr-2" />
              Transfer
            </Link>
          </Button>
          <Button variant="default" asChild>
            <Link href={`/admissions/${admission.id}/discharge`}>
              <LogOut className="h-4 w-4 mr-2" />
              Discharge
            </Link>
          </Button>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-3 sm:pt-6 sm:p-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-blue-100 dark:bg-blue-900 shrink-0">
                <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-accent-foreground">Ward</p>
                <p className="font-semibold text-sm sm:text-base truncate">{admission.ward_name}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:pt-6 sm:p-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-green-100 dark:bg-green-900 shrink-0">
                <Bed className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-accent-foreground">Bed</p>
                <p className="font-semibold text-sm sm:text-base truncate">{admission.bed_number}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:pt-6 sm:p-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-purple-100 dark:bg-purple-900 shrink-0">
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-accent-foreground">Admitted</p>
                <p className="font-semibold text-sm sm:text-base truncate">{formatDate(admission.admission_date)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:pt-6 sm:p-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-orange-100 dark:bg-orange-900 shrink-0">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-accent-foreground">Days</p>
                <p className="font-semibold text-sm sm:text-base">{daysAdmitted} day{daysAdmitted !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="w-full grid grid-cols-4 h-auto">
          <TabsTrigger value="overview" className="text-xs sm:text-sm md:text-base md:data-[state=active]:text-lg md:data-[state=active]:font-semibold transition-all">
            <span className="sm:hidden">Info</span>
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="ward-rounds" className="text-xs sm:text-sm md:text-base md:data-[state=active]:text-lg md:data-[state=active]:font-semibold transition-all">
            <span className="sm:hidden">Rounds</span>
            <span className="hidden sm:inline">Ward Rounds</span>
          </TabsTrigger>
          <TabsTrigger value="kardex" className="text-xs sm:text-sm md:text-base md:data-[state=active]:text-lg md:data-[state=active]:font-semibold transition-all">
            <span className="sm:hidden">Kardex</span>
            <span className="hidden sm:inline">Nursing Kardex</span>
          </TabsTrigger>
          <TabsTrigger value="orders" className="text-xs sm:text-sm md:text-base md:data-[state=active]:text-lg md:data-[state=active]:font-semibold transition-all">Orders</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Admission Details */}
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg">Admission Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow
                  icon={User}
                  label="Patient"
                  value={admission.patient_name}
                  link={`/patients/${admission.patient}`}
                />
                <InfoRow
                  icon={FileText}
                  label="Admitting Diagnosis"
                  value={admission.admitting_diagnosis_text || admission.admitting_diagnosis}
                />
                <InfoRow
                  icon={User}
                  label="Admitted By"
                  value={admission.admitting_officer_username || '—'}
                />
                <InfoRow
                  icon={Calendar}
                  label="Admission Date"
                  value={formatDateTime(admission.admission_date)}
                />
                <InfoRow
                  icon={Activity}
                  label="Payer Type"
                  value={admission.payer_type_display || admission.payer_type}
                />
              </CardContent>
            </Card>

            {/* Clinical Notes */}
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg">Clinical Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-accent-foreground whitespace-pre-wrap break-words">
                  {admission.clinical_notes || 'No clinical notes recorded.'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Diet & Special Instructions */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg">Diet</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm break-words">
                  {admission.diet || 'Regular diet (no restrictions specified)'}
                </p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg">Special Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-accent-foreground break-words">
                  {admission.special_instructions || 'No special instructions.'}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Ward Rounds Tab */}
        <TabsContent value="ward-rounds" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
            <h3 className="text-lg font-semibold">Ward Round History</h3>
            {admission.admission_status === 'ACTIVE' && (
              <Button asChild className="w-full sm:w-auto">
                <Link href={`/admissions/${admission.id}/ward-round`}>
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="sm:hidden">New Round</span>
                  <span className="hidden sm:inline">New Ward Round</span>
                </Link>
              </Button>
            )}
          </div>

          {wardRoundsLoading ? (
            <WardRoundsSkeleton />
          ) : (wardRounds?.results?.length ?? 0) === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Stethoscope className="h-12 w-12 mx-auto text-accent-foreground mb-4" />
                <p className="text-accent-foreground">No ward rounds recorded yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {wardRounds?.results?.map((round) => (
                <Card key={round.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {formatDateTime(round.round_date)}
                      </CardTitle>
                      <Badge variant="outline">{round.condition_status_display || round.condition_status}</Badge>
                    </div>
                    <CardDescription>
                      Conducted by {round.conducted_by_username}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div>
                      <p className="text-sm font-medium">Clinical Notes</p>
                      <p className="text-sm text-accent-foreground">{round.clinical_notes}</p>
                    </div>
                    {round.plan && (
                      <div>
                        <p className="text-sm font-medium">Plan</p>
                        <p className="text-sm text-accent-foreground">{round.plan}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Nursing Kardex Tab */}
        <TabsContent value="kardex" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
            <h3 className="text-lg font-semibold">Nursing Kardex</h3>
            {kardex && admission.admission_status === 'ACTIVE' && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
                  <Link href={`/admissions/${admission.id}/kardex?action=shift-note`}>
                    <Plus className="h-4 w-4 sm:mr-1.5" />
                    <span className="hidden sm:inline">Add Shift Note</span>
                    <span className="sm:hidden">Shift Note</span>
                  </Link>
                </Button>
                <Button variant="outline" asChild className="w-full sm:w-auto">
                  <Link href={`/admissions/${admission.id}/kardex`}>
                    <ClipboardList className="h-4 w-4 mr-2" />
                    <span className="sm:hidden">View Kardex</span>
                    <span className="hidden sm:inline">View Full Kardex</span>
                  </Link>
                </Button>
              </div>
            )}
          </div>

          {kardexLoading ? (
            <KardexSkeleton />
          ) : !kardex ? (
            <Card>
              <CardContent className="py-8 text-center">
                <ClipboardList className="h-12 w-12 mx-auto text-accent-foreground mb-4" />
                <p className="text-accent-foreground">No nursing kardex found.</p>
                <p className="text-sm text-accent-foreground mt-1">
                  A kardex is automatically created when a patient is admitted.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Care Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">Mobility Status</p>
                    <p className="text-sm text-accent-foreground">{kardex.mobility_status || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Diet</p>
                    <p className="text-sm text-accent-foreground">{kardex.diet || 'Regular'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Allergies</p>
                    <p className="text-sm text-accent-foreground">{kardex.allergies || 'None known'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Fall Risk</p>
                    <Badge variant={kardex.fall_risk ? 'destructive' : 'secondary'}>
                      {kardex.fall_risk ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Nursing Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-accent-foreground whitespace-pre-wrap">
                    {kardex.nursing_notes || 'No nursing notes recorded.'}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Orders Tab */}
        <TabsContent value="orders" className="space-y-4">
          <AdmissionOrdersTab
            admissionId={admission.id}
            patientId={admission.patient}
            isActive={admission.admission_status === 'ACTIVE'}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Helper Components
function InfoRow({
  icon: Icon,
  label,
  value,
  link
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string;
  link?: string;
}) {
  const content = (
    <div className="flex items-start gap-3 min-w-0">
      <Icon className="h-4 w-4 mt-0.5 text-accent-foreground shrink-0" />
      <div className="flex-1 min-w-0 overflow-hidden">
        <p className="text-sm text-accent-foreground">{label}</p>
        <p className={`text-sm font-medium break-words ${link ? 'text-primary hover:underline' : ''}`}>
          {value || '—'}
        </p>
      </div>
    </div>
  );

  if (link) {
    return <Link href={link}>{content}</Link>;
  }
  return content;
}

function AdmissionDetailSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

function WardRoundsSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(2)].map((_, i) => (
        <Skeleton key={i} className="h-32" />
      ))}
    </div>
  );
}

function KardexSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Skeleton className="h-48" />
      <Skeleton className="h-48" />
    </div>
  );
}

/**
 * Get badge variant based on admission status
 */
function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'DISCHARGED':
      return 'secondary';
    case 'TRANSFERRED_OUT':
      return 'warning';
    case 'DECEASED':
    case 'ABSCONDED':
      return 'destructive';
    default:
      return 'secondary';
  }
}
