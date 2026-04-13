import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Triage Queue — Vitora HMIS',
  description: 'Patient-facing triage queue display',
};

export default function TriageDisplayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {children}
    </div>
  );
}
