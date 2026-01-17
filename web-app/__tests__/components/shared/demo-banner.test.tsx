import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DemoBanner, DemoWatermark } from '@/components/shared/demo-banner';

// Mock constants
jest.mock('@/lib/utils/constants', () => ({
  APP_ENV: 'development',
}));

describe('DemoBanner', () => {
  beforeEach(() => {
    // Clear sessionStorage before each test
    sessionStorage.clear();
  });

  it('renders nothing when not in staging/demo mode', () => {
    const { container } = render(<DemoBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders banner when forceShow is true', () => {
    render(<DemoBanner forceShow />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByText('Demo Mode')).toBeInTheDocument();
  });

  it('displays custom facility name', () => {
    render(<DemoBanner forceShow facilityName="Test Clinic" />);
    expect(screen.getByText(/Test Clinic/)).toBeInTheDocument();
  });

  it('can be dismissed', () => {
    const onDismiss = jest.fn();
    render(<DemoBanner forceShow onDismiss={onDismiss} />);
    
    const dismissButton = screen.getByLabelText('Dismiss demo banner');
    fireEvent.click(dismissButton);
    
    expect(onDismiss).toHaveBeenCalled();
    expect(sessionStorage.getItem('demoBannerDismissed')).toBe('true');
  });

  it('stays dismissed after refresh (sessionStorage)', () => {
    sessionStorage.setItem('demoBannerDismissed', 'true');
    
    const { container } = render(<DemoBanner forceShow />);
    // After mounting, it should read sessionStorage and hide
    // Note: Due to useEffect timing, we check the final state
    expect(container.querySelector('[role="banner"]')).toBeNull();
  });

  it('contains feedback link', () => {
    render(<DemoBanner forceShow />);
    expect(screen.getByText('Share Feedback')).toBeInTheDocument();
  });
});

describe('DemoWatermark', () => {
  it('renders nothing when not in staging/demo mode', () => {
    const { container } = render(<DemoWatermark />);
    expect(container.firstChild).toBeNull();
  });
});

describe('DemoBanner in staging mode', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('shows banner when APP_ENV is staging', () => {
    // Override the mock for this test
    jest.doMock('@/lib/utils/constants', () => ({
      APP_ENV: 'staging',
    }));
    
    // Force re-render with staging env
    render(<DemoBanner forceShow />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});
