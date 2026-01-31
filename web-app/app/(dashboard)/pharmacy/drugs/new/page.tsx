/**
 * New Drug Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

'use client';

import { useRouter } from 'next/navigation';
import { Undo2, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DrugForm } from '@/components/pharmacy/drug-form';

export default function NewDrugPage() {
  const router = useRouter();

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
              >
                <Undo2 className="h-4 w-4" />
                <span className="sr-only">Go back</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Go back to previous page</p>
            </TooltipContent>
          </Tooltip>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Add New Drug</h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="sr-only">Help</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p>Add a new drug to the pharmacy catalog. Required fields are marked with an asterisk (*).</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Form */}
        <div className="max-w-4xl">
          <DrugForm />
        </div>
      </div>
    </TooltipProvider>
  );
}
