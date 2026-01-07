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
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  ),
}));

// Mock format utility
jest.mock('@/lib/utils/format', () => ({
  formatPhoneNumber: (phone: string) => phone,
}));

const mockContact: EmergencyContact = {
  id: 1,
  full_name: 'Jane Doe',
  phone_number: '0712345678',
  relationship: 'Spouse',
  created_at: '2025-01-01T10:00:00Z',
  updated_at: '2025-01-01T10:00:00Z',
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

  it('should render empty state when no contacts', () => {
    render(<EmergencyContactsList contacts={[]} />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No emergency contacts')).toBeInTheDocument();
  });

  it('should render multiple contacts', () => {
    const secondContact: EmergencyContact = { 
      ...mockContact, 
      id: 2, 
      full_name: 'John Smith', 
      relationship: 'Parent',
    };
    render(<EmergencyContactsList contacts={[mockContact, secondContact]} />);

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('John Smith')).toBeInTheDocument();
  });

  it('should render alternative phone if provided', () => {
    const contactWithAlt: EmergencyContact = {
      ...mockContact,
      alternative_phone: '0723456789',
    };
    render(<EmergencyContactsList contacts={[contactWithAlt]} />);

    const phoneLinks = screen.getAllByRole('link');
    expect(phoneLinks).toHaveLength(2);
    expect(phoneLinks[1]).toHaveAttribute('href', 'tel:0723456789');
  });
});
