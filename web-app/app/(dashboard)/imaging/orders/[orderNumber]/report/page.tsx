/**
 * Radiology Report Page Route
 *
 * Path: /imaging/orders/[orderNumber]/report
 */
import { RadiologyReportPage } from '@/components/imaging/radiology-report-page';

interface PageProps {
  params: Promise<{ orderNumber: string }>;
}

export default async function Page({ params }: PageProps) {
  const { orderNumber } = await params;
  return <RadiologyReportPage orderNumber={orderNumber} />;
}

export async function generateMetadata({ params }: PageProps) {
  const { orderNumber } = await params;
  return {
    title: `Radiology Report - ${orderNumber}`,
  };
}
