/**
 * Transactions → Bills
 * Placeholder page (implementation pending)
 */
'use client';

import React from 'react';
import { Construction, Receipt } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function TransactionsBillsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bills</h1>
        <p className="text-muted-foreground">Supplier bills and payables</p>
      </div>

      <Card className="border-dashed border-2 border-muted-foreground/25">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Construction className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">Coming Soon</h2>
          <p className="text-muted-foreground max-w-md">
            Bill capture, supplier management, and payment scheduling will be implemented in a future phase.
          </p>
          <Badge variant="secondary" className="mt-4">
            <Receipt className="h-3 w-3 mr-1" />
            Placeholder (Bills)
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
