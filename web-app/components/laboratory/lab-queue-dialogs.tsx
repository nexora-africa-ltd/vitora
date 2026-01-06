'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Syringe, UserPlus, XCircle, FileText, Search } from 'lucide-react';
import { LabQueue, LabTechnician } from '@/lib/types/laboratory';

// ============================================================================
// Sample Collection Dialog
// ============================================================================

interface SampleCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queueEntry: LabQueue | null;
  onSubmit: (sampleId: string) => Promise<void>;
  isLoading?: boolean;
}

export function SampleCollectionDialog({
  open,
  onOpenChange,
  queueEntry,
  onSubmit,
  isLoading = false,
}: SampleCollectionDialogProps) {
  const [sampleId, setSampleId] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(sampleId);
    setSampleId('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Syringe className="h-5 w-5" />
              Collect Sample
            </DialogTitle>
            <DialogDescription>
              Record sample collection for {queueEntry?.patient_name}
              <br />
              <span className="font-mono text-xs">{queueEntry?.queue_number}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sample-type">Sample Type</Label>
              <Input
                id="sample-type"
                value={queueEntry?.sample_type || ''}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sample-id">
                Sample Barcode / Tube ID
                <span className="text-muted-foreground ml-1">(optional)</span>
              </Label>
              <Input
                id="sample-id"
                placeholder="Scan or enter barcode..."
                value={sampleId}
                onChange={(e) => setSampleId(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Enter the barcode or tube ID for tracking purposes
              </p>
            </div>

            <div className="space-y-2">
              <Label>Tests Ordered</Label>
              <div className="text-sm text-muted-foreground">
                {queueEntry?.tests?.map((test) => test.name).join(', ') || 'No tests'}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Collect Sample
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Technician Assignment Dialog
// ============================================================================

interface TechnicianAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queueEntry: LabQueue | null;
  technicians: LabTechnician[];
  onSubmit: (technicianId: number | null) => Promise<void>;
  isLoading?: boolean;
  isTechniciansLoading?: boolean;
}

export function TechnicianAssignmentDialog({
  open,
  onOpenChange,
  queueEntry,
  technicians,
  onSubmit,
  isLoading = false,
  isTechniciansLoading = false,
}: TechnicianAssignmentDialogProps) {
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>(
    queueEntry?.assigned_technician?.toString() || ''
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const techId = selectedTechnicianId ? parseInt(selectedTechnicianId, 10) : null;
    await onSubmit(techId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Assign Technician
            </DialogTitle>
            <DialogDescription>
              Assign a lab technician to process this sample
              <br />
              <span className="font-mono text-xs">{queueEntry?.queue_number}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="patient">Patient</Label>
              <Input
                id="patient"
                value={`${queueEntry?.patient_name} (${queueEntry?.patient_mrn})`}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="technician">Technician</Label>
              <Select
                value={selectedTechnicianId}
                onValueChange={setSelectedTechnicianId}
                disabled={isTechniciansLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select technician..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id.toString()}>
                      {tech.full_name || tech.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {queueEntry?.assigned_technician_name && (
              <p className="text-sm text-muted-foreground">
                Currently assigned to: <strong>{queueEntry.assigned_technician_name}</strong>
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {selectedTechnicianId ? 'Assign' : 'Unassign'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Reject Sample Dialog
// ============================================================================

interface RejectSampleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queueEntry: LabQueue | null;
  onSubmit: (reason: string) => Promise<void>;
  isLoading?: boolean;
}

const REJECTION_REASONS = [
  'Hemolyzed sample - cannot process',
  'Insufficient sample volume',
  'Sample clotted',
  'Incorrect tube type',
  'Sample contaminated',
  'Labeling error',
  'Sample expired/too old',
  'Patient refused blood draw',
  'Equipment malfunction',
  'Other (specify below)',
];

export function RejectSampleDialog({
  open,
  onOpenChange,
  queueEntry,
  onSubmit,
  isLoading = false,
}: RejectSampleDialogProps) {
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const reason = selectedReason === 'Other (specify below)' ? customReason : selectedReason;
    if (reason.length < 5) return;
    await onSubmit(reason);
    setSelectedReason('');
    setCustomReason('');
    onOpenChange(false);
  };

  const isCustomReason = selectedReason === 'Other (specify below)';
  const isValid = isCustomReason ? customReason.length >= 5 : selectedReason.length >= 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Reject Sample
            </DialogTitle>
            <DialogDescription>
              This will mark the sample as rejected. A new sample may need to be collected.
              <br />
              <span className="font-mono text-xs">{queueEntry?.queue_number}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="patient">Patient / Sample</Label>
              <div className="text-sm">
                {queueEntry?.patient_name} • {queueEntry?.sample_type}
                {queueEntry?.sample_id && (
                  <span className="font-mono ml-2">({queueEntry.sample_id})</span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Rejection Reason</Label>
              <Select value={selectedReason} onValueChange={setSelectedReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent>
                  {REJECTION_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isCustomReason && (
              <div className="space-y-2">
                <Label htmlFor="custom-reason">Specify Reason</Label>
                <Textarea
                  id="custom-reason"
                  placeholder="Enter detailed rejection reason (min 5 characters)..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  rows={3}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isLoading || !isValid}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject Sample
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Technician Notes Dialog
// ============================================================================

interface TechnicianNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queueEntry: LabQueue | null;
  onSubmit: (notes: string, append: boolean) => Promise<void>;
  isLoading?: boolean;
}

export function TechnicianNotesDialog({
  open,
  onOpenChange,
  queueEntry,
  onSubmit,
  isLoading = false,
}: TechnicianNotesDialogProps) {
  const [notes, setNotes] = useState('');
  const [appendMode, setAppendMode] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) return;
    await onSubmit(notes.trim(), appendMode);
    setNotes('');
    onOpenChange(false);
  };

  const existingNotes = queueEntry?.technician_notes;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Technician Notes
            </DialogTitle>
            <DialogDescription>
              Add processing notes for {queueEntry?.queue_number}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {existingNotes && (
              <div className="space-y-2">
                <Label>Existing Notes</Label>
                <div className="p-3 bg-muted rounded-md text-sm whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {existingNotes}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-notes">
                {existingNotes ? 'New Notes' : 'Notes'}
              </Label>
              <Textarea
                id="new-notes"
                placeholder="Enter processing observations, special handling notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                autoFocus
              />
            </div>

            {existingNotes && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="append-mode"
                  checked={appendMode}
                  onChange={(e) => setAppendMode(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="append-mode" className="text-sm font-normal">
                  Append to existing notes (uncheck to replace)
                </Label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !notes.trim()}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Notes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Barcode Search Dialog
// ============================================================================

interface BarcodeSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSearch: (barcode: string) => Promise<LabQueue | null>;
  onSelect: (queueEntry: LabQueue) => void;
  isLoading?: boolean;
}

export function BarcodeSearchDialog({
  open,
  onOpenChange,
  onSearch,
  onSelect,
  isLoading = false,
}: BarcodeSearchDialogProps) {
  const [barcode, setBarcode] = useState('');
  const [result, setResult] = useState<LabQueue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) return;

    setSearching(true);
    setError(null);
    setResult(null);

    try {
      const queueEntry = await onSearch(barcode.trim());
      if (queueEntry) {
        setResult(queueEntry);
      } else {
        setError('No queue entry found with this barcode');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = () => {
    if (result) {
      onSelect(result);
      setBarcode('');
      setResult(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Barcode Lookup
          </DialogTitle>
          <DialogDescription>
            Scan or enter a sample barcode or queue number to find a queue entry
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Scan or enter barcode..."
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              autoFocus
              className="flex-1"
            />
            <Button type="submit" disabled={searching || !barcode.trim()}>
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>

        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">{result.patient_name}</p>
                <p className="text-sm text-muted-foreground">{result.patient_mrn}</p>
              </div>
              <span className="font-mono text-sm">{result.queue_number}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Sample:</span>{' '}
                {result.sample_type}
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{' '}
                {result.queue_status}
              </div>
              <div>
                <span className="text-muted-foreground">Priority:</span>{' '}
                {result.priority}
              </div>
              {result.sample_id && (
                <div>
                  <span className="text-muted-foreground">Sample ID:</span>{' '}
                  <span className="font-mono">{result.sample_id}</span>
                </div>
              )}
            </div>

            <Button onClick={handleSelect} className="w-full">
              Select This Entry
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
