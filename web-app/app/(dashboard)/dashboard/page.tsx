// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Server route wrapper for dashboard.
 * Renders the client implementation from ./page-client.
 * Inputs: none.
 */
import DashboardPageClient from './page-client';

type DashboardActionKey = 'open-triage' | 'new-encounter' | 'register-patient';

type DashboardActionConfig = {
  key: DashboardActionKey;
  label: string;
  href: string;
  variant: 'default' | 'outline';
};

function getGreetingLabel(date: Date) {
  const hour = date.getHours();

  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const now = new Date();
  const readOnly = {
    title: 'Dashboard',
    helpContent:
      'Track clinical workload, bottlenecks, and service pressure across registration, triage, consultations, pharmacy, laboratory, billing, and surveillance.',
    greetingLabel: getGreetingLabel(now),
    currentDateLabel: new Intl.DateTimeFormat('en-KE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now),
  };

  const actions: DashboardActionConfig[] = [
    { key: 'open-triage', label: 'Open Triage', href: '/triage', variant: 'outline' as const },
    {
      key: 'new-encounter',
      label: 'New Encounter',
      href: '/encounters/new',
      variant: 'outline' as const,
    },
    {
      key: 'register-patient',
      label: 'Register Patient',
      href: '/patients/new',
      variant: 'default' as const,
    },
  ];

  return <DashboardPageClient readOnly={readOnly} actions={actions} />;
}
