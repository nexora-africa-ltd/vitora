// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Frameless desktop window toolbar tests.
 * Run with: npx jest __tests__/components/desktop/desktop-window-toolbar.test.tsx --runInBand.
 * Inputs: mocked Tauri desktop window controls.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { DesktopWindowToolbar } from '@/components/desktop/desktop-window-toolbar';

const mockMinimize = jest.fn();
const mockMaximize = jest.fn();
const mockClose = jest.fn();

jest.mock('@/lib/desktop', () => ({
  isDesktop: () => true,
  dragDesktopWindow: jest.fn(),
  minimizeDesktopWindow: () => mockMinimize(),
  toggleMaximizeDesktopWindow: () => mockMaximize(),
  closeDesktopWindow: () => mockClose(),
}));

describe('DesktopWindowToolbar', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders and invokes all native window controls', () => {
    render(<DesktopWindowToolbar />);

    fireEvent.click(screen.getByRole('button', { name: /minimize window/i }));
    fireEvent.click(screen.getByRole('button', { name: /maximize window/i }));
    fireEvent.click(screen.getByRole('button', { name: /close window/i }));

    expect(mockMinimize).toHaveBeenCalledTimes(1);
    expect(mockMaximize).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
