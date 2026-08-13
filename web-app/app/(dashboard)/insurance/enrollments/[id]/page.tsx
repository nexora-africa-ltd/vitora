'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';

import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useGetHealthcloudHealthId,
  usePatientInsurance,
  usePostHealthcloudProfile,
  useUpdateEnrollment,
} from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';
import type { PatientInsuranceCreateInput } from '@/lib/types/insurance';

const MAX_CARD_IMAGE_SIZE_MB = 5;
const MAX_CARD_IMAGE_SIZE_BYTES = MAX_CARD_IMAGE_SIZE_MB * 1024 * 1024;
const ALLOWED_CARD_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  pending_verification: 'bg-yellow-100 text-yellow-800',
  expired: 'bg-orange-100 text-orange-800',
  suspended: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

function extractHealthIdentitySnapshot(payload: Record<string, unknown> | null | undefined): {
  profileRequestId: string;
  profileId: string;
  serviceAccountNumber: string;
  healthId: string;
  postedAt: string;
  checkedAt: string;
} {
  const raw = payload?.health_identity;
  const identity = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    profileRequestId: String(identity.profile_request_id || ''),
    profileId: String(identity.profile_id || ''),
    serviceAccountNumber: String(identity.service_account_number || ''),
    healthId: String(identity.health_id || ''),
    postedAt: String(identity.posted_at || ''),
    checkedAt: String(identity.health_id_checked_at || ''),
  };
}

