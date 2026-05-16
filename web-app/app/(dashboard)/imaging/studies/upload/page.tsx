/**
 * DICOM Upload Page
 * Phase C Sprint C.3: DICOM Viewer
 *
 * Step-by-step wizard for uploading DICOM files to PACS storage.
 * Step 1: Select files → Step 2: Link patient → Step 3: Upload with progress
 */
'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { imagingApi } from '@/lib/api/imaging';
import { patientsApi } from '@/lib/api/patients';
import { Patient } from '@/lib/types/patient';
import { ImagingOrder, PRIORITY_LABELS } from '@/lib/types/imaging';
import { PaginatedResponse } from '@/lib/types';
import {
  Upload,
  X,
  FileImage,
  AlertCircle,
  CheckCircle2,
  Search,
  User,
  ArrowRight,
  ArrowLeft,
  Loader2,
  ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AxiosError } from 'axios';

// File validation
const ACCEPTED_EXTENSIONS = ['.dcm', '.dicom', '.DCM', '.DICOM'];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB per file
const MAX_FILES = 50;

type Step = 1 | 2 | 3;

interface UploadFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Extract a human-readable error message from an Axios or generic error. */
function getUploadErrorMessage(error: Error): string {
  if (error instanceof AxiosError && error.response?.data) {
    const data = error.response.data as Record<string, unknown>;
    if (typeof data.error === 'string') return data.error;
    if (typeof data.detail === 'string') return data.detail;
  }
  return error.message || 'Unknown error';
}

/** Extract per-file error details from the API response. */
function getUploadErrorDetails(error: Error): { file: string; errors: string[] }[] {
  if (error instanceof AxiosError && error.response?.data) {
    const data = error.response.data as Record<string, unknown>;
    if (Array.isArray(data.details) && data.details.length > 0) {
      return data.details as { file: string; errors: string[] }[];
    }
  }
  return [];
}

