/**
 * ErrorBoundary Component Tests
 *
 * Tests for the React error boundary component.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';

// Component that throws an error
const ThrowError = ({ shouldThrow = true }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <Text>No error</Text>;
};

// Suppress console.error for error boundary tests
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalError;
});

describe('ErrorBoundary Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Normal Rendering', () => {
    test('should render children when no error', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <Text>Child content</Text>
        </ErrorBoundary>
      );

      expect(getByText('Child content')).toBeTruthy();
    });

    test('should render multiple children when no error', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <Text>First child</Text>
          <Text>Second child</Text>
        </ErrorBoundary>
      );

      expect(getByText('First child')).toBeTruthy();
      expect(getByText('Second child')).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    test('should render default error UI when error is thrown', () => {
      const { getByText, getByTestId } = render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(getByTestId('error-boundary')).toBeTruthy();
      expect(getByText('Something went wrong')).toBeTruthy();
      expect(getByText('Test error message')).toBeTruthy();
    });

    test('should render custom fallback when provided', () => {
      const { getByText } = render(
        <ErrorBoundary fallback={<Text>Custom error UI</Text>}>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(getByText('Custom error UI')).toBeTruthy();
    });

    test('should call onError callback when error is caught', () => {
      const mockOnError = jest.fn();

      render(
        <ErrorBoundary onError={mockOnError}>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(mockOnError).toHaveBeenCalled();
      expect(mockOnError.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(mockOnError.mock.calls[0][0].message).toBe('Test error message');
    });

    test('should show Try Again button', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(getByText('Try Again')).toBeTruthy();
    });

    test('should display generic message when error has no message', () => {
      const ThrowEmptyError = () => {
        throw new Error();
      };

      const { getByText } = render(
        <ErrorBoundary>
          <ThrowEmptyError />
        </ErrorBoundary>
      );

      expect(getByText('An unexpected error occurred')).toBeTruthy();
    });
  });

  describe('Retry Functionality', () => {
    test('should reset error state when Try Again is pressed', () => {
      let shouldThrow = true;
      const TestComponent = () => {
        if (shouldThrow) {
          throw new Error('Test error');
        }
        return <Text>Recovered</Text>;
      };

      const { getByText, rerender } = render(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      // Verify error is shown
      expect(getByText('Something went wrong')).toBeTruthy();

      // Fix the component
      shouldThrow = false;

      // Press retry
      fireEvent.press(getByText('Try Again'));

      // Re-render to show recovered state
      rerender(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(getByText('Recovered')).toBeTruthy();
    });
  });

  describe('Static Methods', () => {
    test('getDerivedStateFromError should return error state', () => {
      const error = new Error('Test');
      const state = ErrorBoundary.getDerivedStateFromError(error);

      expect(state.hasError).toBe(true);
      expect(state.error).toBe(error);
    });
  });
});
