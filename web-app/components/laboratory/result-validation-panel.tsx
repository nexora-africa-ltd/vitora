'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Label } from '@/components/ui/label';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  Stethoscope,
  MessageSquare,
  User,
  Calendar,
  Loader2,
} from 'lucide-react';
import { HelpPopover } from '@/components/shared/help-popover';
import { ValidationStatusBadge, ValidationSummary } from './validation-status-badge';
import {
  useResultValidations,
  useCreateResultValidation,
} from '@/lib/hooks/use-laboratory';
import { useToast } from '@/lib/hooks';
import { cn } from '@/lib/utils/cn';
import {
  ResultValidation,
  ValidationType,
  ValidationStatus,
} from '@/lib/types/laboratory';
import { formatDistanceToNow } from 'date-fns';

interface ResultValidationPanelProps {
  resultId: number;
  /** Current verification status from the result */
  verificationStatus?: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';
  /** Whether user can add technical validations */
  canAddTechnical?: boolean;
  /** Whether user can add clinical validations */
  canAddClinical?: boolean;
  /** Compact mode for inline display */
  compact?: boolean;
  /** Callback when validation is added */
  onValidationAdded?: () => void;
}

/**
 * Panel for displaying and managing two-stage validation (technical + clinical).
 * Shows validation history and allows authorized users to add validations.
 */
export function ResultValidationPanel({
  resultId,
  verificationStatus = 'UNVERIFIED',
  canAddTechnical = true,
  canAddClinical = true,
  compact = false,
  onValidationAdded,
}: ResultValidationPanelProps) {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedType, setSelectedType] = useState<ValidationType | null>(null);

  const {
    data: validations,
    isLoading,
    error,
  } = useResultValidations(resultId);

  const createValidation = useCreateResultValidation();

  // Determine validation states
  const technicalValidation = validations?.find(
    (v) => v.validation_type === 'TECHNICAL'
  );
  const clinicalValidation = validations?.find(
    (v) => v.validation_type === 'CLINICAL'
  );

  const technicalStatus = technicalValidation?.status;
  const clinicalStatus = clinicalValidation?.status;

  const isFullyValidated =
    technicalStatus === 'APPROVED' && clinicalStatus === 'APPROVED';

  // Determine what actions are available
  const canSubmitTechnical =
    canAddTechnical &&
    (!technicalValidation || technicalValidation.status === 'REJECTED');
  const canSubmitClinical =
    canAddClinical &&
    technicalStatus === 'APPROVED' &&
    (!clinicalValidation || clinicalValidation.status === 'REJECTED');

  const handleOpenAddDialog = (type: ValidationType) => {
    setSelectedType(type);
    setShowAddDialog(true);
  };

  const handleCloseDialog = () => {
    setShowAddDialog(false);
    setSelectedType(null);
  };

  if (compact) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <ValidationSummary
          technicalStatus={technicalStatus}
          clinicalStatus={clinicalStatus}
        />
        <div className="flex gap-2">
          {canSubmitTechnical && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleOpenAddDialog('TECHNICAL')}
              className="gap-1"
            >
              <Shield className="h-3 w-3" />
              <span className="hidden sm:inline">Technical Review</span>
              <span className="sm:hidden">Tech</span>
            </Button>
          )}
          {canSubmitClinical && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleOpenAddDialog('CLINICAL')}
              className="gap-1"
            >
              <Stethoscope className="h-3 w-3" />
              <span className="hidden sm:inline">Clinical Review</span>
              <span className="sm:hidden">Clin</span>
            </Button>
          )}
        </div>
        <AddValidationDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          resultId={resultId}
          validationType={selectedType}
          onSuccess={() => {
            handleCloseDialog();
            onValidationAdded?.();
          }}
        />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Two-Stage Validation</CardTitle>
          <HelpPopover content="Results require both technical review (by lab technician) and clinical review (by pathologist) before release." />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Status */}
        {isFullyValidated ? (
          <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-700 dark:text-green-300">
              Fully Validated - Ready for Release
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
              {!technicalStatus
                ? 'Awaiting Technical Review'
                : technicalStatus === 'REJECTED'
                  ? 'Technical Review Rejected'
                  : !clinicalStatus
                    ? 'Awaiting Clinical Review'
                    : 'Clinical Review Rejected'}
            </span>
          </div>
        )}

        {/* Validation History */}
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Failed to load validations</p>
        ) : (
          <div className="space-y-3">
            {/* Technical Validation */}
            <ValidationCard
              type="TECHNICAL"
              validation={technicalValidation}
              canSubmit={canSubmitTechnical}
              onSubmit={() => handleOpenAddDialog('TECHNICAL')}
            />

            {/* Clinical Validation (only show after technical) */}
            {(technicalStatus === 'APPROVED' || clinicalValidation) && (
              <ValidationCard
                type="CLINICAL"
                validation={clinicalValidation}
                canSubmit={canSubmitClinical}
                onSubmit={() => handleOpenAddDialog('CLINICAL')}
                disabled={technicalStatus !== 'APPROVED'}
              />
            )}
          </div>
        )}

        {/* Add Validation Dialog */}
        <AddValidationDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          resultId={resultId}
          validationType={selectedType}
          onSuccess={() => {
            handleCloseDialog();
            onValidationAdded?.();
          }}
        />
      </CardContent>
    </Card>
  );
}

