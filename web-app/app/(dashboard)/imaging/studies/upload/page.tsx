/**
 * DICOM Upload Page
 * Phase C Sprint C.3: DICOM Viewer
 *
 * Upload DICOM files to the PACS storage.
 */
'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { imagingApi } from '@/lib/api/imaging';
import { usePatients } from '@/lib/hooks/use-patients';
import {
  Upload,
  X,
  FileImage,
  AlertCircle,
  CheckCircle2,
  Search,
  User,
  Circle,
  ArrowRight,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

// File validation
const ACCEPTED_EXTENSIONS = ['.dcm', '.dicom', '.DCM', '.DICOM'];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB per file
const MAX_FILES = 50;

interface UploadFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export default function DICOMUploadPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientSearch, setShowPatientSearch] = useState(false);

  // Patient search
  const { data: patientsData, isLoading: searchingPatients } = usePatients({
    search: patientSearch.length >= 2 ? patientSearch : undefined,
    page_size: 10,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (filesToUpload: File[]) => {
      return imagingApi.uploadDICOM(filesToUpload, {
        patientId: patientId || undefined,
      });
    },
    onSuccess: (data) => {
      // Mark all files as success
      setFiles((prev) =>
        prev.map((f) => ({
          ...f,
          status: 'success' as const,
        }))
      );

      // Invalidate studies cache
      queryClient.invalidateQueries({ queryKey: ['dicom-studies'] });

      // Navigate to the study if created
      if (data.study_instance_uid) {
        setTimeout(() => {
          router.push(`/imaging/studies/${data.study_instance_uid}`);
        }, 1500);
      }
    },
    onError: (error: Error) => {
      setFiles((prev) =>
        prev.map((f) => ({
          ...f,
          status: 'error' as const,
          error: error.message,
        }))
      );
    },
  });

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    
    const newFiles: UploadFile[] = selectedFiles
      .filter((file) => {
        // Check extension
        const ext = '.' + file.name.split('.').pop();
        if (!ACCEPTED_EXTENSIONS.includes(ext)) {
          return false;
        }
        // Check size
        if (file.size > MAX_FILE_SIZE) {
          return false;
        }
        return true;
      })
      .slice(0, MAX_FILES - files.length)
      .map((file) => ({
        file,
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        status: 'pending' as const,
      }));

    setFiles((prev) => [...prev, ...newFiles]);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [files.length]);

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    
    const newFiles: UploadFile[] = droppedFiles
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

  // Remove a file
  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Clear all files
  const clearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  // Start upload
  const handleUpload = useCallback(() => {
    if (files.length === 0) return;
    
    // Mark files as uploading
    setFiles((prev) =>
      prev.map((f) => ({
        ...f,
        status: 'uploading' as const,
      }))
    );

    // Upload all files
    uploadMutation.mutate(files.map((f) => f.file));
  }, [files, uploadMutation]);

  // Select patient
  const selectPatient = useCallback((id: number, name: string) => {
    setPatientId(id);
    setPatientSearch(name);
    setShowPatientSearch(false);
  }, []);

  const clearPatient = useCallback(() => {
    setPatientId(null);
    setPatientSearch('');
  }, []);

  // Calculate upload progress
  const uploadProgress = uploadMutation.isPending ? 50 : 
    files.every((f) => f.status === 'success') ? 100 : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Upload DICOM Studies"
        helpContent="Upload DICOM files (.dcm) to create imaging studies. You can drag and drop files or click to select. Link files to a patient record."
      />

      {/* Upload Success */}
      {uploadMutation.isSuccess && (
        <Alert className="border-green-600 bg-green-600/10">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700 dark:text-green-400">
            Successfully uploaded {uploadMutation.data.instances_created} DICOM instance(s).
            {uploadMutation.data.study_instance_uid && ' Redirecting to study...'}
          </AlertDescription>
        </Alert>
      )}

      {/* Upload Error */}
      {uploadMutation.isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Upload failed: {uploadMutation.error?.message || 'Unknown error'}
          </AlertDescription>
        </Alert>
      )}

      {/* Step Indicator - Upload Workflow */}
      <Card className="border-dashed">
        <CardContent className="py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center sm:gap-2">
            {/* Step 1: Select Files */}
            <div className={cn(
              'flex items-center gap-2 p-2 rounded-lg transition-colors',
              files.length > 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-primary/10 text-primary'
            )}>
              {files.length > 0 ? (
                <CheckCircle2 className="h-5 w-5 shrink-0" />
              ) : (
                <span className="h-5 w-5 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold shrink-0">1</span>
              )}
              <span className="text-sm font-medium">Select DICOM files</span>
            </div>

            <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block shrink-0" />

            {/* Step 2: Link Patient */}
            <div className={cn(
              'flex items-center gap-2 p-2 rounded-lg transition-colors',
              patientId 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                : files.length > 0 
                  ? 'bg-primary/10 text-primary animate-pulse' 
                  : 'bg-muted text-muted-foreground'
            )}>
              {patientId ? (
                <CheckCircle2 className="h-5 w-5 shrink-0" />
              ) : (
                <span className="h-5 w-5 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold shrink-0">2</span>
              )}
              <span className="text-sm font-medium">Link to patient</span>
              {!patientId && files.length > 0 && (
                <Badge variant="outline" className="ml-1 text-xs bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
                  Required
                </Badge>
              )}
            </div>

            <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block shrink-0" />

            {/* Step 3: Upload */}
            <div className={cn(
              'flex items-center gap-2 p-2 rounded-lg transition-colors',
              uploadMutation.isSuccess 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : files.length > 0 && patientId
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
            )}>
              {uploadMutation.isSuccess ? (
                <CheckCircle2 className="h-5 w-5 shrink-0" />
              ) : (
                <span className="h-5 w-5 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold shrink-0">3</span>
              )}
              <span className="text-sm font-medium">Upload to PACS</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: File Drop Zone */}
        <div className="lg:col-span-2 space-y-4">
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
                  'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                  'hover:border-primary hover:bg-primary/5',
                  files.length === 0 && 'border-primary bg-primary/5',
                  uploadMutation.isPending && 'pointer-events-none opacity-50'
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
                  disabled={uploadMutation.isPending}
                  aria-label="Select DICOM files"
                />
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="font-medium">Drop DICOM files here</p>
                <p className="text-sm text-muted-foreground mt-1">
                  or click to browse
                </p>
                {files.length === 0 && (
                  <p className="text-xs text-primary mt-3 font-medium">
                    ↑ Start here - select your DICOM files
                  </p>
                )}
              </div>

              {/* File List */}
              {files.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {files.length} file(s) selected
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearFiles}
                      disabled={uploadMutation.isPending}
                    >
                      Clear all
                    </Button>
                  </div>
                  <ScrollArea className="h-[200px] border rounded-md p-2">
                    <div className="space-y-2">
                      {files.map((uploadFile) => (
                        <div
                          key={uploadFile.id}
                          className={cn(
                            'flex items-center gap-3 p-2 rounded-md',
                            uploadFile.status === 'error' && 'bg-destructive/10',
                            uploadFile.status === 'success' && 'bg-green-50 dark:bg-green-900/20'
                          )}
                        >
                          <FileImage className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {uploadFile.file.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(uploadFile.file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                            {uploadFile.error && (
                              <p className="text-xs text-destructive">{uploadFile.error}</p>
                            )}
                          </div>
                          {uploadFile.status === 'pending' && (
                            <Badge variant="outline">Pending</Badge>
                          )}
                          {uploadFile.status === 'uploading' && (
                            <Badge variant="secondary">Uploading...</Badge>
                          )}
                          {uploadFile.status === 'success' && (
                            <Badge className="bg-green-500">Done</Badge>
                          )}
                          {uploadFile.status === 'error' && (
                            <Badge variant="destructive">Error</Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0 h-8 w-8"
                            onClick={() => removeFile(uploadFile.id)}
                            disabled={uploadMutation.isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Upload Progress */}
              {uploadMutation.isPending && (
                <div className="space-y-2">
                  <Progress value={uploadProgress} />
                  <p className="text-sm text-center text-muted-foreground">
                    Uploading...
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Patient Selection & Upload */}
        <div className="space-y-4">
          {/* Patient Selection */}
          <Card className={cn(
            'transition-all',
            files.length > 0 && !patientId && 'ring-2 ring-primary ring-offset-2'
          )}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Link to Patient</CardTitle>
                <HelpPopover content="Associate uploaded studies with a patient record. This is required for the study to appear in the patient's imaging history." />
              </div>
              {files.length > 0 && !patientId && (
                <Alert className="mt-2 border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-amber-700 dark:text-amber-400 text-sm">
                    Search and select a patient to link these files. This is required before upload.
                  </AlertDescription>
                </Alert>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {patientId ? (
                <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/50">
                  <User className="h-8 w-8 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{patientSearch}</p>
                    <p className="text-xs text-muted-foreground">Patient ID: {patientId}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={clearPatient}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search patients..."
                    value={patientSearch}
                    onChange={(e) => {
                      setPatientSearch(e.target.value);
                      setShowPatientSearch(true);
                    }}
                    onFocus={() => setShowPatientSearch(true)}
                    className="pl-9"
                  />
                  
                  {/* Patient Search Results */}
                  {showPatientSearch && patientSearch.length >= 2 && (
                    <Card className="absolute z-10 w-full mt-1 shadow-lg">
                      <ScrollArea className="max-h-[200px]">
                        {searchingPatients ? (
                          <div className="p-4 text-center text-muted-foreground">
                            Searching...
                          </div>
                        ) : patientsData?.results?.length ? (
                          <div className="p-1">
                            {patientsData.results.map((patient) => (
                              <button
                                key={patient.id}
                                className="w-full text-left p-2 rounded-md hover:bg-muted flex items-center gap-3"
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
            </CardContent>
          </Card>

          {/* Upload Button */}
          <Card>
            <CardContent className="pt-6">
              <Button
                className="w-full"
                size="lg"
                onClick={handleUpload}
                disabled={files.length === 0 || uploadMutation.isPending || !patientId}
              >
                {uploadMutation.isPending ? (
                  'Uploading...'
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload {files.length} File{files.length !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
              {files.length === 0 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Select DICOM files first, then link to a patient
                </p>
              )}
              {!patientId && files.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center mt-2 font-medium">
                  ← Link files to a patient to enable upload
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