export default function DICOMUploadPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wizard step
  const [step, setStep] = useState<Step>(1);

  // Form state
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [serverProcessing, setServerProcessing] = useState(false);

  // Patient search — only fires when user is typing on step 2
  const searchEnabled = step === 2 && patientSearch.length >= 2;
  const { data: patientsData, isLoading: searchingPatients } = useQuery<PaginatedResponse<Patient>>({
    queryKey: ['patients', 'search', patientSearch],
    queryFn: () => patientsApi.getPatients({ search: patientSearch, page_size: 10 }),
    enabled: searchEnabled,
    staleTime: 15000,
  });

  // Fetch unfulfilled imaging orders for the selected patient
  const { data: patientOrders } = useQuery<PaginatedResponse<ImagingOrder>>({
    queryKey: ['imaging-orders', 'patient', patientId],
    queryFn: () => imagingApi.listOrders({ patient: patientId!, page_size: 20 }),
    enabled: !!patientId,
    staleTime: 30000,
  });

  // Filter to orders that can receive uploads (not cancelled, not yet completed with study)
  const linkableOrders = (patientOrders?.results ?? []).filter(
    (o) => ['ORDERED', 'SCHEDULED', 'IN_PROGRESS'].includes(o.status)
  );

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (filesToUpload: File[]) => {
      const total = filesToUpload.reduce((sum, f) => sum + f.size, 0);
      setTotalBytes(total);
      setUploadedBytes(0);
      setServerProcessing(false);

      return imagingApi.uploadDICOM(filesToUpload, {
        patientId: patientId || undefined,
        imagingOrderId: selectedOrderId || undefined,
        onUploadProgress: (event) => {
          setUploadedBytes(event.loaded);
          if (event.total > 0) setTotalBytes(event.total);
          // When loaded >= total, browser finished sending bytes.
          // Server is now parsing DICOM files — switch to processing phase.
          if (event.total > 0 && event.loaded >= event.total) {
            setServerProcessing(true);
          }
        },
      });
    },
    onSuccess: (data) => {
      setFiles((prev) =>
        prev.map((f) => ({ ...f, status: 'success' as const }))
      );
      queryClient.invalidateQueries({ queryKey: ['dicom-studies'] });

      if (data.study_instance_uid) {
        setTimeout(() => {
          router.push(`/imaging/studies/${data.study_instance_uid}`);
        }, 2000);
      }
    },
    onError: (error: Error) => {
      setFiles((prev) =>
        prev.map((f) => ({ ...f, status: 'error' as const, error: error.message }))
      );
    },
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const addFiles = useCallback((selectedFiles: File[]) => {
    const newFiles: UploadFile[] = selectedFiles
      .filter((file) => {
        const ext = '.' + file.name.split('.').pop();
        return ACCEPTED_EXTENSIONS.includes(ext) && file.size <= MAX_FILE_SIZE;
      })
      .slice(0, MAX_FILES - files.length)
      .map((file) => ({
        file,
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        status: 'pending' as const,
      }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, [files.length]);

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    addFiles(selectedFiles);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addFiles]);

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  // Start upload
  const handleUpload = useCallback(() => {
    if (files.length === 0 || !patientId) return;
    setFiles((prev) => prev.map((f) => ({ ...f, status: 'uploading' as const })));
    uploadMutation.mutate(files.map((f) => f.file));
  }, [files, patientId, uploadMutation]);

  // Select patient
  const selectPatient = useCallback((id: number, name: string) => {
    setPatientId(id);
    setPatientSearch(name);
    setShowPatientSearch(false);
  }, []);

  const clearPatient = useCallback(() => {
    setPatientId(null);
    setPatientSearch('');
    setSelectedOrderId(null);
  }, []);

  // Computed
  const totalFileSize = files.reduce((sum, f) => sum + f.file.size, 0);
  const uploadPercent = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title="Upload DICOM Studies"
        helpContent="Upload DICOM files (.dcm) to create imaging studies. Follow the steps: select files, link to a patient, then upload."
      />

      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-0 sm:gap-2">
        {[
          { num: 1, label: 'Select Files', done: files.length > 0 },
          { num: 2, label: 'Link Patient', done: !!patientId },
          { num: 3, label: 'Upload', done: uploadMutation.isSuccess },
        ].map((s, i) => (
          <div key={s.num} className="flex items-center">
            {i > 0 && (
              <div className={cn(
                'w-8 sm:w-12 h-0.5 mx-1',
                s.done || step > s.num ? 'bg-green-500' : step >= s.num ? 'bg-primary' : 'bg-muted-foreground/30'
              )} />
            )}
            <button
              type="button"
              onClick={() => {
                if (s.num < step) setStep(s.num as Step);
              }}
              disabled={s.num > step}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-colors',
                s.done
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : step === s.num
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground',
                s.num < step && 'cursor-pointer hover:opacity-80',
                s.num > step && 'cursor-default'
              )}
            >
              {s.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <span className="h-4 w-4 sm:h-5 sm:w-5 rounded-full border-2 border-current flex items-center justify-center text-[10px] sm:text-xs font-bold shrink-0">
                  {s.num}
                </span>
              )}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          </div>
        ))}
      </div>

      {/* Step 1: Select Files */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Select DICOM Files</CardTitle>
              <HelpPopover content={`Drag and drop .dcm files or click to browse. Maximum ${MAX_FILES} files, ${MAX_FILE_SIZE / 1024 / 1024}MB each.`} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Drop Zone */}
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-8 sm:p-12 text-center cursor-pointer transition-colors',
                'hover:border-primary hover:bg-primary/5',
                files.length === 0 ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'
              )}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Label htmlFor="dicom-file-input" className="sr-only">
                Select DICOM files
              </Label>
              <input
                id="dicom-file-input"
                ref={fileInputRef}
                type="file"
                accept=".dcm,.dicom,.DCM,.DICOM"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                aria-label="Select DICOM files"
              />
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="font-medium text-lg">Drop DICOM files here</p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse • .dcm files up to 100 MB each
              </p>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {files.length} file{files.length !== 1 ? 's' : ''} • {formatFileSize(totalFileSize)}
                  </span>
                  <Button variant="ghost" size="sm" onClick={clearFiles}>
                    Clear all
                  </Button>
                </div>
                <ScrollArea className="h-[200px] border rounded-md p-2">
                  <div className="space-y-1">
                    {files.map((uploadFile) => (
                      <div
                        key={uploadFile.id}
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50"
                      >
                        <FileImage className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm flex-1 truncate">{uploadFile.file.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatFileSize(uploadFile.file.size)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-7 w-7"
                          onClick={() => removeFile(uploadFile.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Next */}
                <div className="flex justify-end pt-2">
                  <Button onClick={() => setStep(2)}>
                    Next: Link Patient
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Link Patient */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Link to Patient</CardTitle>
              <HelpPopover content="Associate uploaded studies with a patient record. This is required for the study to appear in the patient's imaging history." />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {files.length} file{files.length !== 1 ? 's' : ''} selected ({formatFileSize(totalFileSize)})
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {patientId ? (
              <div className="flex items-center gap-3 p-4 border rounded-lg bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <User className="h-10 w-10 text-green-600 dark:text-green-400" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{patientSearch}</p>
                  <p className="text-xs text-muted-foreground">Patient linked successfully</p>
                </div>
                <Button variant="ghost" size="icon" onClick={clearPatient}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by patient name or MRN..."
                  value={patientSearch}
                  onChange={(e) => {
                    setPatientSearch(e.target.value);
                    setShowPatientSearch(true);
                  }}
                  onFocus={() => setShowPatientSearch(true)}
                  className="pl-9"
                  autoFocus
                />

                {/* Patient Search Results */}
                {showPatientSearch && patientSearch.length >= 2 && (
                  <Card className="absolute z-10 w-full mt-1 shadow-lg">
                    <ScrollArea className="max-h-[250px]">
                      {searchingPatients ? (
                        <div className="p-4 text-center text-muted-foreground">
                          Searching...
                        </div>
                      ) : patientsData?.results?.length ? (
                        <div className="p-1">
                          {patientsData.results.map((patient) => (
                            <button
                              key={patient.id}
                              type="button"
                              className="w-full text-left p-3 rounded-md hover:bg-muted flex items-center gap-3"
                              onClick={() => selectPatient(
                                patient.id,
                                `${patient.first_name} ${patient.last_name} (${patient.mrn})`
                              )}
                            >
                              <User className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <p className="font-medium">
                                  {patient.first_name} {patient.last_name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {patient.mrn}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 text-center text-muted-foreground">
                          No patients found
                        </div>
                      )}
                    </ScrollArea>
                  </Card>
                )}
              </div>
            )}

            {/* Optional: Link to an existing imaging order */}
            {patientId && linkableOrders.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Link to Imaging Order</span>
                  <span className="text-xs text-muted-foreground">(optional)</span>
                </div>
                <ScrollArea className="max-h-[180px]">
                  <div className="space-y-2">
                    {linkableOrders.map((order) => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => setSelectedOrderId(
                          selectedOrderId === order.id ? null : order.id
                        )}
                        className={cn(
                          'w-full text-left p-3 rounded-md border transition-colors',
                          selectedOrderId === order.id
                            ? 'border-primary bg-primary/5'
                            : 'border-muted hover:bg-muted/50'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {order.order_number}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {order.items.map((i) => i.procedure_name).join(', ') || order.clinical_indication}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {PRIORITY_LABELS[order.priority]}
                            </Badge>
                            {selectedOrderId === order.id && (
                              <CheckCircle2 className="h-4 w-4 text-primary" />
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={() => setStep(3)} disabled={!patientId}>
                Next: Upload
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Upload */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload to PACS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            <div className="flex flex-col gap-2 p-4 rounded-lg bg-muted/50 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Files</span>
                <span className="font-medium">{files.length} file{files.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total size</span>
                <span className="font-medium">{formatFileSize(totalFileSize)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Patient</span>
                <span className="font-medium truncate ml-4">{patientSearch}</span>
              </div>
              {selectedOrderId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Linked Order</span>
                  <span className="font-medium">
                    {linkableOrders.find((o) => o.id === selectedOrderId)?.order_number ?? '—'}
                  </span>
                </div>
              )}
            </div>

            {/* Upload Progress */}
            {uploadMutation.isPending && !serverProcessing && (
              <div className="space-y-3 py-2">
                <Progress value={uploadPercent} className="h-3" />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {formatFileSize(uploadedBytes)} / {formatFileSize(totalBytes)}
                  </span>
                  <span className="font-medium text-primary">{uploadPercent}%</span>
                </div>
              </div>
            )}

            {/* Server Processing Phase */}
            {uploadMutation.isPending && serverProcessing && (
              <div className="space-y-3 py-2">
                <Progress value={100} className="h-3" />
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing DICOM files on server… This may take a moment.</span>
                </div>
              </div>
            )}

            {/* Success */}
            {uploadMutation.isSuccess && (
              <Alert className="border-green-600 bg-green-600/10">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700 dark:text-green-400">
                  Successfully uploaded {uploadMutation.data.instances_created} DICOM instance(s).
                  {uploadMutation.data.study_instance_uid && ' Redirecting to study...'}
                </AlertDescription>
              </Alert>
            )}

            {/* Error */}
            {uploadMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="space-y-2">
                  <p>{getUploadErrorMessage(uploadMutation.error)}</p>
                  {getUploadErrorDetails(uploadMutation.error).map((detail, i) => (
                    <p key={i} className="text-xs">
                      <span className="font-medium">{detail.file}:</span>{' '}
                      {detail.errors.join('; ')}
                    </p>
                  ))}
                </AlertDescription>
              </Alert>
            )}

            {/* Actions */}
            <div className="flex justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => setStep(2)}
                disabled={uploadMutation.isPending}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              {!uploadMutation.isSuccess && (
                <Button
                  onClick={handleUpload}
                  disabled={uploadMutation.isPending}
                  size="lg"
                >
                  {uploadMutation.isPending ? (
                    serverProcessing ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
                    ) : (
                      `Uploading… ${uploadPercent}%`
                    )
                  ) : uploadMutation.isError ? (
                    <>Retry Upload</>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload {files.length} File{files.length !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              )}
              {uploadMutation.isSuccess && (
                <Button onClick={() => router.push('/imaging/studies')}>
                  View Studies
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
