'use client';

import { useRouter } from 'next/navigation';
import {
  Package,
  Building2,
  FileText,
  ClipboardList,
  Hospital,
  ArrowLeftRight,
  BedDouble,
  ListOrdered,
  Receipt,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';

const sections = [
  {
    title: 'Suppliers',
    description: 'Manage vendors and supplier relationships',
    href: '/inventory/suppliers',
    icon: Building2,
  },
  {
    title: 'Purchase Orders',
    description: 'Create and track procurement orders',
    href: '/inventory/purchase-orders',
    icon: FileText,
  },
  {
    title: 'Goods Receipt',
    description: 'Record incoming deliveries',
    href: '/inventory/goods-receipt',
    icon: ClipboardList,
  },
  {
    title: 'Store Locations',
    description: 'Manage stores, pharmacies, and wards',
    href: '/inventory/store-locations',
    icon: Hospital,
  },
  {
    title: 'Transfers',
    description: 'Inter-store stock transfers',
    href: '/inventory/transfers',
    icon: ArrowLeftRight,
  },
  {
    title: 'Ward Stock',
    description: 'Ward-level stock and consumption',
    href: '/inventory/ward-stock',
    icon: BedDouble,
  },
  {
    title: 'Stock Counts',
    description: 'Physical stock counts and adjustments',
    href: '/inventory/stock-counts',
    icon: ListOrdered,
  },
  {
    title: 'eTIMS',
    description: 'KRA eTIMS electronic invoicing',
    href: '/inventory/etims',
    icon: Receipt,
  },
  {
    title: 'Forecasting',
    description: 'Demand forecasts and reorder suggestions',
    href: '/inventory/forecasting',
    icon: BarChart3,
  },
];

export default function InventoryOverviewPage() {
  const router = useRouter();

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Inventory"
        helpContent="Manage your facility's inventory — procurement, stock, transfers, and reporting."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Card
              key={section.href}
              className="relative overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => router.push(section.href)}
            >
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                aria-hidden="true"
              />
              <CardContent className="relative p-4 sm:p-5 flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">{section.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