function formatOptionalDate(value: string): string {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default function InsuranceEnrollmentDetailPage() {
  const router = useRouter();
  const { toast } = useToast();
  const params = useParams<{ id: string }>();
  const enrollmentId = Number(params?.id);

  const { data: enrollment, isLoading, isError, refetch } = usePatientInsurance(Number.isFinite(enrollmentId) ? enrollmentId : undefined);
  const updateEnrollment = useUpdateEnrollment();
  const postHealthcloudProfile = usePostHealthcloudProfile();
  const getHealthcloudHealthId = useGetHealthcloudHealthId();

  const [isEditing, setIsEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [removeFront, setRemoveFront] = useState(false);
  const [removeBack, setRemoveBack] = useState(false);
  const [serviceName, setServiceName] = useState('SLADE_ADVANTAGE');
  const [profileIdInput, setProfileIdInput] = useState('');

  useEffect(() => {
    if (!enrollment || isEditing) return;
    setNotesDraft(enrollment.notes || '');
    setFrontFile(null);
    setBackFile(null);
    setRemoveFront(false);
    setRemoveBack(false);
    const identity = extractHealthIdentitySnapshot(enrollment.last_eligibility_payload);
    setProfileIdInput(identity.profileRequestId || identity.profileId);
  }, [enrollment, isEditing]);

  useEffect(() => {
    if (!frontFile) {
      setFrontPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(frontFile);
    setFrontPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [frontFile]);

  useEffect(() => {
    if (!backFile) {
      setBackPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(backFile);
    setBackPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [backFile]);

  const validateCardFile = (file: File): boolean => {
    if (!ALLOWED_CARD_IMAGE_TYPES.has(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Use JPG, PNG, or WEBP card images only.',
        variant: 'destructive',
      });
      return false;
    }
    if (file.size > MAX_CARD_IMAGE_SIZE_BYTES) {
      toast({
        title: 'File too large',
        description: `Card image must be ${MAX_CARD_IMAGE_SIZE_MB} MB or smaller.`,
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!enrollment) return;

    const payload: Partial<PatientInsuranceCreateInput> = {
      notes: notesDraft,
    };

    if (frontFile) payload.card_image_front = frontFile;
    if (backFile) payload.card_image_back = backFile;
    if (removeFront && !frontFile) payload.remove_card_image_front = true;
    if (removeBack && !backFile) payload.remove_card_image_back = true;

    try {
      await updateEnrollment.mutateAsync({
        id: enrollment.id,
        data: payload,
      });
      toast({ title: 'Enrollment updated' });
      setIsEditing(false);
      await refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update enrollment.';
      toast({ title: 'Update failed', description: message, variant: 'destructive' });
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setFrontFile(null);
    setBackFile(null);
    setFrontPreview(null);
    setBackPreview(null);
    setRemoveFront(false);
    setRemoveBack(false);
    setNotesDraft(enrollment?.notes || '');
  };

  const handlePostProfile = async () => {
    if (!enrollment) return;
    try {
      const result = await postHealthcloudProfile.mutateAsync({
        id: enrollment.id,
        data: {
          service_name: serviceName,
          ...(profileIdInput ? { profile_id: profileIdInput } : {}),
        },
      });
      const identity = result.identity as Record<string, unknown>;
      setProfileIdInput(String(identity.id || identity.profile_id || profileIdInput));
      toast({
        title: 'Profile posted to Health CRM',
        description: String(identity.service_account_number || 'Request accepted.'),
      });
      await refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to post profile to Health CRM.';
      toast({ title: 'Post profile failed', description: message, variant: 'destructive' });
    }
  };

  const handlePollHealthId = async () => {
    if (!enrollment) return;
    try {
      const result = await getHealthcloudHealthId.mutateAsync({
        id: enrollment.id,
        data: profileIdInput ? { profile_id: profileIdInput } : {},
      });
      const identity = result.identity as Record<string, unknown>;
      toast({
        title: 'Health ID polled',
        description: identity.health_id
          ? `Health ID: ${String(identity.health_id)}`
          : 'Health ID not assigned yet. Continue polling or wait for webhook.',
      });
      await refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to poll Health ID.';
      toast({ title: 'Poll failed', description: message, variant: 'destructive' });
    }
  };

  if (!Number.isFinite(enrollmentId)) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Enrollment" />
        <Card>
          <CardContent className="p-4">Invalid enrollment ID.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Enrollment #${enrollmentId}`}
        helpContent="Enrollment details, secure card image previews, and editable notes."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push('/insurance/enrollments')}>
              Back to Enrollments
            </Button>
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)}>
                Edit
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleCancelEdit}>
                  Cancel
                </Button>
                <Button onClick={() => void handleSave()} disabled={updateEnrollment.isPending}>
                  {updateEnrollment.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </>
            )}
          </div>
        }
      />

      {isLoading && (
        <Card>
          <CardContent className="p-4">Loading enrollment...</CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="p-4">Failed to load enrollment.</CardContent>
        </Card>
      )}

      {enrollment && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Health ID Workflow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const identity = extractHealthIdentitySnapshot(enrollment.last_eligibility_payload);
                const resolvedProfileId = identity.profileRequestId || identity.profileId;
                const hasHealthId = !!identity.healthId;

                return (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Profile Request ID</p>
                        <p className="font-medium break-all">{identity.profileRequestId || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Profile ID</p>
                        <p className="font-medium break-all">{identity.profileId || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Service Account Number</p>
                        <p className="font-medium">{identity.serviceAccountNumber || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Health ID</p>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{identity.healthId || 'Pending'}</p>
                          <Badge
                            className={
                              hasHealthId
                                ? 'bg-green-100 text-green-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }
                          >
                            {hasHealthId ? 'Assigned' : 'Awaiting assignment'}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Profile Posted</p>
                        <p className="font-medium">{formatOptionalDate(identity.postedAt)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Last Health ID Check</p>
                        <p className="font-medium">{formatOptionalDate(identity.checkedAt)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="healthcrm-service-name">Service Name</Label>
                        <Input
                          id="healthcrm-service-name"
                          value={serviceName}
                          onChange={(e) => setServiceName(e.target.value)}
                          placeholder="SLADE_ADVANTAGE"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="healthcrm-profile-id">Profile ID (optional override)</Label>
                        <Input
                          id="healthcrm-profile-id"
                          value={profileIdInput}
                          onChange={(e) => setProfileIdInput(e.target.value)}
                          placeholder={resolvedProfileId || 'Auto from enrollment snapshot'}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => void handlePostProfile()}
                        disabled={postHealthcloudProfile.isPending}
                      >
                        {postHealthcloudProfile.isPending ? 'Posting...' : 'Post Profile to Health CRM'}
                      </Button>
                      <Button
                        onClick={() => void handlePollHealthId()}
                        disabled={getHealthcloudHealthId.isPending}
                      >
                        {getHealthcloudHealthId.isPending ? 'Polling...' : 'Poll Health ID'}
                      </Button>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Webhook endpoint (optional): <code>/api/insurance/healthcloud/webhooks/health-id/</code>
                    </p>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enrollment Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Patient</p>
                <p className="font-medium">{enrollment.patient_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Provider</p>
                <p className="font-medium">{enrollment.provider_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Plan</p>
                <p className="font-medium">{enrollment.plan_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge className={STATUS_COLORS[enrollment.status] || 'bg-gray-100 text-gray-800'}>
                  {enrollment.status.replace('_', ' ')}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Member Number</p>
                <p className="font-medium">{enrollment.member_number || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Policy Number</p>
                <p className="font-medium">{enrollment.policy_number || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Valid From</p>
                <p className="font-medium">{new Date(enrollment.valid_from).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Valid To</p>
                <p className="font-medium">{new Date(enrollment.valid_to).toLocaleDateString()}</p>
              </div>
              {isEditing && (
                <div className="md:col-span-2 rounded border p-3 text-xs text-muted-foreground">
                  Guardrail: changing core identifiers (member number or plan) resets eligibility state and expires in-flight authorization sessions until re-verified.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Card Images</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-2">Front</p>
                {(frontPreview || (!removeFront && enrollment.card_image_front)) ? (
                  <a href={frontPreview || enrollment.card_image_front || '#'} target="_blank" rel="noreferrer">
                    <Image
                      src={frontPreview || enrollment.card_image_front || ''}
                      alt="Insurance card front"
                      width={960}
                      height={640}
                      unoptimized
                      className="h-56 w-full rounded border object-contain bg-muted"
                    />
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">No front image uploaded.</p>
                )}
                {isEditing && (
                  <div className="mt-3 space-y-2">
                    <Label>Replace front image</Label>
                    <Input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        if (!file) return;
                        if (!validateCardFile(file)) return;
                        setFrontFile(file);
                        setRemoveFront(false);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFrontFile(null);
                        setFrontPreview(null);
                        setRemoveFront(true);
                      }}
                    >
                      Remove Front Image
                    </Button>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Back</p>
                {(backPreview || (!removeBack && enrollment.card_image_back)) ? (
                  <a href={backPreview || enrollment.card_image_back || '#'} target="_blank" rel="noreferrer">
                    <Image
                      src={backPreview || enrollment.card_image_back || ''}
                      alt="Insurance card back"
                      width={960}
                      height={640}
                      unoptimized
                      className="h-56 w-full rounded border object-contain bg-muted"
                    />
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">No back image uploaded.</p>
                )}
                {isEditing && (
                  <div className="mt-3 space-y-2">
                    <Label>Replace back image</Label>
                    <Input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        if (!file) return;
                        if (!validateCardFile(file)) return;
                        setBackFile(file);
                        setRemoveBack(false);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setBackFile(null);
                        setBackPreview(null);
                        setRemoveBack(true);
                      }}
                    >
                      Remove Back Image
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <Textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Enrollment notes"
                  rows={4}
                />
              ) : enrollment.notes ? (
                <p className="text-sm whitespace-pre-wrap">{enrollment.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No notes added.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
