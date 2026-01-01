'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { LoadingSpinner } from '@/components/shared/loading-spinner';

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <LoadingSpinner size="lg" />
      <p className="mt-4 text-muted-foreground">Loading...</p>
    </main>
  );
}
