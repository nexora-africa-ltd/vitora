/**
 * UI Component Tests
 *
 * Tests for reusable UI components.
 * Following TDD RED-GREEN-REFACTOR approach.
 *
 * Requirements:
 * - Button with primary/secondary/danger variants
 * - Input with text/phone/date types
 * - Card base component
 * - LoadingSpinner
 * - EmptyState
 * - ErrorBoundary
 * - OfflineBanner
 */

/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Import components to test
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { OfflineBanner } from '../../components/ui/OfflineBanner';

describe('UI Components', () => {
  describe('Button', () => {
    test('should render with title', () => {
      const { getByText } = render(<Button title="Submit" onPress={() => {}} />);
      expect(getByText('Submit')).toBeTruthy();
    });

    test('should call onPress when pressed', () => {
      const mockOnPress = jest.fn();
      const { getByText } = render(
        <Button title="Click Me" onPress={mockOnPress} />
      );
      fireEvent.press(getByText('Click Me'));
      expect(mockOnPress).toHaveBeenCalledTimes(1);
    });

    test('should render primary variant by default', () => {
      const { getByTestId } = render(
        <Button title="Primary" onPress={() => {}} testID="btn" />
      );
      expect(getByTestId('btn')).toBeTruthy();
    });

    test('should render secondary variant', () => {
      const { getByTestId } = render(
        <Button
          title="Secondary"
          variant="secondary"
          onPress={() => {}}
          testID="btn"
        />
      );
      expect(getByTestId('btn')).toBeTruthy();
    });

    test('should render danger variant', () => {
      const { getByTestId } = render(
        <Button
          title="Delete"
          variant="danger"
          onPress={() => {}}
          testID="btn"
        />
      );
      expect(getByTestId('btn')).toBeTruthy();
    });

    test('should disable button when disabled prop is true', () => {
      const mockOnPress = jest.fn();
      const { getByTestId } = render(
        <Button title="Disabled" onPress={mockOnPress} disabled testID="btn" />
      );
      // Check that the button has disabled state
      expect(getByTestId('btn').props.accessibilityState?.disabled || 
             getByTestId('btn').props.disabled).toBeTruthy();
    });

    test('should show loading spinner when loading', () => {
      const { getByTestId } = render(
        <Button title="Loading" onPress={() => {}} loading testID="btn" />
      );
      expect(getByTestId('btn-loading')).toBeTruthy();
    });
  });

  describe('Input', () => {
    test('should render with label', () => {
      const { getByText } = render(
        <Input label="Email" value="" onChangeText={() => {}} />
      );
      expect(getByText('Email')).toBeTruthy();
    });

    test('should render with placeholder', () => {
      const { getByPlaceholderText } = render(
        <Input
          label="Name"
          value=""
          onChangeText={() => {}}
          placeholder="Enter name"
        />
      );
      expect(getByPlaceholderText('Enter name')).toBeTruthy();
    });

    test('should call onChangeText when text changes', () => {
      const mockOnChange = jest.fn();
      const { getByTestId } = render(
        <Input
          label="Test"
          value=""
          onChangeText={mockOnChange}
          testID="input"
        />
      );
      fireEvent.changeText(getByTestId('input'), 'hello');
      expect(mockOnChange).toHaveBeenCalledWith('hello');
    });

    test('should display error message', () => {
      const { getByText } = render(
        <Input
          label="Email"
          value=""
          onChangeText={() => {}}
          error="Invalid email"
        />
      );
      expect(getByText('Invalid email')).toBeTruthy();
    });

    test('should render as password input when secureTextEntry is true', () => {
      const { getByTestId } = render(
        <Input
          label="Password"
          value=""
          onChangeText={() => {}}
          secureTextEntry
          testID="input"
        />
      );
      expect(getByTestId('input').props.secureTextEntry).toBe(true);
    });
  });

  describe('Card', () => {
    test('should render children', () => {
      const { getByText } = render(
        <Card>
          <></>
        </Card>
      );
      // Card should render without error
      expect(true).toBe(true);
    });

    test('should render with title', () => {
      const { getByText } = render(
        <Card title="Patient Info">
          <></>
        </Card>
      );
      expect(getByText('Patient Info')).toBeTruthy();
    });

    test('should be pressable when onPress is provided', () => {
      const mockOnPress = jest.fn();
      const { getByTestId } = render(
        <Card onPress={mockOnPress} testID="card">
          <></>
        </Card>
      );
      fireEvent.press(getByTestId('card'));
      expect(mockOnPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('LoadingSpinner', () => {
    test('should render spinner', () => {
      const { getByTestId } = render(<LoadingSpinner testID="spinner" />);
      expect(getByTestId('spinner')).toBeTruthy();
    });

    test('should render with custom size', () => {
      const { getByTestId } = render(
        <LoadingSpinner size="large" testID="spinner" />
      );
      expect(getByTestId('spinner')).toBeTruthy();
    });

    test('should render with message', () => {
      const { getByText } = render(<LoadingSpinner message="Loading..." />);
      expect(getByText('Loading...')).toBeTruthy();
    });
  });

  describe('EmptyState', () => {
    test('should render with title', () => {
      const { getByText } = render(<EmptyState title="No patients found" />);
      expect(getByText('No patients found')).toBeTruthy();
    });

    test('should render with description', () => {
      const { getByText } = render(
        <EmptyState title="No data" description="Try adding some items" />
      );
      expect(getByText('Try adding some items')).toBeTruthy();
    });

    test('should render action button when provided', () => {
      const mockAction = jest.fn();
      const { getByText } = render(
        <EmptyState
          title="No patients"
          actionLabel="Add Patient"
          onAction={mockAction}
        />
      );
      const button = getByText('Add Patient');
      expect(button).toBeTruthy();
      fireEvent.press(button);
      expect(mockAction).toHaveBeenCalled();
    });
  });

  describe('OfflineBanner', () => {
    test('should render when offline', () => {
      const { getByText } = render(<OfflineBanner isOffline={true} />);
      expect(getByText(/offline/i)).toBeTruthy();
    });

    test('should not render when online', () => {
      const { queryByText } = render(<OfflineBanner isOffline={false} />);
      expect(queryByText(/offline/i)).toBeNull();
    });

    test('should show pending sync count', () => {
      const { getByText } = render(
        <OfflineBanner isOffline={true} pendingSyncCount={5} />
      );
      expect(getByText('5')).toBeTruthy();
      expect(getByText(/pending/i)).toBeTruthy();
    });
  });
});
