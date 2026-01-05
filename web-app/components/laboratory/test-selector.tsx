'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, FlaskConical, Check, X } from 'lucide-react';
import { TestCatalog, TestCategory, OrderType } from '@/lib/types/laboratory';
import { useTestCatalog, useTestSearch } from '@/lib/hooks/use-laboratory';
import { useDebounce } from '@/lib/hooks';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

interface TestSelectorProps {
  onSelect: (test: TestCatalog) => void;
  onClose: () => void;
  orderType?: OrderType;
  excludeTestIds?: number[];
}

const CATEGORIES: { value: TestCategory | ''; label: string }[] = [
  { value: '', label: 'All Categories' },
  { value: 'HEMATOLOGY', label: 'Hematology' },
  { value: 'CHEMISTRY', label: 'Chemistry' },
  { value: 'MICROBIOLOGY', label: 'Microbiology' },
  { value: 'PARASITOLOGY', label: 'Parasitology' },
  { value: 'SEROLOGY', label: 'Serology' },
  { value: 'URINALYSIS', label: 'Urinalysis' },
  { value: 'MOLECULAR', label: 'Molecular' },
  { value: 'PATHOLOGY', label: 'Pathology' },
  { value: 'RADIOLOGY', label: 'Radiology' },
  { value: 'OTHER', label: 'Other' },
];

const CATEGORY_COLORS: Record<TestCategory, string> = {
  HEMATOLOGY: 'bg-red-100 text-red-700',
  CHEMISTRY: 'bg-blue-100 text-blue-700',
  MICROBIOLOGY: 'bg-green-100 text-green-700',
  PARASITOLOGY: 'bg-yellow-100 text-yellow-700',
  SEROLOGY: 'bg-purple-100 text-purple-700',
  URINALYSIS: 'bg-orange-100 text-orange-700',
  MOLECULAR: 'bg-pink-100 text-pink-700',
  PATHOLOGY: 'bg-indigo-100 text-indigo-700',
  RADIOLOGY: 'bg-cyan-100 text-cyan-700',
  OTHER: 'bg-gray-100 text-gray-700',
};

export function TestSelector({
  onSelect,
  onClose,
  orderType = 'IN_HOUSE',
  excludeTestIds = [],
}: TestSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<TestCategory | ''>('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Use search if query exists, otherwise use catalog list
  const searchResults = useTestSearch(debouncedSearch);
  const catalogResults = useTestCatalog({
    category: category || undefined,
    available_in_house: orderType === 'IN_HOUSE' ? true : undefined,
    is_active: true,
    page,
    page_size: 20,
  });

  const isSearching = debouncedSearch.length >= 2;
  const isLoading = isSearching ? searchResults.isLoading : catalogResults.isLoading;
  
  const tests = isSearching
    ? (searchResults.data || [])
    : (catalogResults.data?.results || []);

  const filteredTests = tests.filter(
    (test) => !excludeTestIds.includes(test.id)
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            Select Lab Test
          </DialogTitle>
          <DialogDescription>
            Search or browse available laboratory tests
          </DialogDescription>
        </DialogHeader>

        {/* Search and Filter */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tests by name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
              autoFocus
            />
          </div>
          <Select
            value={category}
            onValueChange={(value) => setCategory(value as TestCategory | '')}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Test List */}
        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="p-3 border rounded-lg">
                  <Skeleton className="h-5 w-48 mb-2" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : filteredTests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FlaskConical className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No tests found</p>
              {searchQuery && (
                <Button
                  variant="link"
                  onClick={() => setSearchQuery('')}
                >
                  Clear search
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTests.map((test) => (
                <TestCard
                  key={test.id}
                  test={test}
                  onClick={() => onSelect(test)}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Pagination for catalog view */}
        {!isSearching && catalogResults.data && catalogResults.data.count > 20 && (
          <div className="flex justify-between items-center pt-2 border-t">
            <p className="text-sm text-muted-foreground">
              Showing {filteredTests.length} of {catalogResults.data.count} tests
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!catalogResults.data.next}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Close Button */}
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface TestCardProps {
  test: TestCatalog;
  onClick: () => void;
}

function TestCard({ test, onClick }: TestCardProps) {
  const categoryColor = CATEGORY_COLORS[test.category] || CATEGORY_COLORS.OTHER;
  // Parse cost as number (backend may send as string from DecimalField)
  const cost = typeof test.cost === 'string' ? parseFloat(test.cost) : (test.cost || 0);

  return (
    <div
      className={cn(
        'p-3 border rounded-lg cursor-pointer transition-colors',
        'hover:bg-muted/50 hover:border-primary/50'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium">{test.name}</span>
            <Badge variant="outline" className="text-xs">
              {test.code}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge className={cn('text-xs', categoryColor)}>
              {test.category}
            </Badge>
            <span className="text-muted-foreground">
              {test.specimen_type}
            </span>
            {test.turnaround_hours && (
              <span className="text-muted-foreground">
                ~{test.turnaround_hours}h TAT
              </span>
            )}
          </div>
          {test.short_name && test.short_name !== test.name && (
            <p className="text-xs text-muted-foreground mt-1">
              {test.short_name}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-medium">{formatCurrency(isNaN(cost) ? 0 : cost)}</p>
          {test.sha_claimable && (
            <Badge variant="secondary" className="text-xs mt-1">
              SHA
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
