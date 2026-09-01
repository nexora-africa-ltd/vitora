'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
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
import { inventoryApi } from '@/lib/api/inventory';

const sections = [
  {
    title: 'Suppliers',
    description: 'Manage vendors and supplier relationships',
    href: '/inventory/suppliers',
    icon: Building2,
    moduleKey: 'inventory' as const,
  },
  {
    title: 'Purchase Orders',
    description: 'Create and track procurement orders',
    href: '/inventory/purchase-orders',
    icon: FileText,
    moduleKey: 'inventory' as const,
  },
  {
    title: 'Goods Receipt',
    description: 'Record incoming deliveries',
    href: '/inventory/goods-receipt',
    icon: ClipboardList,
    moduleKey: 'inventory' as const,
  },
  {
    title: 'Store Locations',
    description: 'Manage stores, pharmacies, and wards',
    href: '/inventory/store-locations',
    icon: Hospital,
    moduleKey: 'inventory' as const,
  },
  {
    title: 'Transfers',
    description: 'Inter-store stock transfers',
    href: '/inventory/transfers',
    icon: ArrowLeftRight,
    moduleKey: 'inventory' as const,
  },
  {
    title: 'Ward Stock',
    description: 'Ward-level stock and consumption',
    href: '/inventory/ward-stock',
    icon: BedDouble,
    moduleKey: 'inventory' as const,
  },
  {
    title: 'Stock Counts',
    description: 'Physical stock counts and adjustments',
    href: '/inventory/stock-counts',
    icon: ListOrdered,
    moduleKey: 'inventory' as const,
  },
  {
    title: 'eTIMS',
    description: 'KRA eTIMS electronic invoicing',
    href: '/inventory/etims',
    icon: Receipt,
    moduleKey: 'billing' as const,
  },
  {
    title: 'Forecasting',
    description: 'Demand forecasts and reorder suggestions',
    href: '/inventory/forecasting',
    icon: BarChart3,
    moduleKey: 'pharmacy' as const,
  },
];

export default function InventoryOverviewPage() {
  const router = useRouter();
  const { data: bootstrap } = useQuery({
    queryKey: ['inventory-bootstrap'],
    queryFn: inventoryApi.getBootstrap,
  });

  const visibleSections = sections.filter(
    (section) => bootstrap?.modules?.[section.moduleKey] ?? true
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Inventory"
        helpContent="Manage your facility's inventory — procurement, stock, transfers, and reporting."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleSections.map((section) => {
          const Icon = section.icon;
          return (
            <Card
              key={section.href}
              className="relative cursor-pointer overflow-hidden transition-colors hover:border-primary/50"
              onClick={() => router.push(section.href)}
            >
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                aria-hidden="true"
              />
              <CardContent className="relative flex items-start gap-3 p-4 sm:p-5">
                <div className="shrink-0 rounded-lg bg-primary/10 p-2">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{section.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{section.description}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
