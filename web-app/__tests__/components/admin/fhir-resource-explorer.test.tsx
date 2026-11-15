// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Guards the FHIR resource stat markup against invalid paragraph nesting.
 *
 * Run with:
 *   npm test -- --runInBand __tests__/components/admin/fhir-resource-explorer.test.tsx
 *
 * Inputs:
 *   Mocked FHIR resource count responses.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { FHIRResourceExplorer } from '@/components/admin/fhir-resource-explorer';

jest.mock('@/lib/hooks/use-debounce', () => ({
  useDebounce: (value: string) => value,
}));
jest.mock('@/lib/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

describe('FHIRResourceExplorer', () => {
  it('renders a block count container before each resource label', () => {
    const markup = renderToStaticMarkup(<FHIRResourceExplorer />);

    expect(markup).toContain('<div class="text-lg font-bold">');
    expect(markup).not.toContain('<p class="text-lg font-bold">');
  });
});
