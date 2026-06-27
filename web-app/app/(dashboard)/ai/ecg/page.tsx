'use client';

import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Download,
  FileUp,
  Heart,
  ShieldAlert,
  Stethoscope,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/shared/page-header';

import {
  useCHA2DS2VASc,
  useECGCompare,
  useECGInterpret,
  useECGReport,
  useECGUpload,
  useHASBLED,
} from '@/lib/hooks/use-ecg';
import type {
  CHA2DS2VAScResponse,
  ECGCompareResponse,
  ECGInterpretRequest,
  ECGInterpretResponse,
  HASBLEDResponse,
} from '@/lib/types/ecg';

// =============================================================================
// Urgency badge
// =============================================================================

function UrgencyBadge({ urgency }: { urgency: string }) {
  const variants: Record<string, string> = {
    emergent: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
    urgent: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    routine: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
  };
  return (
    <Badge className={`${variants[urgency] || variants.routine} border`}>
      {urgency === 'emergent' && <AlertTriangle className="mr-1 h-3 w-3" />}
      {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
    </Badge>
  );
}

// =============================================================================
// Interpret Tab
// =============================================================================

function InterpretTab() {
  const { mutate, data, isPending, error } = useECGInterpret();
  const reportMutation = useECGReport();
  const [mode, setMode] = useState<'structured' | 'freetext'>('structured');

  // Structured fields
  const [heartRate, setHeartRate] = useState('');
  const [rhythm, setRhythm] = useState('');
  const [axis, setAxis] = useState('');
  const [prInterval, setPrInterval] = useState('');
  const [qrsDuration, setQrsDuration] = useState('');
  const [qtcInterval, setQtcInterval] = useState('');
  const [stSegment, setStSegment] = useState('');
  const [tWave, setTWave] = useState('');
  const [bundleBranch, setBundleBranch] = useState('');
  const [clinicalContext, setClinicalContext] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');

  // Free-text
  const [rawFindings, setRawFindings] = useState('');

  const handleSubmit = () => {
    const payload: ECGInterpretRequest = mode === 'freetext'
      ? { raw_findings: rawFindings, clinical_context: clinicalContext || undefined, age: age ? Number(age) : undefined, sex: (sex as 'male' | 'female') || undefined }
      : {
          heart_rate: heartRate ? Number(heartRate) : undefined,
          rhythm: rhythm || undefined,
          axis: axis || undefined,
          pr_interval: prInterval ? Number(prInterval) : undefined,
          qrs_duration: qrsDuration ? Number(qrsDuration) : undefined,
          qtc_interval: qtcInterval ? Number(qtcInterval) : undefined,
          st_segment: stSegment || undefined,
          t_wave: tWave || undefined,
          bundle_branch: bundleBranch || undefined,
          clinical_context: clinicalContext || undefined,
          age: age ? Number(age) : undefined,
          sex: (sex as 'male' | 'female') || undefined,
        };
    mutate(payload);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Input form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            ECG Input
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={mode === 'structured' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('structured')}
            >
              Structured
            </Button>
            <Button
              variant={mode === 'freetext' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('freetext')}
            >
              Free-text
            </Button>
          </div>

          {mode === 'freetext' ? (
            <div className="space-y-2">
              <Label>Machine-generated ECG report / findings</Label>
              <Textarea
                value={rawFindings}
                onChange={(e) => setRawFindings(e.target.value)}
                placeholder="Paste ECG machine report text here..."
                rows={6}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Heart Rate (bpm)</Label>
                <Input type="number" value={heartRate} onChange={(e) => setHeartRate(e.target.value)} placeholder="e.g. 88" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rhythm</Label>
                <Select value={rhythm} onValueChange={setRhythm}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="irregularly irregular">Irregularly irregular</SelectItem>
                    <SelectItem value="regularly irregular">Regularly irregular</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Axis</Label>
                <Select value={axis} onValueChange={setAxis}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="LAD">Left axis deviation</SelectItem>
                    <SelectItem value="RAD">Right axis deviation</SelectItem>
                    <SelectItem value="extreme">Extreme</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">PR Interval (ms)</Label>
                <Input type="number" value={prInterval} onChange={(e) => setPrInterval(e.target.value)} placeholder="120-200" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">QRS Duration (ms)</Label>
                <Input type="number" value={qrsDuration} onChange={(e) => setQrsDuration(e.target.value)} placeholder="60-120" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">QTc (ms)</Label>
                <Input type="number" value={qtcInterval} onChange={(e) => setQtcInterval(e.target.value)} placeholder="350-450" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ST Segment</Label>
                <Input value={stSegment} onChange={(e) => setStSegment(e.target.value)} placeholder="e.g. elevation_anterior" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">T-Wave</Label>
                <Input value={tWave} onChange={(e) => setTWave(e.target.value)} placeholder="e.g. inverted_lateral" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bundle Branch</Label>
                <Select value={bundleBranch} onValueChange={setBundleBranch}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RBBB">RBBB</SelectItem>
                    <SelectItem value="LBBB">LBBB</SelectItem>
                    <SelectItem value="LAFB">LAFB</SelectItem>
                    <SelectItem value="LPFB">LPFB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Common fields */}
          <div className="space-y-2 border-t pt-3">
            <Label className="text-xs font-medium">Clinical Context</Label>
            <Textarea
              value={clinicalContext}
              onChange={(e) => setClinicalContext(e.target.value)}
              placeholder="Brief history (e.g. 68yo female, chest pain, hypertension)"
              rows={2}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Age</Label>
                <Input type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="Years" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sex</Label>
                <Select value={sex} onValueChange={setSex}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Button onClick={handleSubmit} disabled={isPending} className="w-full">
            {isPending ? 'Interpreting...' : 'Interpret ECG'}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          </CardContent>
        </Card>
      )}

      {data && <InterpretResult result={data} onDownloadPDF={() => {
        reportMutation.mutate({
          interpretation: data,
          facility_name: undefined,
          provider_name: undefined,
        });
      }} />}
    </div>
  );
}

