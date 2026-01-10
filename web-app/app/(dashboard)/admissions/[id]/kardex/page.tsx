'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, Plus, Save, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  useAdmission, 
  useKardexByAdmission, 
  useUpdateKardex,
  useAddKardexShiftNote,
  useAddKardexHandoverNote
} from '@/lib/hooks/use-inpatient';
import { useUser } from '@/lib/auth';
import { formatDateTime } from '@/lib/utils/format';
import type { RiskLevel, ShiftType } from '@/lib/types/inpatient';

const RISK_LEVELS: { value: RiskLevel; label: string }[] = [
  { value: 'LOW', label: 'Low Risk' },
  { value: 'MODERATE', label: 'Medium Risk' },
  { value: 'HIGH', label: 'High Risk' },
];

const SHIFT_TYPES: { value: ShiftType; label: string }[] = [
  { value: 'DAY', label: 'Day Shift' },
  { value: 'NIGHT', label: 'Night Shift' },
];

export default function KardexPage() {
  const params = useParams();
  const router = useRouter();
  const user = useUser();
  const admissionId = Number(params.id);

  const { data: admission, isLoading: admissionLoading } = useAdmission(admissionId);
  const { data: kardex, isLoading: kardexLoading, refetch } = useKardexByAdmission(admissionId);
  const updateKardex = useUpdateKardex();
  const addShiftNote = useAddKardexShiftNote();
  const addHandoverNote = useAddKardexHandoverNote();

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [mobilityStatus, setMobilityStatus] = useState('');
  const [dietaryRequirements, setDietaryRequirements] = useState('');
  const [allergies, setAllergies] = useState('');
  const [ivAccess, setIvAccess] = useState('');
  const [nursingProblems, setNursingProblems] = useState('');
  const [interventions, setInterventions] = useState('');
  const [monitoringRequirements, setMonitoringRequirements] = useState('');
  const [fallRisk, setFallRisk] = useState<RiskLevel>('LOW');
  const [pressureSoreRisk, setPressureSoreRisk] = useState<RiskLevel>('LOW');
  const [isolationRequired, setIsolationRequired] = useState(false);
  const [isolationType, setIsolationType] = useState('');

  // New note dialogs
  const [shiftNoteOpen, setShiftNoteOpen] = useState(false);
  const [shiftNoteContent, setShiftNoteContent] = useState('');
  const [shiftNoteType, setShiftNoteType] = useState<ShiftType>('DAY');
  
  const [handoverNoteOpen, setHandoverNoteOpen] = useState(false);
  const [handoverNoteContent, setHandoverNoteContent] = useState('');
  const [handoverNoteShift, setHandoverNoteShift] = useState<ShiftType>('DAY');

  const isLoading = admissionLoading || kardexLoading;

  // Initialize edit form when kardex loads
  const initEditForm = () => {
    if (kardex) {
      setMobilityStatus(kardex.mobility_status || '');
      setDietaryRequirements(kardex.dietary_requirements || '');
      setAllergies(kardex.allergies || '');
      setIvAccess(kardex.iv_access || '');
      setNursingProblems(kardex.nursing_problems || '');
      setInterventions(kardex.interventions || '');
      setMonitoringRequirements(kardex.monitoring_requirements || '');
      setFallRisk(kardex.fall_risk || 'LOW');
      setPressureSoreRisk(kardex.pressure_sore_risk || 'LOW');
      setIsolationRequired(kardex.isolation_required || false);
      setIsolationType(kardex.isolation_type || '');
    }
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!kardex) return;
    try {
      await updateKardex.mutateAsync({
        id: kardex.id,
        data: {
          mobility_status: mobilityStatus || undefined,
          dietary_requirements: dietaryRequirements || undefined,
          allergies: allergies || undefined,
          iv_access: ivAccess || undefined,
          nursing_problems: nursingProblems || undefined,
          interventions: interventions || undefined,
          monitoring_requirements: monitoringRequirements || undefined,
          fall_risk: fallRisk,
          pressure_sore_risk: pressureSoreRisk,
          isolation_required: isolationRequired,
          isolation_type: isolationRequired ? isolationType : undefined,
        },
      });
      alert('Kardex updated successfully');
      setIsEditing(false);
      refetch();
    } catch (error) {
      alert('Failed to update kardex');
      console.error(error);
    }
  };

  const handleAddShiftNote = async () => {
    if (!kardex || !shiftNoteContent) return;
    try {
      await addShiftNote.mutateAsync({
        kardexId: kardex.id,
        data: {
          shift: shiftNoteType,
          content: shiftNoteContent,
        },
      });
      alert('Shift note added');
      setShiftNoteOpen(false);
      setShiftNoteContent('');
      refetch();
    } catch (error) {
      alert('Failed to add shift note');
      console.error(error);
    }
  };

  const handleAddHandoverNote = async () => {
    if (!kardex || !handoverNoteContent) return;
    try {
      await addHandoverNote.mutateAsync({
        kardexId: kardex.id,
        data: {
          from_shift: handoverNoteShift,
          to_shift: handoverNoteShift === 'DAY' ? 'NIGHT' : 'DAY',
          content: handoverNoteContent,
        },
      });
      alert('Handover note added');
      setHandoverNoteOpen(false);
      setHandoverNoteContent('');
      refetch();
    } catch (error) {
      alert('Failed to add handover note');
      console.error(error);
    }
  };

  if (isLoading) {
    return <KardexSkeleton />;
  }

  if (!admission) {
    return (
      <div className="container mx-auto py-12 text-center">
        <h2 className="text-xl font-semibold">Admission not found</h2>
        <Button onClick={() => router.push('/admissions')} className="mt-4">
          Back to Admissions
        </Button>
      </div>
    );
  }

  if (!kardex) {
    return (
      <div className="container mx-auto py-12 text-center">
        <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold">No Kardex Found</h2>
        <p className="text-muted-foreground mt-2">
          A nursing kardex should be automatically created on admission.
        </p>
        <Button onClick={() => router.push(`/admissions/${admissionId}`)} className="mt-4">
          Back to Admission
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Link href={`/admissions/${admissionId}`} className="text-sm text-muted-foreground hover:text-primary">
          Back to Admission
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <PageHeader
          title="Nursing Kardex"
          description={`${kardex.patient_name} - ${kardex.ward_name} - Bed ${kardex.bed_number}`}
        />
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={updateKardex.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateKardex.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          ) : (
            <Button onClick={initEditForm}>Edit Kardex</Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="care" className="space-y-4">
        <TabsList>
          <TabsTrigger value="care">Care Information</TabsTrigger>
          <TabsTrigger value="risks">Risk Assessment</TabsTrigger>
          <TabsTrigger value="notes">Shift Notes</TabsTrigger>
          <TabsTrigger value="handover">Handover</TabsTrigger>
        </TabsList>

        {/* Care Information Tab */}
        <TabsContent value="care" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Basic Care</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <>
                    <div className="space-y-2">
                      <Label>Mobility Status</Label>
                      <Input
                        value={mobilityStatus}
                        onChange={(e) => setMobilityStatus(e.target.value)}
                        placeholder="e.g., Ambulatory, Wheelchair, Bedridden"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Dietary Requirements</Label>
                      <Input
                        value={dietaryRequirements}
                        onChange={(e) => setDietaryRequirements(e.target.value)}
                        placeholder="e.g., Regular, Diabetic, NPO"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Allergies</Label>
                      <Input
                        value={allergies}
                        onChange={(e) => setAllergies(e.target.value)}
                        placeholder="e.g., Penicillin, Latex"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>IV Access</Label>
                      <Input
                        value={ivAccess}
                        onChange={(e) => setIvAccess(e.target.value)}
                        placeholder="e.g., Right arm IV cannula"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <InfoItem label="Mobility Status" value={kardex.mobility_status || 'Not specified'} />
                    <InfoItem label="Dietary Requirements" value={kardex.dietary_requirements || 'Regular'} />
                    <InfoItem label="Allergies" value={kardex.allergies || 'None known'} />
                    <InfoItem label="IV Access" value={kardex.iv_access || 'None'} />
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Nursing Care Plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <>
                    <div className="space-y-2">
                      <Label>Nursing Problems</Label>
                      <Textarea
                        value={nursingProblems}
                        onChange={(e) => setNursingProblems(e.target.value)}
                        placeholder="Current nursing problems..."
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Interventions</Label>
                      <Textarea
                        value={interventions}
                        onChange={(e) => setInterventions(e.target.value)}
                        placeholder="Planned nursing interventions..."
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Monitoring Requirements</Label>
                      <Textarea
                        value={monitoringRequirements}
                        onChange={(e) => setMonitoringRequirements(e.target.value)}
                        placeholder="Monitoring requirements..."
                        rows={3}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-sm font-medium">Nursing Problems</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {kardex.nursing_problems || 'None documented.'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Interventions</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {kardex.interventions || 'None documented.'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Monitoring Requirements</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {kardex.monitoring_requirements || 'None documented.'}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Risk Assessment Tab */}
        <TabsContent value="risks" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Fall Risk */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Fall Risk
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <div className="space-y-2">
                    <Label>Risk Level</Label>
                    <Select value={fallRisk} onValueChange={(v) => setFallRisk(v as RiskLevel)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RISK_LEVELS.map((level) => (
                          <SelectItem key={level.value} value={level.value}>
                            {level.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Badge variant={kardex.fall_risk !== 'LOW' ? 'destructive' : 'secondary'}>
                      {kardex.fall_risk}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pressure Sore Risk */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Pressure Sore Risk
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <div className="space-y-2">
                    <Label>Risk Level</Label>
                    <Select value={pressureSoreRisk} onValueChange={(v) => setPressureSoreRisk(v as RiskLevel)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RISK_LEVELS.map((level) => (
                          <SelectItem key={level.value} value={level.value}>
                            {level.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Badge variant={kardex.pressure_sore_risk !== 'LOW' ? 'destructive' : 'secondary'}>
                      {kardex.pressure_sore_risk}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Isolation */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Isolation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <>
                    <div className="flex items-center justify-between">
                      <Label>Isolation Required</Label>
                      <Switch checked={isolationRequired} onCheckedChange={setIsolationRequired} />
                    </div>
                    {isolationRequired && (
                      <div className="space-y-2">
                        <Label>Isolation Type</Label>
                        <Input
                          value={isolationType}
                          onChange={(e) => setIsolationType(e.target.value)}
                          placeholder="e.g., Contact, Droplet, Airborne"
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <Badge variant={kardex.isolation_required ? 'destructive' : 'secondary'}>
                      {kardex.isolation_required ? 'Required' : 'Not Required'}
                    </Badge>
                    {kardex.isolation_required && kardex.isolation_type && (
                      <p className="text-sm text-muted-foreground">
                        Type: {kardex.isolation_type}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Shift Notes Tab */}
        <TabsContent value="notes" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Shift Notes</h3>
            <Dialog open={shiftNoteOpen} onOpenChange={setShiftNoteOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Shift Note
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Shift Note</DialogTitle>
                  <DialogDescription>
                    Record observations and care provided during your shift.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Shift</Label>
                    <Select value={shiftNoteType} onValueChange={(v) => setShiftNoteType(v as ShiftType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SHIFT_TYPES.map((shift) => (
                          <SelectItem key={shift.value} value={shift.value}>
                            {shift.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Note</Label>
                    <Textarea
                      value={shiftNoteContent}
                      onChange={(e) => setShiftNoteContent(e.target.value)}
                      placeholder="Record your observations..."
                      rows={4}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShiftNoteOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddShiftNote} disabled={!shiftNoteContent || addShiftNote.isPending}>
                    {addShiftNote.isPending ? 'Adding...' : 'Add Note'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {(kardex.shift_notes?.length ?? 0) === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No shift notes recorded yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {kardex.shift_notes?.map((note) => (
                <Card key={note.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{note.shift} Shift</Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatDateTime(note.timestamp)}
                      </span>
                    </div>
                    <CardDescription>
                      By {note.nurse_username}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Handover Tab */}
        <TabsContent value="handover" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Handover Notes</h3>
            <Dialog open={handoverNoteOpen} onOpenChange={setHandoverNoteOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Handover Note
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Handover Note</DialogTitle>
                  <DialogDescription>
                    Document important information for the incoming shift.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Your Shift (Ending)</Label>
                    <Select value={handoverNoteShift} onValueChange={(v) => setHandoverNoteShift(v as ShiftType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SHIFT_TYPES.map((shift) => (
                          <SelectItem key={shift.value} value={shift.value}>
                            {shift.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Handover Note</Label>
                    <Textarea
                      value={handoverNoteContent}
                      onChange={(e) => setHandoverNoteContent(e.target.value)}
                      placeholder="Important information for the incoming shift..."
                      rows={4}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setHandoverNoteOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddHandoverNote} disabled={!handoverNoteContent || addHandoverNote.isPending}>
                    {addHandoverNote.isPending ? 'Adding...' : 'Add Handover'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {(kardex.handover_notes?.length ?? 0) === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No handover notes recorded yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {kardex.handover_notes?.map((note) => (
                <Card key={note.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{note.shift_ending}</Badge>
                        <span>→</span>
                        <Badge variant="outline">{note.shift_ending === 'DAY' ? 'NIGHT' : 'DAY'}</Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {formatDateTime(note.created_at)}
                      </span>
                    </div>
                    <CardDescription>
                      From {note.outgoing_nurse_username} to {note.incoming_nurse_username}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{note.pending_tasks}</p>
                    {note.escalations && (
                      <div className="mt-2 pt-2 border-t">
                        <p className="text-sm font-medium text-destructive">Escalations:</p>
                        <p className="text-sm whitespace-pre-wrap">{note.escalations}</p>
                      </div>
                    )}
                    {note.acknowledged_at && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Acknowledged at {formatDateTime(note.acknowledged_at)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function KardexSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
