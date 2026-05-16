/**
 * DICOM Studies List Page
 * Phase C Sprint C.3: DICOM Viewer
 *
 * Browse and search DICOM studies.
 */
'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ModalityBadge } from '@/components/imaging';
import { imagingApi } from '@/lib/api/imaging';
import { DICOMStudy, DICOMStudyListParams, ImagingModality, MODALITY_LABELS } from '@/lib/types/imaging';
import { formatBytes, formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import {
  Search,
  Calendar,
  Image as ImageIcon,
  Eye,
  Upload,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const PAGE_SIZE = 20;

export default function DICOMStudiesPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [modalityFilter, setModalityFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  // Build query params
  const queryParams: DICOMStudyListParams = {
    page,
    page_size: PAGE_SIZE,
    ...(modalityFilter !== 'all' && { modality: modalityFilter }),
  };

  // Fetch studies
  const {
    data: studiesData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['dicom-studies', queryParams],
    queryFn: () => imagingApi.listStudies(queryParams),
    staleTime: 30000,
  });

  // Handle row click to view study
  const handleViewStudy = useCallback(
    (study: DICOMStudy) => {
      router.push(`/imaging/studies/${study.study_instance_uid}`);
    },
    [router]
  );

  // Filter studies by search term (client-side for patient name)
  const filteredStudies = studiesData?.results?.filter((study) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      study.patient_name?.toLowerCase().includes(searchLower) ||
      study.accession_number?.toLowerCase().includes(searchLower) ||
      study.study_description?.toLowerCase().includes(searchLower)
    );
  });

  // Pagination
  const totalPages = studiesData ? Math.ceil(studiesData.count / PAGE_SIZE) : 0;
  const hasNext = !!studiesData?.next;
  const hasPrev = page > 1;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="DICOM Studies"
        helpContent="Browse and view DICOM imaging studies. Search by patient name, accession number, or study description."
        actions={
          <Button size="sm" onClick={() => router.push('/imaging/studies/upload')}>
            <Upload className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Upload</span>
          </Button>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patient, accession, description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={modalityFilter} onValueChange={setModalityFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="All Modalities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modalities</SelectItem>
                {Object.entries(MODALITY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Studies Table */}
      <Card>
        <CardContent className="p-0 sm:p-6">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="p-8 text-center text-destructive">
              <p>Failed to load studies</p>
              <Button variant="outline" onClick={() => refetch()} className="mt-4">
                Try Again
              </Button>
            </div>
          ) : !filteredStudies?.length ? (
            <div className="p-8 text-center text-muted-foreground">
              <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No DICOM studies found</p>
              <p className="text-sm mt-2">
                {searchTerm || modalityFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Upload DICOM images to get started'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Preview</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Study Description</TableHead>
                      <TableHead>Modality</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-center">Series</TableHead>
                      <TableHead className="text-center">Images</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudies.map((study) => (
                      <TableRow
                        key={study.study_instance_uid}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleViewStudy(study)}
                      >
                        <TableCell>
                          <div className="w-12 h-12 rounded bg-black flex items-center justify-center overflow-hidden">
                            {study.thumbnail_path ? (
                              <Image
                                src={imagingApi.getThumbnailUrl(study.thumbnail_path) || ''}
                                alt="Thumbnail"
                                width={48}
                                height={48}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{study.patient_name}</div>
                          {study.accession_number && (
                            <div className="text-xs text-muted-foreground">
                              ACC: {study.accession_number}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[200px] truncate">
                            {study.study_description || '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <ModalityBadge modality={study.modality as ImagingModality} />
                        </TableCell>
                        <TableCell>{formatDate(study.study_date)}</TableCell>
                        <TableCell className="text-center">{study.number_of_series}</TableCell>
                        <TableCell className="text-center">{study.number_of_instances}</TableCell>
                        <TableCell className="text-right">
                          {study.total_file_size ? formatBytes(study.total_file_size) : '-'}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3 p-4">
                {filteredStudies.map((study) => (
                  <Card
                    key={study.study_instance_uid}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleViewStudy(study)}
                  >
                    <CardContent className="p-3">
                      <div className="flex gap-3">
                        {/* Thumbnail */}
                        <div className="w-14 h-14 rounded bg-black flex-shrink-0 flex items-center justify-center overflow-hidden">
                          {study.thumbnail_path ? (
                            <Image
                              src={imagingApi.getThumbnailUrl(study.thumbnail_path) || ''}
                              alt="Thumbnail"
                              width={56}
                              height={56}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium truncate">{study.patient_name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {study.study_description || 'No description'}
                              </p>
                            </div>
                            <ModalityBadge modality={study.modality as ImagingModality} />
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(study.study_date)}
                            </span>
                            <span>{study.number_of_series} series</span>
                            <span>{study.number_of_instances} img</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * PAGE_SIZE + 1} -{' '}
                    {Math.min(page * PAGE_SIZE, studiesData?.count || 0)} of{' '}
                    {studiesData?.count} studies
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => p - 1)}
                      disabled={!hasPrev}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={!hasNext}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