function InterpretResult({ result, onDownloadPDF }: { result: ECGInterpretResponse; onDownloadPDF: () => void }) {
  return (
    <div className="space-y-3">
      {/* Summary card */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">{result.rhythm_diagnosis}</h3>
              <p className="text-sm text-muted-foreground">{result.rate_category} • Confidence: {Math.round(result.confidence * 100)}%</p>
            </div>
            <UrgencyBadge urgency={result.urgency} />
          </div>
          <p className="text-sm">{result.interpretation}</p>
          <p className="text-sm font-medium">{result.clinical_significance}</p>
        </CardContent>
      </Card>

      {/* Actions required */}
      {result.action_required.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recommended Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {result.action_required.map((action, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  {action}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Differentials */}
      {result.differentials.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Differential Diagnoses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {result.differentials.map((d, i) => (
                <div key={i} className="flex items-start justify-between text-sm border-b pb-2 last:border-0">
                  <div>
                    <span className="font-medium">{d.condition}</span>
                    <span className="text-muted-foreground ml-2">({d.icd10})</span>
                    <p className="text-xs text-muted-foreground">{d.supporting_evidence.join(', ')}</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{d.probability}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Findings detail */}
      {result.findings.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Detailed Findings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {result.findings.map((f, i) => (
                <div key={i} className="text-sm border-b pb-2 last:border-0">
                  <div className="flex justify-between">
                    <span className="font-medium capitalize">{f.component}</span>
                    <Badge variant="outline" className={`text-xs ${f.severity === 'critical' ? 'border-red-600 bg-red-50 text-red-700 dark:bg-red-950/30' : f.severity === 'abnormal' ? 'text-red-600' : f.severity === 'borderline' ? 'text-amber-600' : ''}`}>
                      {f.severity}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">{f.interpretation}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Download report */}
      <Button variant="outline" onClick={onDownloadPDF} className="w-full">
        <Download className="mr-2 h-4 w-4" />
        Download PDF Report
      </Button>

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground italic">{result.disclaimer}</p>
    </div>
  );
}

// =============================================================================
// Upload Tab
// =============================================================================

function UploadTab() {
  const { mutate: upload, data: uploadData, isPending: isUploading, error: uploadError } = useECGUpload();
  const { mutate: reinterpret, data: reinterpretData, isPending: isReinterpreting, error: reinterpretError } = useECGInterpret();
  const [file, setFile] = useState<File | null>(null);

  // Patient context (sent with re-interpret)
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [clinicalContext, setClinicalContext] = useState('');
  const [medications, setMedications] = useState('');

  // Editable extracted parameters (populated after upload)
  const [editedParams, setEditedParams] = useState<Record<string, string>>({});
  const [showEditor, setShowEditor] = useState(false);

  // Populate editor when upload completes
  const data = reinterpretData ?? uploadData?.interpretation;
  const extractedParams = uploadData?.extracted_parameters ?? {};

  const handleUploadComplete = () => {
    if (!file) return;
    upload(file, {
      onSuccess: (result) => {
        // Pre-fill editable params from extracted parameters
        const params: Record<string, string> = {};
        const ep = result.extracted_parameters || {};
        if (ep.heart_rate) params.heart_rate = String(ep.heart_rate);
        if (ep.rhythm) params.rhythm = String(ep.rhythm);
        if (ep.axis) params.axis = String(ep.axis);
        if (ep.pr_interval) params.pr_interval = String(ep.pr_interval);
        if (ep.qrs_duration) params.qrs_duration = String(ep.qrs_duration);
        if (ep.qtc_interval) params.qtc_interval = String(ep.qtc_interval);
        if (ep.st_segment) params.st_segment = String(ep.st_segment);
        if (ep.t_wave) params.t_wave = String(ep.t_wave);
        if (ep.bundle_branch) params.bundle_branch = String(ep.bundle_branch);
        setEditedParams(params);
      },
    });
  };

  const handleReinterpret = () => {
    const payload: ECGInterpretRequest = {
      heart_rate: editedParams.heart_rate ? Number(editedParams.heart_rate) : undefined,
      rhythm: editedParams.rhythm || undefined,
      axis: editedParams.axis || undefined,
      pr_interval: editedParams.pr_interval ? Number(editedParams.pr_interval) : undefined,
      qrs_duration: editedParams.qrs_duration ? Number(editedParams.qrs_duration) : undefined,
      qtc_interval: editedParams.qtc_interval ? Number(editedParams.qtc_interval) : undefined,
      st_segment: editedParams.st_segment || undefined,
      t_wave: editedParams.t_wave || undefined,
      bundle_branch: editedParams.bundle_branch || undefined,
      clinical_context: clinicalContext || undefined,
      age: age ? Number(age) : undefined,
      sex: (sex as 'male' | 'female') || undefined,
      medications: medications ? medications.split(',').map((m) => m.trim()).filter(Boolean) : undefined,
    };
    reinterpret(payload);
  };

  const updateParam = (key: string, value: string) => {
    setEditedParams((prev) => ({ ...prev, [key]: value }));
  };

  const error = uploadError || reinterpretError;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Upload form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileUp className="h-4 w-4" />
            Upload ECG
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>ECG File (image or machine format)</Label>
            <Input
              type="file"
              accept=".jpg,.jpeg,.png,.tiff,.tif,.bmp,.dcm,.xml,.scp"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <p className="text-xs text-muted-foreground">
              Supported: JPEG, PNG, TIFF, BMP, DICOM, GE MUSE XML, HL7 aECG, SCP-ECG. Max 10 MB.
            </p>
          </div>

          {/* Patient context (collapsible) */}
          <div className="space-y-2 border-t pt-3">
            <Label className="text-xs font-medium">Patient Context (optional — improves accuracy)</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Age</Label>
                <Input type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="Years" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sex</Label>
                <Select value={sex} onValueChange={setSex}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Clinical Context</Label>
              <Textarea
                value={clinicalContext}
                onChange={(e) => setClinicalContext(e.target.value)}
                placeholder="e.g. 68yo female, chest pain, hypertension, post-PCI"
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Medications (comma-separated)</Label>
              <Input
                value={medications}
                onChange={(e) => setMedications(e.target.value)}
                placeholder="e.g. Metoprolol, Digoxin, Amiodarone"
              />
            </div>
          </div>

          <Button onClick={handleUploadComplete} disabled={!file || isUploading} className="w-full">
            {isUploading ? 'Processing...' : 'Upload & Interpret'}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          </CardContent>
        </Card>
      )}

      {/* Upload results with editable parameters */}
      {uploadData && (
        <div className="space-y-3">
          {uploadData.quality_score != null && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex justify-between text-sm">
                  <span>Image Quality</span>
                  <span className="font-medium">{Math.round(uploadData.quality_score * 100)}%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Format: {uploadData.source_format}</p>
                {uploadData.warnings.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {uploadData.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-600">{w}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Editable extracted parameters */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Extracted Parameters</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEditor(!showEditor)}
                  className="text-xs"
                >
                  {showEditor ? 'Hide Editor' : 'Edit & Re-interpret'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Review machine-extracted values. Edit if incorrect and re-interpret for better results.
              </p>
            </CardHeader>
            {showEditor && (
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Heart Rate</Label>
                    <Input type="number" value={editedParams.heart_rate || ''} onChange={(e) => updateParam('heart_rate', e.target.value)} placeholder="bpm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Rhythm</Label>
                    <Input value={editedParams.rhythm || ''} onChange={(e) => updateParam('rhythm', e.target.value)} placeholder="e.g. regular" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Axis</Label>
                    <Input value={editedParams.axis || ''} onChange={(e) => updateParam('axis', e.target.value)} placeholder="e.g. normal" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">PR (ms)</Label>
                    <Input type="number" value={editedParams.pr_interval || ''} onChange={(e) => updateParam('pr_interval', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">QRS (ms)</Label>
                    <Input type="number" value={editedParams.qrs_duration || ''} onChange={(e) => updateParam('qrs_duration', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">QTc (ms)</Label>
                    <Input type="number" value={editedParams.qtc_interval || ''} onChange={(e) => updateParam('qtc_interval', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">ST Segment</Label>
                    <Input value={editedParams.st_segment || ''} onChange={(e) => updateParam('st_segment', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">T-Wave</Label>
                    <Input value={editedParams.t_wave || ''} onChange={(e) => updateParam('t_wave', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Bundle Branch</Label>
                    <Input value={editedParams.bundle_branch || ''} onChange={(e) => updateParam('bundle_branch', e.target.value)} />
                  </div>
                </div>
                <Button onClick={handleReinterpret} disabled={isReinterpreting} className="w-full" variant="secondary">
                  {isReinterpreting ? 'Re-interpreting...' : 'Re-interpret with corrections'}
                </Button>
              </CardContent>
            )}
            {!showEditor && Object.keys(extractedParams).length > 0 && (
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
                  {Object.entries(extractedParams).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</span>
                      <span className="font-medium">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Interpretation result */}
          {data && <InterpretResult result={data} onDownloadPDF={() => {}} />}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Compare Tab
// =============================================================================

function CompareTab() {
  const { mutate, data, isPending, error } = useECGCompare();
  const [baselineHR, setBaselineHR] = useState('');
  const [baselinePR, setBaselinePR] = useState('');
  const [baselineQRS, setBaselineQRS] = useState('');
  const [currentHR, setCurrentHR] = useState('');
  const [currentPR, setCurrentPR] = useState('');
  const [currentQRS, setCurrentQRS] = useState('');
  const [intervalHours, setIntervalHours] = useState('');
  const [context, setContext] = useState('');

  const handleSubmit = () => {
    mutate({
      baseline: {
        heart_rate: baselineHR ? Number(baselineHR) : undefined,
        pr_interval: baselinePR ? Number(baselinePR) : undefined,
        qrs_duration: baselineQRS ? Number(baselineQRS) : undefined,
      },
      current: {
        heart_rate: currentHR ? Number(currentHR) : undefined,
        pr_interval: currentPR ? Number(currentPR) : undefined,
        qrs_duration: currentQRS ? Number(currentQRS) : undefined,
      },
      interval_hours: intervalHours ? Number(intervalHours) : undefined,
      clinical_context: context || undefined,
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Serial Comparison
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Label className="font-medium text-sm">Baseline ECG</Label>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label className="text-xs">HR</Label><Input type="number" value={baselineHR} onChange={(e) => setBaselineHR(e.target.value)} placeholder="bpm" /></div>
              <div className="space-y-1"><Label className="text-xs">PR (ms)</Label><Input type="number" value={baselinePR} onChange={(e) => setBaselinePR(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">QRS (ms)</Label><Input type="number" value={baselineQRS} onChange={(e) => setBaselineQRS(e.target.value)} /></div>
            </div>
          </div>
          <div className="space-y-3">
            <Label className="font-medium text-sm">Current ECG</Label>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label className="text-xs">HR</Label><Input type="number" value={currentHR} onChange={(e) => setCurrentHR(e.target.value)} placeholder="bpm" /></div>
              <div className="space-y-1"><Label className="text-xs">PR (ms)</Label><Input type="number" value={currentPR} onChange={(e) => setCurrentPR(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">QRS (ms)</Label><Input type="number" value={currentQRS} onChange={(e) => setCurrentQRS(e.target.value)} /></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Interval (hours)</Label><Input type="number" value={intervalHours} onChange={(e) => setIntervalHours(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Clinical Context</Label><Textarea value={context} onChange={(e) => setContext(e.target.value)} rows={2} placeholder="e.g. Post cardiac catheterization" /></div>
          <Button onClick={handleSubmit} disabled={isPending} className="w-full">
            {isPending ? 'Comparing...' : 'Compare ECGs'}
          </Button>
        </CardContent>
      </Card>

      {error && <Card className="border-destructive"><CardContent className="pt-4"><p className="text-sm text-destructive">{(error as Error).message}</p></CardContent></Card>}
      {data && <CompareResult result={data} />}
    </div>
  );
}

function CompareResult({ result }: { result: ECGCompareResponse }) {
  const progressionColors: Record<string, string> = {
    improved: 'text-green-600',
    stable: 'text-muted-foreground',
    worsened: 'text-red-600',
    new_findings: 'text-amber-600',
  };
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="pt-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Progression</span>
            <span className={`text-sm font-semibold capitalize ${progressionColors[result.progression] || ''}`}>
              {result.progression.replace('_', ' ')}
            </span>
          </div>
          <p className="text-sm">{result.clinical_significance}</p>
        </CardContent>
      </Card>
      {result.changes.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Changes Detected</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {result.changes.map((c, i) => (
                <div key={i} className="text-sm border-b pb-2 last:border-0">
                  <div className="flex justify-between">
                    <span className="font-medium capitalize">{c.component.replace('_', ' ')}</span>
                    <Badge variant="outline" className={`text-xs ${c.significance === 'critical' ? 'text-red-600' : c.significance === 'notable' ? 'text-amber-600' : ''}`}>
                      {c.significance}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.baseline_value} → {c.current_value}</p>
                  <p className="text-xs">{c.interpretation}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {result.action_required.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Recommended Actions</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1">{result.action_required.map((a, i) => <li key={i} className="text-sm flex gap-2"><span className="text-primary">•</span>{a}</li>)}</ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// Risk Scores Tab
// =============================================================================

function ScoresTab() {
  const cha2Mutation = useCHA2DS2VASc();
  const hasBledMutation = useHASBLED();

  // CHA2DS2-VASc fields
  const [scoreAge, setScoreAge] = useState('');
  const [scoreSex, setScoreSex] = useState<'male' | 'female'>('male');
  const [chf, setChf] = useState(false);
  const [htn, setHtn] = useState(false);
  const [stroke, setStroke] = useState(false);
  const [vascular, setVascular] = useState(false);
  const [diabetes, setDiabetes] = useState(false);

  // HAS-BLED fields
  const [htnUncontrolled, setHtnUncontrolled] = useState(false);
  const [renal, setRenal] = useState(false);
  const [liver, setLiver] = useState(false);
  const [strokeHx, setStrokeHx] = useState(false);
  const [bleeding, setBleeding] = useState(false);
  const [labileInr, setLabileInr] = useState(false);
  const [elderly, setElderly] = useState(false);
  const [drugs, setDrugs] = useState(false);
  const [alcohol, setAlcohol] = useState(false);

  return (
    <div className="max-w-5xl mx-auto grid gap-4 lg:grid-cols-2">
      {/* CHA2DS2-VASc */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Heart className="h-4 w-4" />
            CHA₂DS₂-VASc (Stroke Risk)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Age</Label><Input type="number" value={scoreAge} onChange={(e) => setScoreAge(e.target.value)} placeholder="Years" /></div>
            <div className="space-y-1">
              <Label className="text-xs">Sex</Label>
              <Select value={scoreSex} onValueChange={(v) => setScoreSex(v as 'male' | 'female')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Heart Failure / LVEF ≤40%', state: chf, set: setChf },
              { label: 'Hypertension', state: htn, set: setHtn },
              { label: 'Stroke / TIA / Thromboembolism', state: stroke, set: setStroke },
              { label: 'Vascular Disease', state: vascular, set: setVascular },
              { label: 'Diabetes', state: diabetes, set: setDiabetes },
            ].map(({ label, state, set }) => (
              <label key={label} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={state} onChange={(e) => set(e.target.checked)} className="rounded" />
                {label}
              </label>
            ))}
          </div>
          <Button
            onClick={() => cha2Mutation.mutate({ age: Number(scoreAge), sex: scoreSex, congestive_heart_failure: chf, hypertension: htn, stroke_tia_thromboembolism: stroke, vascular_disease: vascular, diabetes })}
            disabled={!scoreAge || cha2Mutation.isPending}
            className="w-full"
          >
            {cha2Mutation.isPending ? 'Calculating...' : 'Calculate Score'}
          </Button>
          {cha2Mutation.data && <ScoreResult title="CHA₂DS₂-VASc" data={cha2Mutation.data} riskField="annual_stroke_risk_percent" riskLabel="Annual stroke risk" />}
        </CardContent>
      </Card>

      {/* HAS-BLED */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            HAS-BLED (Bleeding Risk)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {[
              { label: 'Hypertension (uncontrolled, SBP >160)', state: htnUncontrolled, set: setHtnUncontrolled },
              { label: 'Renal Disease', state: renal, set: setRenal },
              { label: 'Liver Disease', state: liver, set: setLiver },
              { label: 'Stroke History', state: strokeHx, set: setStrokeHx },
              { label: 'Bleeding History/Predisposition', state: bleeding, set: setBleeding },
              { label: 'Labile INR (TTR <60%)', state: labileInr, set: setLabileInr },
              { label: 'Age >65', state: elderly, set: setElderly },
              { label: 'Drugs (NSAIDs, antiplatelets)', state: drugs, set: setDrugs },
              { label: 'Alcohol (≥8 drinks/week)', state: alcohol, set: setAlcohol },
            ].map(({ label, state, set }) => (
              <label key={label} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={state} onChange={(e) => set(e.target.checked)} className="rounded" />
                {label}
              </label>
            ))}
          </div>
          <Button
            onClick={() => hasBledMutation.mutate({ hypertension_uncontrolled: htnUncontrolled, renal_disease: renal, liver_disease: liver, stroke_history: strokeHx, bleeding_history: bleeding, labile_inr: labileInr, age_over_65: elderly, drugs_predisposing: drugs, alcohol_excess: alcohol })}
            disabled={hasBledMutation.isPending}
            className="w-full"
          >
            {hasBledMutation.isPending ? 'Calculating...' : 'Calculate Score'}
          </Button>
          {hasBledMutation.data && <ScoreResult title="HAS-BLED" data={hasBledMutation.data} riskField="annual_bleed_risk_percent" riskLabel="Annual bleed risk" />}
        </CardContent>
      </Card>
    </div>
  );
}

function ScoreResult({ title, data, riskField, riskLabel }: { title: string; data: CHA2DS2VAScResponse | HASBLEDResponse; riskField: string; riskLabel: string }) {
  const riskColors: Record<string, string> = { low: 'text-green-600', moderate: 'text-amber-600', high: 'text-red-600' };
  const riskValue = (data as unknown as Record<string, number>)[riskField];
  return (
    <div className="mt-3 border-t pt-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="font-medium">{title}: {data.score}/{data.max_score}</span>
        <Badge variant="outline" className={riskColors[data.risk_category] || ''}>
          {data.risk_category}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{riskLabel}: {riskValue}%</p>
      <p className="text-sm">{data.recommendation}</p>
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function ECGInterpreterPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="ECG Interpreter"
        helpContent="AI-powered ECG interpretation, serial comparison, file upload, and clinical risk scoring (CHA₂DS₂-VASc, HAS-BLED). Powered by TibaBot."
      />

      <Tabs defaultValue="interpret" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="interpret" className="gap-1">
            <Stethoscope className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Interpret</span>
          </TabsTrigger>
          <TabsTrigger value="upload" className="gap-1">
            <FileUp className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Upload</span>
          </TabsTrigger>
          <TabsTrigger value="compare" className="gap-1">
            <ArrowRightLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Compare</span>
          </TabsTrigger>
          <TabsTrigger value="scores" className="gap-1">
            <Heart className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Risk Scores</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="interpret" className="mt-4">
          <InterpretTab />
        </TabsContent>
        <TabsContent value="upload" className="mt-4">
          <UploadTab />
        </TabsContent>
        <TabsContent value="compare" className="mt-4">
          <CompareTab />
        </TabsContent>
        <TabsContent value="scores" className="mt-4">
          <ScoresTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
