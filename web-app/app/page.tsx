import { redirect } from 'next/navigation';

/**
 * Root page - middleware handles auth-based routing.
 * This is a fallback that should rarely execute (middleware redirects first).
 */
export default function Home() {
  // Server-side redirect as fallback (middleware handles this normally)
  redirect('/dashboard');
}
