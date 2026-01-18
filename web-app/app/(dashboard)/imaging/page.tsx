'use client';

import {
  ScanLine,
  Construction,
  ImageIcon,
  Radio,
  Waves,
  Scan,
  FileImage,
  Calendar,
  ClipboardList
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const plannedFeatures = [
  {
    icon: Radio,
    title: 'X-Ray',
    description: 'Digital radiography orders, viewing, and reporting',
    status: 'Planned',
  },
  {
    icon: Waves,
    title: 'Ultrasound',
    description: 'Obstetric, abdominal, and general ultrasound imaging',
    status: 'Planned',
  },
  {
    icon: Scan,
    title: 'CT Scan',
    description: 'Computed tomography orders and DICOM integration',
    status: 'Planned',
  },
  {
    icon: ImageIcon,
    title: 'MRI',
    description: 'Magnetic resonance imaging workflow',
    status: 'Planned',
  },
  {
    icon: FileImage,
    title: 'PACS Integration',
    description: 'Picture Archiving and Communication System',
    status: 'Planned',
  },
  {
    icon: Calendar,
    title: 'Scheduling',
    description: 'Imaging appointment scheduling and queue management',
    status: 'Planned',
  },
  {
    icon: ClipboardList,
    title: 'Reporting',
    description: 'Radiology reports with templates and findings',
    status: 'Planned',
  },
];

export default function ImagingPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Imaging"
        description="Radiology and diagnostic imaging services"
      />

      {/* Coming Soon Banner */}
      <Card className="border-dashed border-2 border-muted-foreground/25">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Construction className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">Coming Soon</h2>
          <p className="text-muted-foreground max-w-md">
            The Imaging module is currently under development. This will provide
            comprehensive radiology workflow management including X-rays, ultrasounds,
            CT scans, and MRI integration.
          </p>
          <Badge variant="secondary" className="mt-4">
            <ScanLine className="h-3 w-3 mr-1" />
            Planned Version 1.2.x Feature
          </Badge>
        </CardContent>
      </Card>

      {/* Planned Features Grid */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Planned Features</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plannedFeatures.map((feature) => (
            <Card key={feature.title} className="opacity-75">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-muted">
                      <feature.icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <CardTitle className="text-base">{feature.title}</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {feature.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{feature.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Integration Note */}
      <Card className="bg-muted/50">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <ScanLine className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm font-medium">DICOM & PACS Ready</p>
              <p className="text-sm text-muted-foreground">
                The imaging module will support DICOM standards and integrate with
                existing PACS systems for seamless image viewing and archiving.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
