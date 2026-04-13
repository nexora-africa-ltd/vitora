import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Queue Display — Vitora HMIS',
  description: 'Patient-facing queue display',
};

export default function QueueDisplayLayout({
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
