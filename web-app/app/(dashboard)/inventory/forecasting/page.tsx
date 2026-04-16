'use client';

import { useRouter } from 'next/navigation';
import { BarChart3, TrendingUp, ShoppingCart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';

const sections = [
  {
    title: 'Demand Forecasts',
    description: 'AI-predicted demand and reorder points based on consumption history',
    href: '/inventory/forecasting/forecasts',
    icon: TrendingUp,
  },
  {
    title: 'Reorder Suggestions',
    description: 'Automated suggestions for drugs that need restocking',
    href: '/inventory/forecasting/reorder',
    icon: ShoppingCart,
  },
  {
    title: 'Consumption Records',
    description: 'Historical drug consumption aggregates over time periods',
    href: '/inventory/forecasting/consumption',
    icon: BarChart3,
  },
];

export default function ForecastingPage() {
  const router = useRouter();

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Forecasting & Reorder"
        helpContent="Demand forecasting uses historical consumption data to predict future drug needs. Generate forecasts, review reorder suggestions, and convert them to purchase orders."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <Card
            key={s.href}
            className="cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => router.push(s.href)}
          >
            <CardContent className="flex items-start gap-4 p-4 sm:p-6">
              <div className="rounded-lg bg-primary/10 p-2.5">
                <s.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{s.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
