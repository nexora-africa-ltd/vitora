'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  Building2,
  Calendar,
  Check,
  Clock,
  ClipboardList,
  User,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAdmissionRecommendation,
  useInpatientWards,
  useWardBeds,
  useAcceptAdmissionRecommendation,
  useDeclineAdmissionRecommendation,
} from '@/lib/hooks/use-inpatient';
import { useUser } from '@/lib/auth';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import type { AdmissionRecommendationUrgency } from '@/lib/types/inpatient';

const URGENCY_COLORS: Record<string, string> = {
  ROUTINE: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  URGENT: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  EMERGENCY: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  ACCEPTED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  DECLINED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  EXPIRED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

function getUrgencyVariant(urgency: AdmissionRecommendationUrgency): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (urgency) {
    case 'EMERGENCY':
      return 'destructive';
    case 'URGENT':
      return 'default';
    case 'ROUTINE':
      return 'secondary';
    default:
      return 'secondary';
  }
}

export default function RecommendationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const user = useUser();
  const { toast } = useToast();
  const recommendationId = Number(params.id);

  const { data: recommendation, isLoading, error, refetch } = useAdmissionRecommendation(recommendationId);
  const { data: wards } = useInpatientWards();
  
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [selectedWard, setSelectedWard] = useState<string>('');
  const [selectedBed, setSelectedBed] = useState<string>('');

  const { data: beds } = useWardBeds(selectedWard ? Number(selectedWard) : undefined);
  const acceptRecommendation = useAcceptAdmissionRecommendation();
  const declineRecommendation = useDeclineAdmissionRecommendation();

  const wardsList = wards?.results ?? [];
  const bedsList = Array.isArray(beds) ? beds : beds?.results ?? [];
  const availableBeds = bedsList.filter((b: any) => b.status === 'AVAILABLE');

  const handleAcceptConfirm = async () => {
    if (!recommendation || !selectedWard || !selectedBed) return;

    try {
      await acceptRecommendation.mutateAsync({
        id: recommendation.id,
        userId: user?.id || 1,
      });

      toast({
        title: 'Recommendation Accepted',
        description: 'The patient admission has been approved. Proceed to create the admission.',
      });

      setAcceptDialogOpen(false);
      router.push(`/admissions/new?recommendation=${recommendation.id}&ward=${selectedWard}&bed=${selectedBed}`);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to accept recommendation. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDeclineConfirm = async () => {
    if (!recommendation || !declineReason.trim()) return;

    try {
      await declineRecommendation.mutateAsync({
        id: recommendation.id,
        userId: user?.id || 1,
        reason: declineReason.trim(),
      });

      toast({
        title: 'Recommendation Declined',
        description: 'The admission recommendation has been declined.',
      });

      setDeclineDialogOpen(false);
      refetch();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to decline recommendation. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return <RecommendationDetailSkeleton />;
  }

  if (error || !recommendation) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-xl font-semibold">Recommendation not found</p>
        <p className="text-muted-foreground mt-2">
          The admission recommendation you&apos;re looking for doesn&apos;t exist or has been removed.
        </p>
        <Button onClick={() => router.push('/admissions/recommendations')} className="mt-4">
          View Recommendations
        </Button>
      </div>
    );
  }

  const isPending = recommendation.status === 'PENDING';
  const isExpired = recommendation.is_expired;

  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Admission Recommendation"
        helpContent="Review the admission recommendation details and take action to accept or decline."
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-lg sm:text-xl font-bold truncate">
            {recommendation.patient_name || 'Unknown Patient'}
          </p>
          <p className="text-sm text-muted-foreground truncate">
            {recommendation.patient_mrn && <span>MRN: {recommendation.patient_mrn} • </span>}
            Encounter #{recommendation.encounter}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={getUrgencyVariant(recommendation.urgency)}
            className="shrink-0 w-fit"
          >
            {recommendation.urgency === 'EMERGENCY' && <AlertTriangle className="h-3 w-3 mr-1" />}
            {recommendation.urgency}
          </Badge>
          <Badge className={STATUS_COLORS[recommendation.status]}>
            {recommendation.status}
          </Badge>
        </div>
      </div>

      {/* Expired Warning */}
      {isExpired && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive font-medium">
              This recommendation has expired and can no longer be accepted.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {isPending && !isExpired && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="outline" onClick={() => setDeclineDialogOpen(true)}>
            <X className="h-4 w-4 mr-2" />
            Decline
          </Button>
          <Button onClick={() => setAcceptDialogOpen(true)}>
            <Check className="h-4 w-4 mr-2" />
            Accept & Admit
          </Button>
        </div>
      )}

      {/* Details Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Recommendation Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Recommendation Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Reason for Admission</p>
                <p className="font-medium">{recommendation.reason}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Provisional Diagnosis</p>
                <p className="font-medium">
                  {recommendation.provisional_diagnosis && (
                    <code className="text-xs bg-muted px-1 py-0.5 rounded mr-2">
                      {recommendation.provisional_diagnosis}
                    </code>
                  )}
                  {recommendation.provisional_diagnosis_text}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Preferred Ward Type</p>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{recommendation.preferred_ward_type}</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Urgency</p>
                <Badge variant={getUrgencyVariant(recommendation.urgency)}>
                  {recommendation.urgency === 'EMERGENCY' && <AlertTriangle className="h-3 w-3 mr-1" />}
                  {recommendation.urgency}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Meta Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Recommended By</p>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{recommendation.recommended_by_username || 'Unknown'}</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Expires At</p>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className={`font-medium ${isExpired ? 'text-destructive' : ''}`}>
                    {formatDateTime(recommendation.expires_at)}
                  </span>
                </div>
              </div>
              {recommendation.status !== 'PENDING' && (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge className={STATUS_COLORS[recommendation.status]}>
                      {recommendation.status}
                    </Badge>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Accept Dialog */}
      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept Admission Recommendation</DialogTitle>
            <DialogDescription>
              Select a ward and bed for the patient to proceed with admission.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Ward</Label>
              <Select value={selectedWard} onValueChange={(v) => { setSelectedWard(v); setSelectedBed(''); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ward" />
                </SelectTrigger>
                <SelectContent>
                  {wardsList.map((ward: any) => (
                    <SelectItem key={ward.id} value={String(ward.id)}>
                      {ward.name} ({ward.ward_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Bed</Label>
              <Select value={selectedBed} onValueChange={setSelectedBed} disabled={!selectedWard}>
                <SelectTrigger>
                  <SelectValue placeholder={selectedWard ? 'Select bed' : 'Select ward first'} />
                </SelectTrigger>
                <SelectContent>
                  {availableBeds.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      No available beds in this ward
                    </div>
                  ) : (
                    availableBeds.map((bed: any) => (
                      <SelectItem key={bed.id} value={String(bed.id)}>
                        {bed.bed_number}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAcceptConfirm}
              disabled={!selectedWard || !selectedBed || acceptRecommendation.isPending}
            >
              {acceptRecommendation.isPending ? 'Processing...' : 'Accept & Create Admission'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline Dialog */}
      <Dialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Admission Recommendation</DialogTitle>
            <DialogDescription>
              Please provide a reason for declining this admission recommendation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason for Declining</Label>
            <Textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Enter reason for declining..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeclineConfirm}
              disabled={!declineReason.trim() || declineRecommendation.isPending}
            >
              {declineRecommendation.isPending ? 'Processing...' : 'Decline Recommendation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RecommendationDetailSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
