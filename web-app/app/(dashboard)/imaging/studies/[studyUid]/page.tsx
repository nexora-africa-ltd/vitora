/**
 * DICOM Study Detail & Viewer Page
 * Phase C Sprint C.3: DICOM Viewer
 *
 * View a DICOM study with the full-featured viewer.
 */
'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModalityBadge } from '@/components/imaging';
import { imagingApi } from '@/lib/api/imaging';
import { ImagingModality, MODALITY_LABELS } from '@/lib/types/imaging';
import { formatBytes, formatTime, formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import {
  Download,
  Share2,
  Trash2,
  ExternalLink,
  Image as ImageIcon,
  Layers,
  User,
  Building2,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';

// Dynamic import to avoid SSR issues with Cornerstone.js WASM modules
const DICOMViewer = dynamic(
  () => import('@/components/imaging/dicom/dicom-viewer').then((m) => m.DICOMViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[600px] bg-black rounded-lg">
        <Skeleton className="w-32 h-32 rounded-full" />
      </div>
    ),
  }
);

interface StudyDetailPageProps {
  params: Promise<{ studyUid: string }>;
}

export default function DICOMStudyDetailPage({ params }: StudyDetailPageProps) {
  const router = useRouter();
  const { studyUid } = use(params);

  // Fetch study detail
  const {
    data: study,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['dicom-study', studyUid],
    queryFn: () => imagingApi.getStudy(studyUid),
    staleTime: 60000,
  });

  // Handle delete
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this study? This action cannot be undone.')) {
      return;
    }
    try {
      await imagingApi.deleteStudy(studyUid);
      router.push('/imaging/studies');
    } catch (err) {
      console.error('Failed to delete study:', err);
      alert('Failed to delete study');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (error || !study) {
    return (
      <div className="space-y-4">
        <PageHeader 
          title="Study Not Found" 
          helpContent="The requested DICOM study could not be loaded."
        />
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <p className="text-lg font-medium">Failed to load DICOM study</p>
            <p className="text-muted-foreground mt-2">
              The study may have been deleted or you don't have permission to view it.
            </p>
            <Button
              variant="outline"
              onClick={() => router.push('/imaging/studies')}
              className="mt-6"
            >
              View All Studies
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Header */}
      <PageHeader
        title={study.study_description || 'DICOM Study'}
        helpContent="View and interact with DICOM imaging study. Use the viewer tab to examine images with measurement and annotation tools."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled>
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Download</span>
            </Button>
            <Button variant="outline" size="sm" disabled>
              <Share2 className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Share</span>
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Delete</span>
            </Button>
          </div>
        }
      />

      {/* Study Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="text-sm font-medium truncate flex items-center gap-2">
            {study.patient_name}
            <ModalityBadge modality={study.modality as ImagingModality} />
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {formatDate(study.study_date)}
            {study.number_of_series > 0 && ` • ${study.number_of_series} series`}
            {study.number_of_instances > 0 && ` • ${study.number_of_instances} images`}
          </p>
        </div>
        {study.accession_number && (
          <Badge variant="outline" className="shrink-0 w-fit self-start sm:self-auto">
            {study.accession_number}
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="viewer" className="space-y-4">
        <TabsList>
          <TabsTrigger value="viewer" className="gap-2">
            <ImageIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Viewer</span>
          </TabsTrigger>
          <TabsTrigger value="details" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Details</span>
          </TabsTrigger>
        </TabsList>

        {/* Viewer Tab */}
        <TabsContent value="viewer" className="mt-0">
          <DICOMViewer
            study={study}
            showSeriesPanel={true}
            showToolbar={true}
            enableFullscreen={true}
            height="calc(100vh - 280px)"
            className="min-h-[300px] sm:min-h-[400px]"
          />
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details" className="mt-0">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Patient Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Patient Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="Patient Name" value={study.patient_name} />
                {study.referring_physician_name && (
                  <InfoRow
                    label="Referring Physician"
                    value={study.referring_physician_name}
                  />
                )}
              </CardContent>
            </Card>

            {/* Study Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Study Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="Study Date" value={formatDate(study.study_date)} />
                {study.study_time && (
                  <InfoRow label="Study Time" value={formatTime(study.study_time)} />
                )}
                <InfoRow label="Modality" value={MODALITY_LABELS[study.modality as ImagingModality] || study.modality} />
                {study.study_description && (
                  <InfoRow label="Description" value={study.study_description} />
                )}
                {study.accession_number && (
                  <InfoRow label="Accession Number" value={study.accession_number} />
                )}
              </CardContent>
            </Card>

            {/* Institution */}
            {study.institution_name && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Institution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <InfoRow label="Institution" value={study.institution_name} />
                </CardContent>
              </Card>
            )}

            {/* Storage Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Storage Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="Number of Series" value={String(study.number_of_series)} />
                <InfoRow label="Number of Images" value={String(study.number_of_instances)} />
                <InfoRow
                  label="Total Size"
                  value={study.total_file_size ? formatBytes(study.total_file_size) : '-'}
                />
                <InfoRow
                  label="Study Instance UID"
                  value={study.study_instance_uid}
                  mono
                />
              </CardContent>
            </Card>

            {/* Series List */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Series ({study.series.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {study.series.map((series, idx) => (
                    <div key={series.series_instance_uid} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded bg-black flex items-center justify-center flex-shrink-0">
                          {series.thumbnail_path ? (
                            <img
                              src={imagingApi.getThumbnailUrl(series.thumbnail_path) || ''}
                              alt={`Series ${series.series_number}`}
                              className="w-full h-full object-cover rounded"
                            />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {series.series_description || `Series ${series.series_number || idx + 1}`}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                              {series.modality}
                            </Badge>
                            {series.body_part_examined && (
                              <span>{series.body_part_examined}</span>
                            )}
                            <span>{series.number_of_instances} images</span>
                            {series.total_file_size && (
                              <span>{formatBytes(series.total_file_size)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Linked Order */}
            {study.imaging_order && (
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Linked Imaging Order
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Link
                    href={`/imaging/orders/${study.imaging_order}`}
                    className="text-primary hover:underline"
                  >
                    View Order →
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Helper component for info rows
function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
      <span className="text-sm text-muted-foreground sm:w-40 flex-shrink-0">{label}</span>
      <span className={cn('text-sm break-all', mono && 'font-mono text-xs')}>{value}</span>
    </div>
  );
}
