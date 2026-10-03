// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Desktop history-back control tests.
 * Run with: npx jest __tests__/components/desktop/desktop-back-button.test.tsx --runInBand.
 * Inputs: sidebar collapsed state and mocked Next router history.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { DesktopBackButton } from '@/components/desktop/desktop-back-button';

const mockBack = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('@/lib/desktop', () => ({ isDesktop: () => true }));

describe('DesktopBackButton', () => {
  beforeEach(() => jest.clearAllMocks());

  it('navigates browser history and follows the expanded sidebar edge', () => {
    render(<DesktopBackButton sidebarCollapsed={false} />);

    fireEvent.click(screen.getByRole('button', { name: /go back/i }));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /go back/i })).toHaveClass('xl:left-[17rem]');
  });

  it('moves beside the collapsed sidebar', () => {
    render(<DesktopBackButton sidebarCollapsed />);

    expect(screen.getByRole('button', { name: /go back/i })).toHaveClass('xl:left-24');
  });
});
