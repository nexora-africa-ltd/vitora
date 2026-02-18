"use client"
import { useState } from "react";
import { Loader2 } from "lucide-react";

export default function NotFound() {
  const [loading, setLoading] = useState(false);

  const handleHomeClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    setLoading(true);
    setTimeout(() => {
      window.location.href = "/";
    }, 300);
    e.preventDefault();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-6xl font-bold">404</h1>
      <p className="text-xl text-muted-foreground mt-2">
        Not all who wander are lost... But you might be!
      </p>
      <div className="mt-6">
        <a
          href="/"
          onClick={handleHomeClick}
          className="inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium shadow hover:bg-primary/90 transition group min-w-[120px] flex items-center justify-center"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary-foreground" />
          ) : (
            <>
              Take me home
              <span className="ml-2 text-sm text-muted-foreground group-hover:text-primary-foreground transition">
                {/* Optional icon or text */}
              </span>
            </>
          )}
        </a>
      </div>
    </div>
  );
}
