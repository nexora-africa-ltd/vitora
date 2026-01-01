import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '@/components/layout/header';

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn(() => ({
    theme: 'light',
    setTheme: jest.fn(),
  })),
}));

// Mock auth context
jest.mock('@/lib/auth/context', () => ({
  useAuth: jest.fn(() => ({
    user: { username: 'testuser', first_name: 'Test', last_name: 'User' },
  })),
}));

// Mock auth hooks
jest.mock('@/lib/auth/hooks', () => ({
  useLogout: jest.fn(() => jest.fn()),
}));

describe('Header', () => {
  const defaultProps = {
    onMenuClick: jest.fn(),
    sidebarCollapsed: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render mobile menu button', () => {
    render(<Header {...defaultProps} />);
    const menuButton = screen.getByRole('button', { name: /toggle menu/i });
    expect(menuButton).toBeInTheDocument();
  });

  it('should call onMenuClick when menu button clicked', () => {
    render(<Header {...defaultProps} />);
    const menuButton = screen.getByRole('button', { name: /toggle menu/i });
    fireEvent.click(menuButton);
    expect(defaultProps.onMenuClick).toHaveBeenCalled();
  });

  it('should render search input on desktop', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByPlaceholderText(/search patients/i)).toBeInTheDocument();
  });

  it('should render notification bell with badge', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
  });

  it('should render theme toggle button', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument();
  });

  it('should render user avatar with initials', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText('TU')).toBeInTheDocument(); // Test User initials
  });
});
