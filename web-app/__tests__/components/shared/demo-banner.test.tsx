import React from 'react';
import { render } from '@testing-library/react';
import { DemoBanner, DemoWatermark } from '@/components/shared/demo-banner';

// Mock constants - default to development (non-demo)
jest.mock('@/lib/utils/constants', () => ({
  APP_ENV: 'development',
}));

describe('DemoBanner', () => {
  it('renders nothing when not in staging/demo mode', () => {
    const { container } = render(<DemoBanner />);
    expect(container.firstChild).toBeNull();
  });
});

describe('DemoWatermark', () => {
  it('renders nothing (disabled for minimal distraction)', () => {
    const { container } = render(<DemoWatermark />);
    expect(container.firstChild).toBeNull();
  });
});
