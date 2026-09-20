// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Tests for the browser-only one-time local imaging viewer.
 *
 * Run: npx jest __tests__/components/imaging/local-onetime-viewer.test.tsx --runInBand
 * Inputs: synthetic File objects and mocked browser URL APIs; no API requests.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { LocalOneTimeViewer } from '@/components/imaging/local-onetime-viewer';

jest.mock('@/components/imaging/dicom/use-cornerstone', () => ({
  initCornerstone: jest.fn(),
  useCornerstone: () => ({
    containerRef: { current: null },
    isReady: false,
    isImageLoading: false,
    currentIndex: 0,
    totalImages: 0,
    loadingProgress: 0,
    error: null,
    nextImage: jest.fn(),
    previousImage: jest.fn(),
    goToImage: jest.fn(),
    setActiveTool: jest.fn(),
    resetViewport: jest.fn(),
    invertImage: jest.fn(),
    flipHorizontal: jest.fn(),
    flipVertical: jest.fn(),
    rotate90: jest.fn(),
  }),
}));

describe('LocalOneTimeViewer', () => {
  const createObjectURL = jest.fn(() => 'blob:local-image');
  const revokeObjectURL = jest.fn();

  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  it('renders a browser-only image preview without uploading it', () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const { container } = render(<LocalOneTimeViewer />);
    const file = new File(['image-bytes'], 'preview.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(screen.getByAltText('Local preview')).toHaveAttribute('src', 'blob:local-image');
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('revokes the browser object URL when the user clears the preview', () => {
    const { container } = render(<LocalOneTimeViewer />);
    const file = new File(['image-bytes'], 'preview.jpg', { type: 'image/jpeg' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: 'Clear local viewer' }));

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:local-image');
    expect(screen.queryByAltText('Local preview')).not.toBeInTheDocument();
  });

  it('toggles the local preview into and out of fullscreen mode', () => {
    const { container } = render(<LocalOneTimeViewer />);
    const file = new File(['image-bytes'], 'preview.webp', { type: 'image/webp' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const preview = screen.getByRole('region', { name: 'Local imaging preview' });
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    expect(preview).toHaveClass('fixed', 'inset-0', 'z-50');

    fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' }));
    expect(preview).not.toHaveClass('fixed');
  });
});
