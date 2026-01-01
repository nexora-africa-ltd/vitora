/**
 * TDD Tests for EmergencyContactsList Component
 * Tests display of emergency contacts for a patient
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { EmergencyContactsList } from '@/components/patients/emergency-contacts-list';
import type { EmergencyContact } from '@/lib/types/patient';

// Mock EmptyState
jest.mock('@/components/shared/empty-state', () => ({
  EmptyState: ({ title, description }: any) => (
    <div data-testid="empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  ),
}));

const mockContact: EmergencyContact = {
  id: 1,
  patient: 1,
  name: 'Jane Doe',
  phone: '0712345678',
  relationship: 'Spouse',
  is_primary: true,
  created_at: '2025-01-01T10:00:00Z',
};

describe('EmergencyContactsList', () => {
  it('should render contact name', () => {
    render(<EmergencyContactsList contacts={[mockContact]} />);

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('should render contact relationship', () => {
    render(<EmergencyContactsList contacts={[mockContact]} />);

    expect(screen.getByText('Spouse')).toBeInTheDocument();
  });

  it('should render phone number as link', () => {
    render(<EmergencyContactsList contacts={[mockContact]} />);

    const phoneLink = screen.getByRole('link');
    expect(phoneLink).toHaveAttribute('href', 'tel:0712345678');
  });

  it('should show Primary badge for primary contact', () => {
    render(<EmergencyContactsList contacts={[mockContact]} />);

    expect(screen.getByText('Primary')).toBeInTheDocument();
  });

  it('should not show Primary badge for non-primary contacts', () => {
    const nonPrimaryContact = { ...mockContact, is_primary: false };
    render(<EmergencyContactsList contacts={[nonPrimaryContact]} />);

    expect(screen.queryByText('Primary')).not.toBeInTheDocument();
  });

  it('should render empty state when no contacts', () => {
    render(<EmergencyContactsList contacts={[]} />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No emergency contacts')).toBeInTheDocument();
  });

  it('should render multiple contacts', () => {
    const secondContact = { ...mockContact, id: 2, name: 'John Smith', relationship: 'Parent', is_primary: false };
    render(<EmergencyContactsList contacts={[mockContact, secondContact]} />);

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('John Smith')).toBeInTheDocument();
  });
});
