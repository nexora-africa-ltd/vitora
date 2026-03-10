import React from 'react';
import { render, screen } from '@testing-library/react';
import { AIChatWidget } from '@/components/shared/ai-chat-widget';

const mockCanPerformAction = jest.fn(() => true);
const mockUseAIEnabled = jest.fn(() => true);
const mockUsePathname = jest.fn(() => '/encounters');
const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockUsePathname(),
}));

jest.mock('@/lib/hooks/use-ai', () => ({
  useAIEnabled: () => mockUseAIEnabled(),
  useAIClinicalChat: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAIClinicalAssist: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({
    canPerformAction: mockCanPerformAction,
  }),
}));

jest.mock('@/lib/context/ai-chat-context', () => ({
  useAIChatContext: () => ({
    widgetState: 'minimized',
    toggleWidget: jest.fn(),
    minimizeWidget: jest.fn(),
    availability: 'available',
    unreadCount: 0,
    activeSessionId: null,
    setActiveSessionId: jest.fn(),
    addMessage: jest.fn(),
    updateStreamingMessage: jest.fn(),
    incrementUnread: jest.fn(),
    patientContext: null,
    encounterContext: null,
    contextEnrichment: null,
    setReturnToUrl: jest.fn(),
    pageContext: null,
    triggerPanelAction: jest.fn(),
    verbosity: 'standard',
  }),
}));

jest.mock('@/components/shared/tibabot-status-indicator', () => ({
  TibaBotStatusIndicator: () => <div>TibaBot Status</div>,
  TibaBotStatusStyles: () => null,
}));

jest.mock('@/components/shared/ai-chat-panel', () => ({
  AIChatPanel: () => <div>AI Chat Panel</div>,
}));

describe('AIChatWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanPerformAction.mockReturnValue(true);
    mockUseAIEnabled.mockReturnValue(true);
    mockUsePathname.mockReturnValue('/encounters');
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: jest.fn(() => null), setItem: jest.fn() },
      writable: true,
    });
  });

  it('does not render when ai.use_chat action access is denied', () => {
    mockCanPerformAction.mockReturnValue(false);

    render(<AIChatWidget />);

    expect(screen.queryByLabelText('Open TibaBot')).not.toBeInTheDocument();
  });

  it('renders the widget button when ai.use_chat action access is allowed', () => {
    render(<AIChatWidget />);

    expect(screen.getByLabelText('Open TibaBot')).toBeInTheDocument();
  });
});