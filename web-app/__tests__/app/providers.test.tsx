/**
 * TDD Tests for Providers component
 */
import { render, screen } from '@testing-library/react';
import { Providers } from '@/app/providers';

// Mock the dependencies
jest.mock('@tanstack/react-query-devtools', () => ({
  ReactQueryDevtools: () => null,
}));

describe('Providers', () => {
  it('should render children', () => {
    render(
      <Providers>
        <div data-testid="child">Test Child</div>
      </Providers>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Test Child')).toBeInTheDocument();
  });

  it('should provide QueryClient context', async () => {
    const { useQueryClient } = await import('@tanstack/react-query');

    const TestQueryConsumer = () => {
      const queryClient = useQueryClient();
      return <div data-testid="has-query-client">{queryClient ? 'yes' : 'no'}</div>;
    };

    render(
      <Providers>
        <TestQueryConsumer />
      </Providers>
    );

    expect(screen.getByTestId('has-query-client')).toHaveTextContent('yes');
  });

  it('should provide Auth context', async () => {
    const { useAuth } = await import('@/lib/auth/context');

    const TestAuthConsumer = () => {
      const auth = useAuth();
      return <div data-testid="has-auth">{auth ? 'yes' : 'no'}</div>;
    };

    render(
      <Providers>
        <TestAuthConsumer />
      </Providers>
    );

    expect(screen.getByTestId('has-auth')).toHaveTextContent('yes');
  });
});
