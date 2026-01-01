/**
 * TDD Tests for OfflineBanner Component
 * Tests offline/online state display
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { OfflineBanner } from '@/components/shared/offline-banner';

// Mock the useNetworkStatus hook
const mockNetworkStatus = { isOnline: true, wasOffline: false };
jest.mock('@/lib/hooks/use-network-status', () => ({
  useNetworkStatus: () => mockNetworkStatus,
}));

describe('OfflineBanner', () => {
  beforeEach(() => {
    mockNetworkStatus.isOnline = true;
    mockNetworkStatus.wasOffline = false;
  });

  it('should not render when online and never was offline', () => {
    mockNetworkStatus.isOnline = true;
    mockNetworkStatus.wasOffline = false;

    const { container } = render(<OfflineBanner />);

    expect(container.firstChild).toBeNull();
  });

  it('should show offline message when offline', () => {
    mockNetworkStatus.isOnline = false;
    mockNetworkStatus.wasOffline = false;

    render(<OfflineBanner />);

    expect(screen.getByText(/You're offline/)).toBeInTheDocument();
  });

  it('should show back online message after being offline', () => {
    mockNetworkStatus.isOnline = true;
    mockNetworkStatus.wasOffline = true;

    render(<OfflineBanner />);

    expect(screen.getByText('Back online')).toBeInTheDocument();
  });

  it('should have warning styling when offline', () => {
    mockNetworkStatus.isOnline = false;
    mockNetworkStatus.wasOffline = false;

    render(<OfflineBanner />);

    const banner = screen.getByText(/You're offline/).closest('div');
    expect(banner).toHaveClass('bg-amber-500');
  });

  it('should have success styling when back online', () => {
    mockNetworkStatus.isOnline = true;
    mockNetworkStatus.wasOffline = true;

    render(<OfflineBanner />);

    const banner = screen.getByText('Back online').closest('div');
    expect(banner).toHaveClass('bg-green-500');
  });
});
