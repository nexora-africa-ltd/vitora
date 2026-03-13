import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FALLBACK_HINT_DELAY_MS, InstallPromptBanner, INSTALL_PROMPT_STORAGE_KEY } from '@/components/shared/install-prompt-banner';

describe('InstallPromptBanner', () => {
  let getItemSpy: jest.SpyInstance;
  let setItemSpy: jest.SpyInstance;
  let originalUserAgent: string;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    window.localStorage.clear();
    getItemSpy = jest.spyOn(Storage.prototype, 'getItem');
    setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    getItemSpy.mockReturnValue(null);
    originalUserAgent = navigator.userAgent;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    });
  });

  async function dispatchInstallPrompt(overrides?: Partial<BeforeInstallPromptEvent>) {
    const event = new Event('beforeinstallprompt') as BeforeInstallPromptEvent;
    event.preventDefault = jest.fn();
    event.prompt = overrides?.prompt ?? jest.fn().mockResolvedValue(undefined);
    event.userChoice = overrides?.userChoice ?? Promise.resolve({ outcome: 'accepted', platform: 'web' });
    await act(async () => {
      window.dispatchEvent(event);
    });
    return event;
  }

  it('shows the install banner the first time the install prompt becomes available', async () => {
    render(<InstallPromptBanner />);

    await dispatchInstallPrompt();

    expect(await screen.findByText(/Install Vitora HMIS/i)).toBeInTheDocument();
    expect(setItemSpy).toHaveBeenCalledWith(INSTALL_PROMPT_STORAGE_KEY, 'seen');
  });

  it('does not show when the banner state already exists in localStorage', async () => {
    getItemSpy.mockReturnValue('dismissed');

    render(<InstallPromptBanner />);
    await dispatchInstallPrompt();

    await waitFor(() => {
      expect(screen.queryByText(/Install Vitora HMIS/i)).not.toBeInTheDocument();
    });
  });

  it('persists dismissal when the user closes the banner', async () => {
    render(<InstallPromptBanner />);
    await dispatchInstallPrompt();

    fireEvent.click(await screen.findByRole('button', { name: /not now/i }));

    expect(setItemSpy).toHaveBeenLastCalledWith(INSTALL_PROMPT_STORAGE_KEY, 'dismissed');
    expect(screen.queryByText(/Install Vitora HMIS/i)).not.toBeInTheDocument();
  });

  it('opens the browser install prompt when install is clicked', async () => {
    const prompt = jest.fn().mockResolvedValue(undefined);

    render(<InstallPromptBanner />);
    await dispatchInstallPrompt({
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    });

    fireEvent.click(await screen.findByRole('button', { name: /install vitora/i }));

    await waitFor(() => {
      expect(prompt).toHaveBeenCalled();
      expect(setItemSpy).toHaveBeenLastCalledWith(INSTALL_PROMPT_STORAGE_KEY, 'installed');
    });
  });

  it('shows a fallback install hint when the browser never fires beforeinstallprompt', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });

    render(<InstallPromptBanner />);

    await act(async () => {
      jest.advanceTimersByTime(FALLBACK_HINT_DELAY_MS + 10);
    });

    expect(await screen.findByText(/tap Share, then choose Add to Home Screen/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /install vitora/i })).not.toBeInTheDocument();
    expect(setItemSpy).toHaveBeenCalledWith(INSTALL_PROMPT_STORAGE_KEY, 'seen');
  });

  it('does not show the fallback hint on Chrome while waiting for beforeinstallprompt', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    });

    render(<InstallPromptBanner />);

    await act(async () => {
      jest.advanceTimersByTime(FALLBACK_HINT_DELAY_MS + 10);
    });

    expect(screen.queryByText(/browser menu to install/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /got it/i })).not.toBeInTheDocument();
  });

  it('shows the install prompt on Chrome without first rendering the fallback hint', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    });

    render(<InstallPromptBanner />);

    await act(async () => {
      jest.advanceTimersByTime(FALLBACK_HINT_DELAY_MS + 10);
    });

    await dispatchInstallPrompt();

    expect(await screen.findByRole('button', { name: /install vitora/i })).toBeInTheDocument();
    expect(screen.queryByText(/browser menu to install/i)).not.toBeInTheDocument();
  });

  it('persists dismissal of the fallback hint', async () => {
    render(<InstallPromptBanner />);

    await act(async () => {
      jest.advanceTimersByTime(FALLBACK_HINT_DELAY_MS + 10);
    });

    fireEvent.click(await screen.findByRole('button', { name: /got it/i }));

    expect(setItemSpy).toHaveBeenLastCalledWith(INSTALL_PROMPT_STORAGE_KEY, 'dismissed');
    expect(screen.queryByText(/browser menu to install/i)).not.toBeInTheDocument();
  });
});

interface BeforeInstallPromptEvent extends Event {
  prompt: jest.Mock<Promise<void>>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}