import { redirect } from 'next/navigation';

/**
 * /reports/moh/[type] — redirects to the main MOH reports dashboard.
 * Individual report types are displayed as tabs on the dashboard page,
 * not as separate routes.
 */
export default function MOHReportTypeRedirect() {
  redirect('/reports/moh');
}
