/**
 * Tests for ModalityBadge component.
 * Phase B: Frontend Order Management
 */

import { render, screen } from '@testing-library/react';
import { ModalityBadge } from '@/components/imaging/modality-badge';
import { ImagingModality, MODALITY_LABELS } from '@/lib/types/imaging';

describe('ModalityBadge', () => {
  const modalities: ImagingModality[] = [
    'XR',
    'US',
    'CT',
    'MRI',
    'NM',
    'MG',
    'FL',
    'OTHER',
  ];

  it.each(modalities)('renders %s modality correctly', (modality) => {
    render(<ModalityBadge modality={modality} />);
    expect(screen.getByText(MODALITY_LABELS[modality])).toBeInTheDocument();
  });

  it('renders with icon by default', () => {
    const { container } = render(<ModalityBadge modality="XR" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('hides icon when showIcon is false', () => {
    const { container } = render(<ModalityBadge modality="XR" showIcon={false} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <ModalityBadge modality="CT" className="custom-class" />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('renders small size with modality code only', () => {
    render(<ModalityBadge modality="MRI" size="sm" />);
    expect(screen.getByText('MRI')).toBeInTheDocument();
  });

  it('renders medium size with full label', () => {
    render(<ModalityBadge modality="MRI" size="md" />);
    expect(screen.getByText('Magnetic Resonance Imaging')).toBeInTheDocument();
  });

  it('displays X-Ray label', () => {
    render(<ModalityBadge modality="XR" />);
    expect(screen.getByText('X-Ray')).toBeInTheDocument();
  });

  it('displays Ultrasound label', () => {
    render(<ModalityBadge modality="US" />);
    expect(screen.getByText('Ultrasound')).toBeInTheDocument();
  });

  it('displays CT Scan label', () => {
    render(<ModalityBadge modality="CT" />);
    expect(screen.getByText('Computed Tomography')).toBeInTheDocument();
  });

  it('displays Mammography label', () => {
    render(<ModalityBadge modality="MG" />);
    expect(screen.getByText('Mammography')).toBeInTheDocument();
  });
});
