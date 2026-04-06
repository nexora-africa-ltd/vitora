'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/lib/hooks/use-toast';
import { useAuth } from '@/lib/auth/context';
import { useCreateATRReport } from '@/lib/hooks/use-inpatient';
import {
  GENERAL_REACTION_OPTIONS,
  DERMATOLOGICAL_REACTION_OPTIONS,
  CARDIAC_RESPIRATORY_REACTION_OPTIONS,
  RENAL_REACTION_OPTIONS,
  HAEMATOLOGICAL_REACTION_OPTIONS,
} from '@/lib/types/inpatient';
import type {
  GeneralReaction,
  DermatologicalReaction,
  CardiacRespiratoryReaction,
  RenalReaction,
  HaematologicalReaction,
  ObstetricStatus,
  AdverseTransfusionReactionCreate,
} from '@/lib/types/inpatient';

/** Parse a comma-separated query param into a typed array, filtering to valid enum values. */
function parseEnumParam<T extends string>(param: string | null, validValues: readonly { value: T }[]): T[] {
  if (!param) return [];
  const valid = new Set(validValues.map((v) => v.value));
  return param.split(',').filter((v): v is T => valid.has(v as T));
}

export default function NewATRReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const transfusionId = searchParams.get('transfusion');
  const { toast } = useToast();
  const { user } = useAuth();
  const createMutation = useCreateATRReport();

  // Section 1: Patient history
  const [preTransfusionHb, setPreTransfusionHb] = useState('');
  const [obstetricStatus, setObstetricStatus] = useState<ObstetricStatus>('NA');
  const [gravida, setGravida] = useState('');
  const [para, setPara] = useState('');
  const [previousTransfusion, setPreviousTransfusion] = useState(false);
  const [previousTransfusionComment, setPreviousTransfusionComment] = useState('');
  const [previousReactions, setPreviousReactions] = useState(false);
  const [previousReactionsComment, setPreviousReactionsComment] = useState('');
  const [currentMedications, setCurrentMedications] = useState('');

  // Section 2: Reaction categories — pre-populated from query params set by the blood transfusion chart
  const [generalReactions, setGeneralReactions] = useState<GeneralReaction[]>(() =>
    parseEnumParam(searchParams.get('general'), GENERAL_REACTION_OPTIONS)
  );
  const [dermatologicalReactions, setDermatologicalReactions] = useState<DermatologicalReaction[]>(() =>
    parseEnumParam(searchParams.get('dermatological'), DERMATOLOGICAL_REACTION_OPTIONS)
  );
  const [cardiacRespiratoryReactions, setCardiacRespiratoryReactions] = useState<CardiacRespiratoryReaction[]>(() =>
    parseEnumParam(searchParams.get('cardiac'), CARDIAC_RESPIRATORY_REACTION_OPTIONS)
  );
  const [renalReactions, setRenalReactions] = useState<RenalReaction[]>(() =>
    parseEnumParam(searchParams.get('renal'), RENAL_REACTION_OPTIONS)
  );
  const [haematologicalReactions, setHaematologicalReactions] = useState<HaematologicalReaction[]>(() =>
    parseEnumParam(searchParams.get('haematological'), HAEMATOLOGICAL_REACTION_OPTIONS)
  );
  const [otherReactions, setOtherReactions] = useState(() => searchParams.get('other') || '');

  // Section 6: Reporter details — auto-populated from staff profile, editable
  const [reporterCadre, setReporterCadre] = useState(() => user?.role_display || '');
  const [reporterMobile, setReporterMobile] = useState(() => user?.phone_number || '');
  const [reporterEmail, setReporterEmail] = useState(() => user?.email || '');

  // Fill empty reporter fields when user profile syncs (handles stale localStorage)
  useEffect(() => {
    if (user?.role_display) setReporterCadre((prev) => prev || user.role_display!);
    if (user?.phone_number) setReporterMobile((prev) => prev || user.phone_number!);
    if (user?.email) setReporterEmail((prev) => prev || user.email);
  }, [user?.role_display, user?.phone_number, user?.email]);

  function toggleReaction<T extends string>(list: T[], setList: (v: T[]) => void, value: T) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  const hasAnyReaction =
    generalReactions.length > 0 ||
    dermatologicalReactions.length > 0 ||
    cardiacRespiratoryReactions.length > 0 ||
    renalReactions.length > 0 ||
    haematologicalReactions.length > 0 ||
    otherReactions.trim().length > 0;

  const canSubmit = !!transfusionId && hasAnyReaction && !createMutation.isPending;

  function handleSubmit() {
    if (!canSubmit) return;
    const data: AdverseTransfusionReactionCreate = {
      transfusion: parseInt(transfusionId!, 10),
      pre_transfusion_hb: preTransfusionHb || undefined,
      obstetric_status: obstetricStatus,
      gravida: gravida ? parseInt(gravida, 10) : undefined,
      para: para ? parseInt(para, 10) : undefined,
      previous_transfusion: previousTransfusion,
      previous_transfusion_comment: previousTransfusionComment || undefined,
      previous_reactions: previousReactions,
      previous_reactions_comment: previousReactionsComment || undefined,
      current_medications: currentMedications || undefined,
      general_reactions: generalReactions,
      dermatological_reactions: dermatologicalReactions,
      cardiac_respiratory_reactions: cardiacRespiratoryReactions,
      renal_reactions: renalReactions,
      haematological_reactions: haematologicalReactions,
      other_reactions: otherReactions || undefined,
      initial_reporter_cadre: reporterCadre || undefined,
      initial_reporter_mobile: reporterMobile || undefined,
      initial_reporter_email: reporterEmail || undefined,
    };
    createMutation.mutate(data, {
      onSuccess: (result) => {
        toast({ title: 'ATR Report Created', description: 'Adverse transfusion reaction report has been recorded.' });
        router.push(`/inpatient/adverse-transfusion-reaction/${result.id}`);
      },
      onError: () => {
        toast({ title: 'Error', description: 'Failed to create ATR report.', variant: 'destructive' });
      },
    });
  }

  if (!transfusionId) {
    return (
      <div className="p-6">
        <PageHeader title="New ATR Report" />
        <Card className="mt-4">
          <CardContent className="py-8 text-center text-muted-foreground">
            No transfusion ID provided. Navigate from a blood transfusion chart to create an ATR report.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Adverse Transfusion Reaction Report"
        helpContent="Complete this form to report an adverse blood transfusion reaction to PPB, aligned with form FOM20/MIP/PMS/SOP/001."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Report
            </Button>
          </div>
        }
      />

      {/* Section 1: Patient History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Patient History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pre-hb">Pre-Transfusion Hb (g/dL)</Label>
              <Input
                id="pre-hb"
                type="number"
                step="0.1"
                placeholder="e.g. 8.5"
                value={preTransfusionHb}
                onChange={(e) => setPreTransfusionHb(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Obstetric Status</Label>
              <Select value={obstetricStatus} onValueChange={(v) => setObstetricStatus(v as ObstetricStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NA">N/A</SelectItem>
                  <SelectItem value="GRAVID">Gravid</SelectItem>
                  <SelectItem value="PARA">Para</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {obstetricStatus === 'GRAVID' && (
              <div className="space-y-2">
                <Label htmlFor="gravida">Gravida</Label>
                <Input id="gravida" type="number" value={gravida} onChange={(e) => setGravida(e.target.value)} />
              </div>
            )}
            {obstetricStatus === 'PARA' && (
              <div className="space-y-2">
                <Label htmlFor="para">Para</Label>
                <Input id="para" type="number" value={para} onChange={(e) => setPara(e.target.value)} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Switch checked={previousTransfusion} onCheckedChange={setPreviousTransfusion} />
                <Label>Previous Transfusion</Label>
              </div>
              {previousTransfusion && (
                <Textarea
                  placeholder="Details of previous transfusions..."
                  value={previousTransfusionComment}
                  onChange={(e) => setPreviousTransfusionComment(e.target.value)}
                />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Switch checked={previousReactions} onCheckedChange={setPreviousReactions} />
                <Label>Previous Reactions</Label>
              </div>
              {previousReactions && (
                <Textarea
                  placeholder="Details of previous reactions..."
                  value={previousReactionsComment}
                  onChange={(e) => setPreviousReactionsComment(e.target.value)}
                />
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="medications">Current Medications</Label>
            <Textarea
              id="medications"
              placeholder="List current medications at time of transfusion..."
              value={currentMedications}
              onChange={(e) => setCurrentMedications(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Reaction Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Type of Reaction</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* General Reactions */}
          <div>
            <h4 className="text-sm font-medium mb-3">General</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {GENERAL_REACTION_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    generalReactions.includes(opt.value)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <Checkbox
                    checked={generalReactions.includes(opt.value)}
                    onCheckedChange={() => toggleReaction(generalReactions, setGeneralReactions, opt.value)}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Dermatological Reactions */}
          <div>
            <h4 className="text-sm font-medium mb-3">Dermatological</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DERMATOLOGICAL_REACTION_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    dermatologicalReactions.includes(opt.value)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <Checkbox
                    checked={dermatologicalReactions.includes(opt.value)}
                    onCheckedChange={() => toggleReaction(dermatologicalReactions, setDermatologicalReactions, opt.value)}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Cardiac/Respiratory Reactions */}
          <div>
            <h4 className="text-sm font-medium mb-3">Cardiac / Respiratory</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CARDIAC_RESPIRATORY_REACTION_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    cardiacRespiratoryReactions.includes(opt.value)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <Checkbox
                    checked={cardiacRespiratoryReactions.includes(opt.value)}
                    onCheckedChange={() => toggleReaction(cardiacRespiratoryReactions, setCardiacRespiratoryReactions, opt.value)}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Renal Reactions */}
          <div>
            <h4 className="text-sm font-medium mb-3">Renal</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {RENAL_REACTION_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    renalReactions.includes(opt.value)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <Checkbox
                    checked={renalReactions.includes(opt.value)}
                    onCheckedChange={() => toggleReaction(renalReactions, setRenalReactions, opt.value)}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Haematological Reactions */}
          <div>
            <h4 className="text-sm font-medium mb-3">Haematological</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {HAEMATOLOGICAL_REACTION_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    haematologicalReactions.includes(opt.value)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <Checkbox
                    checked={haematologicalReactions.includes(opt.value)}
                    onCheckedChange={() => toggleReaction(haematologicalReactions, setHaematologicalReactions, opt.value)}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Other Reactions */}
          <div className="space-y-2">
            <Label htmlFor="other-reactions">Others (Specify)</Label>
            <Textarea
              id="other-reactions"
              placeholder="Describe any other reactions not listed above..."
              value={otherReactions}
              onChange={(e) => setOtherReactions(e.target.value)}
            />
          </div>

          {!hasAnyReaction && (
            <p className="text-sm text-destructive">At least one reaction must be selected.</p>
          )}
        </CardContent>
      </Card>

      {/* Section 6: Reporter Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Reporter Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reporter-cadre">Cadre / Designation</Label>
              <Input
                id="reporter-cadre"
                placeholder="e.g. Clinical Officer"
                value={reporterCadre}
                onChange={(e) => setReporterCadre(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reporter-mobile">Mobile Number</Label>
              <Input
                id="reporter-mobile"
                placeholder="e.g. 0712345678"
                value={reporterMobile}
                onChange={(e) => setReporterMobile(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reporter-email">Email</Label>
              <Input
                id="reporter-email"
                type="email"
                placeholder="e.g. reporter@hospital.co.ke"
                value={reporterEmail}
                onChange={(e) => setReporterEmail(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit ATR Report
        </Button>
      </div>
    </div>
  );
}