// ============ Sub-components ============

interface ValidationCardProps {
  type: ValidationType;
  validation?: ResultValidation;
  canSubmit: boolean;
  onSubmit: () => void;
  disabled?: boolean;
}

function ValidationCard({
  type,
  validation,
  canSubmit,
  onSubmit,
  disabled,
}: ValidationCardProps) {
  const Icon = type === 'TECHNICAL' ? Shield : Stethoscope;
  const label = type === 'TECHNICAL' ? 'Technical Review' : 'Clinical Review';

  if (!validation) {
    return (
      <div
        className={cn(
          'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg border border-dashed',
          disabled && 'opacity-50'
        )}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="text-sm">{label}</span>
          <Badge variant="outline" className="text-xs">
            Pending
          </Badge>
        </div>
        {canSubmit && !disabled && (
          <Button size="sm" variant="outline" onClick={onSubmit} className="w-full sm:w-auto">
            Submit Review
          </Button>
        )}
      </div>
    );
  }

  const isApproved = validation.status === 'APPROVED';
  const isRejected = validation.status === 'REJECTED';

  return (
    <div
      className={cn(
        'p-3 rounded-lg border',
        isApproved && 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800',
        isRejected && 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            <span className="text-sm font-medium">{label}</span>
            <ValidationStatusBadge
              validationType={type}
              status={validation.status}
              showIcon={false}
            />
          </div>

          {/* Validator Info */}
          {validation.validated_by_name && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              <span>{validation.validated_by_name}</span>
              {validation.validated_at && (
                <>
                  <span>•</span>
                  <Calendar className="h-3 w-3" />
                  <span>
                    {formatDistanceToNow(new Date(validation.validated_at), {
                      addSuffix: true,
                    })}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Comment */}
          {validation.comment && (
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground mt-1">
              <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="line-clamp-2">{validation.comment}</span>
            </div>
          )}
        </div>

        {/* Re-submit button if rejected */}
        {isRejected && canSubmit && (
          <Button size="sm" variant="outline" onClick={onSubmit} className="shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
            Re-submit
          </Button>
        )}
      </div>
    </div>
  );
}

// ============ Add Validation Dialog ============

interface AddValidationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resultId: number;
  validationType: ValidationType | null;
  onSuccess: () => void;
}

function AddValidationDialog({
  open,
  onOpenChange,
  resultId,
  validationType,
  onSuccess,
}: AddValidationDialogProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [comment, setComment] = useState('');

  const createValidation = useCreateResultValidation();

  const handleSubmit = async () => {
    if (!validationType) return;

    try {
      await createValidation.mutateAsync({
        resultId,
        data: {
          validation_type: validationType,
          status,
          comment: comment.trim() || undefined,
        },
      });

      toast({
        title: 'Validation submitted',
        description: `${validationType.toLowerCase()} review has been recorded.`,
      });

      // Reset form
      setStatus('APPROVED');
      setComment('');
      onSuccess();
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to submit validation',
        variant: 'destructive',
      });
    }
  };

  const Icon = validationType === 'TECHNICAL' ? Shield : Stethoscope;
  const typeLabel =
    validationType === 'TECHNICAL' ? 'Technical Review' : 'Clinical Review';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="flex items-center gap-2">
              {validationType && <Icon className="h-5 w-5" />}
              {typeLabel}
            </DialogTitle>
            <HelpPopover
              content={
                validationType === 'TECHNICAL'
                  ? 'Technical review verifies analytical accuracy: specimen quality, equipment calibration, and result consistency.'
                  : 'Clinical review verifies clinical relevance: consistency with patient history, need for repeat testing, and clinical interpretation.'
              }
            />
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Decision */}
          <div className="space-y-2">
            <Label>Decision</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as 'APPROVED' | 'REJECTED')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="APPROVED">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Approve</span>
                  </div>
                </SelectItem>
                <SelectItem value="REJECTED">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span>Reject</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <Label>
              Comment{' '}
              <span className="text-muted-foreground font-normal">
                {status === 'REJECTED' ? '(required)' : '(optional)'}
              </span>
            </Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                status === 'REJECTED'
                  ? 'Explain reason for rejection...'
                  : 'Add any notes or observations...'
              }
              className="min-h-[80px]"
            />
          </div>

          {/* Rejection Warning */}
          {status === 'REJECTED' && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg text-sm">
              <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-destructive">
                Rejecting this result will require correction and re-submission.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              createValidation.isPending ||
              (status === 'REJECTED' && !comment.trim())
            }
            variant={status === 'REJECTED' ? 'destructive' : 'default'}
            className="w-full sm:w-auto"
          >
            {createValidation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                {status === 'APPROVED' ? (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                {status === 'APPROVED' ? 'Approve' : 'Reject'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ResultValidationPanel;
