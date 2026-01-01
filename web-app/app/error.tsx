'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-6xl font-bold">Error</h1>
      <p className="text-xl text-muted-foreground mt-2">{error.message}</p>
      <button
        onClick={reset}
        className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md"
      >
        Try again
      </button>
    </div>
  );
}
