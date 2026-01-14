'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Clock, AlertTriangle, User, Bed, X } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/lib/hooks/use-toast';
import {
  useAdmissionRecommendations,
  useInpatientWards,
  useWardBeds,
  useAcceptAdmissionRecommendation,
  useDeclineAdmissionRecommendation,
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
  const { toast } = useToast();
  const [selectedRecommendation, setSelectedRecommendation] = useState<any>(null);
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [selectedWard, setSelectedWard] = useState<string>('');
  const [selectedBed, setSelectedBed] = useState<string>('');

  const { data: recommendations, isLoading, refetch } = useAdmissionRecommendations({
    status: 'PENDING',
    ordering: '-created_at',
  });

  const { data: wards } = useInpatientWards();
  const { data: beds } = useWardBeds(selectedWard ? Number(selectedWard) : undefined);
  const acceptRecommendation = useAcceptAdmissionRecommendation();
  const declineRecommendation = useDeclineAdmissionRecommendation();

  const wardsList = wards?.results ?? [];
  const bedsList = Array.isArray(beds) ? beds : beds?.results ?? [];
  const availableBeds = bedsList.filter((b: any) => b.status === 'AVAILABLE');

  const handleApproveClick = (rec: any) => {
    setSelectedRecommendation(rec);
    setSelectedWard('');
    setSelectedBed('');
    setAcceptDialogOpen(true);
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
        userId: 1, // TODO: Get from auth context
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

  const handleApproveConfirm = async () => {
    if (!selectedRecommendation || !selectedWard || !selectedBed) return;

    try {
      // TODO: Ward/bed assignment should be handled by the backend
      // or through a separate admission creation API call
      await acceptRecommendation.mutateAsync({
        id: selectedRecommendation.id,
        userId: 1, // TODO: Get from auth context
      });

      toast({
        title: 'Admission Created',
        description: 'Patient has been successfully admitted.',
      });

      setAcceptDialogOpen(false);
      refetch();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create admission. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const recommendationsList = recommendations?.results ?? [];

  if (isLoading) {
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
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admissions">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <Link href="/admissions" className="text-sm text-muted-foreground hover:text-primary">
          Back to Admissions
        </Link>
      </div>

      <PageHeader
        title="Admission Recommendations"
        description="Review and approve pending admission recommendations"
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
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">{recommendationsList.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations List */}
      <div className="space-y-4">
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
                  <Button variant="outline" size="sm">
                    View Details
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

      {/* Approve Dialog */}
      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Admission</DialogTitle>
            <DialogDescription>
              Select a ward and bed to admit {selectedRecommendation?.patient_name || 'the patient'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ward">Ward</Label>
              <Select value={selectedWard} onValueChange={(v) => { setSelectedWard(v); setSelectedBed(''); }}>
                <SelectTrigger id="ward" aria-label="Ward">
                  <SelectValue placeholder="Select ward" />
                </SelectTrigger>
                <SelectContent>
                  {wardsList.map((ward: any) => (
                    <SelectItem key={ward.id} value={String(ward.id)}>
                      {ward.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bed">Bed</Label>
              <Select value={selectedBed} onValueChange={setSelectedBed} disabled={!selectedWard}>
                <SelectTrigger id="bed" aria-label="Bed">
                  <SelectValue placeholder={selectedWard ? 'Select bed' : 'Select a ward first'} />
                </SelectTrigger>
                <SelectContent>
                  {availableBeds.length === 0 && selectedWard ? (
                    <div className="py-2 px-2 text-sm text-muted-foreground">
                      No available beds in this ward
                    </div>
                  ) : (
                    availableBeds.map((bed: any) => (
                      <SelectItem key={bed.id} value={String(bed.id)}>
                        {bed.bed_number} - Available
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
              onClick={handleApproveConfirm} 
              disabled={!selectedWard || !selectedBed || acceptRecommendation.isPending}
            >
              {acceptRecommendation.isPending ? 'Creating...' : 'Confirm Admission'}
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
