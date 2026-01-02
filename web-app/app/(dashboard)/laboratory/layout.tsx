import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Laboratory | Vitora HMIS',
  description: 'Laboratory management and test results',
};

export default function LaboratoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
