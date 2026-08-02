'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Clock, AlertTriangle, User, X, BedDouble, Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/lib/hooks/use-toast';
import { useMyStaffProfile } from '@/lib/hooks/use-rbac';
import {
  useAdmissionRecommendations,
  useDeclineAdmissionRecommendation,
  usePendingAdmissions,
} from '@/lib/hooks/use-inpatient';

const URGENCY_COLORS: Record<string, string> = {
  ROUTINE: 'bg-blue-100 text-blue-800',
  URGENT: 'bg-orange-100 text-orange-800',
  EMERGENCY: 'bg-red-100 text-red-800',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-gray-100 text-gray-800',
};

export default function AdmissionRecommendationsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: staffProfile } = useMyStaffProfile();
  const [selectedRecommendation, setSelectedRecommendation] = useState<any>(null);
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  const { data: recommendations, isLoading, refetch } = useAdmissionRecommendations({
    status: 'PENDING',
    ordering: '-created_at',
  });

  const { data: pendingAdmissionsData, isLoading: isPendingLoading } = usePendingAdmissions();

  const declineRecommendation = useDeclineAdmissionRecommendation();

  const handleApproveClick = (rec: any) => {
    // Navigate to detail page for full compatibility check + ward/bed selection
    router.push(`/admissions/recommendations/${rec.id}`);
  };

  const handleDeclineClick = (rec: any) => {
    setSelectedRecommendation(rec);
    setDeclineReason('');
    setDeclineDialogOpen(true);
  };

  const handleDeclineConfirm = async () => {
    if (!selectedRecommendation || !declineReason.trim()) return;

    try {
      await declineRecommendation.mutateAsync({
        id: selectedRecommendation.id,
        userId: staffProfile?.user ?? 0,
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

  const recommendationsList = recommendations?.results ?? [];
  const pendingAdmissionsList = pendingAdmissionsData?.results ?? [];

  if (isLoading && isPendingLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Admission Recommendations"
        helpContent="Review and approve pending admission recommendations from OPD encounters, and process IPD encounters awaiting admission."
        actions={(
          <Button asChild>
            <Link href="/admissions/recommendations/new">
              <Plus className="h-4 w-4 mr-2" />
              New Recommendation
            </Link>
          </Button>
        )}
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-100">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Recommendations</p>
                <p className="text-2xl font-bold">{recommendationsList.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <BedDouble className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending IPD</p>
                <p className="text-2xl font-bold">{pendingAdmissionsList.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending IPD Encounters */}
      {pendingAdmissionsList.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Pending IPD Encounters</h2>
          <p className="text-sm text-muted-foreground">
            IPD encounters awaiting admission processing (no admission record yet).
          </p>
          {pendingAdmissionsList.map((enc: any) => (
            <Card key={enc.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-blue-50">
                      <BedDouble className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{enc.patient_name || 'Unknown Patient'}</CardTitle>
                      <CardDescription>
                        {enc.patient_mrn} • {new Date(enc.encounter_date).toLocaleDateString()}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge className="bg-blue-100 text-blue-800">IPD</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Chief Complaint</p>
                  <p className="text-sm">{enc.chief_complaint || '—'}</p>
                </div>
                <div className="flex justify-end pt-2 border-t">
                  <Button size="sm" asChild>
                    <Link href={`/admissions/new?encounter=${enc.id}&patient=${enc.patient}`}>
                      Admit Patient
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Clinician Recommendations List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Clinician Recommendations</h2>
        {recommendationsList.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Check className="h-12 w-12 mx-auto text-green-500 mb-4" />
              <p className="text-lg font-medium">All caught up!</p>
              <p className="text-muted-foreground">No pending admission recommendations.</p>
            </CardContent>
          </Card>
        ) : (
          recommendationsList.map((rec: any) => (
            <Card key={rec.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-muted">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{rec.patient_name || 'Unknown Patient'}</CardTitle>
                      <CardDescription>
                        Encounter #{rec.encounter} • Recommended by {rec.recommended_by_username}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge className={URGENCY_COLORS[rec.urgency] || URGENCY_COLORS.ROUTINE}>
                      {rec.urgency}
                    </Badge>
                    <Badge className={STATUS_COLORS[rec.status] || STATUS_COLORS.PENDING}>
                      {rec.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Reason</p>
                    <p>{rec.reason || 'Severe pneumonia requiring IV antibiotics'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Provisional Diagnosis</p>
                    <p>{rec.provisional_diagnosis_text || rec.provisional_diagnosis || 'J18.9 - Pneumonia'}</p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Preferred Ward Type</p>
                    <p>{rec.preferred_ward_type || 'Medical'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Created</p>
                    <p>{new Date(rec.created_at).toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admissions/recommendations/${rec.id}`}>
                      View Details
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeclineClick(rec)}
                    data-testid="decline-button"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleApproveClick(rec)}
                    data-testid="approve-button"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Approve & Admit
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Decline Dialog */}
      <Dialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Admission Recommendation</DialogTitle>
            <DialogDescription>
              Please provide a reason for declining the admission recommendation for {selectedRecommendation?.patient_name || 'this patient'}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="decline-reason">Reason for Declining</Label>
              <Textarea
                id="decline-reason"
                placeholder="Enter the reason for declining this admission recommendation..."
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={4}
              />
            </div>
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
              {declineRecommendation.isPending ? 'Declining...' : 'Confirm Decline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
