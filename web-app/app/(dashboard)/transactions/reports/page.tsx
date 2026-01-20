/**
 * Billing Reports Index Page
 * Links to all billing reports
 */
'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import {
  BarChart3,
  Calendar,
  Clock,
  FileBarChart,
  Receipt,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';

const reports = [
  {
    title: 'Revenue Summary',
    description: 'View revenue breakdown by category and payment method',
    href: '/transactions/reports/revenue',
    icon: TrendingUp,
    color: 'text-green-600',
  },
  {
    title: 'Daily Collection',
    description: "Today's payment collections and transactions",
    href: '/transactions',
    icon: Calendar,
    color: 'text-blue-600',
  },
  {
    title: 'Daily Closure',
    description: 'End-of-day billing closure report',
    href: '/transactions/reports/daily-closure',
    icon: Clock,
    color: 'text-purple-600',
  },
  {
    title: 'Outstanding Invoices',
    description: 'View overdue and unpaid invoice balances',
    href: '/transactions/reports/outstanding',
    icon: AlertCircle,
    color: 'text-amber-600',
  },
  {
    title: 'Reconciliation',
    description: 'Review unbilled services and discrepancies',
    href: '/transactions/reconciliation',
    icon: FileBarChart,
    color: 'text-red-600',
  },
  {
    title: 'SHA Claims',
    description: 'View and manage insurance claims status',
    href: '/transactions/claims',
    icon: Receipt,
    color: 'text-teal-600',
  },
];

export default function ReportsIndexPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing Reports</h1>
        <p className="text-muted-foreground">
          Access financial and billing reports
        </p>
      </div>

      {/* Report Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((report) => (
          <Link key={report.href} href={report.href}>
            <Card className="h-full hover:border-primary/50 hover:shadow-md transition-all cursor-pointer">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-muted ${report.color}`}>
                    <report.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">{report.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{report.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
