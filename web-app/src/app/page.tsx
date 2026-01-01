export default function Home() {
  return (
    <div className="container mx-auto py-12">
      <h1 className="text-4xl font-bold mb-4">Welcome to Vitora HMIS</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Hospital Management Information System for Kenya
      </p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <a
          href="/encounters"
          className="p-6 border rounded-lg hover:bg-muted/50 transition-colors"
        >
          <h2 className="text-xl font-semibold mb-2">Encounters</h2>
          <p className="text-muted-foreground">
            View and manage clinical encounters
          </p>
        </a>
        <a
          href="/patients"
          className="p-6 border rounded-lg hover:bg-muted/50 transition-colors"
        >
          <h2 className="text-xl font-semibold mb-2">Patients</h2>
          <p className="text-muted-foreground">
            Patient registration and records
          </p>
        </a>
      </div>
    </div>
  );
}
