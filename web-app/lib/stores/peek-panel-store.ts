import { create } from 'zustand';

export type PeekPanelType = 'patient' | 'encounter';

export type PeekPanelState = 'open' | 'minimized' | 'closed';

interface PeekTarget {
  type: PeekPanelType;
  id: number;
  title: string;
  subtitle?: string;
}

interface PeekPanelStore {
  state: PeekPanelState;
  target: PeekTarget | null;

  /** Open the peek panel for a patient or encounter */
  open: (target: PeekTarget) => void;
  /** Minimize to floating pill */
  minimize: () => void;
  /** Restore from minimized */
  restore: () => void;
  /** Fully close and clear target */
  close: () => void;
  /** Set state directly (used by FloatingPeekPanel onStateChange) */
  setState: (state: PeekPanelState) => void;
}

export const usePeekPanelStore = create<PeekPanelStore>()((set) => ({
  state: 'closed',
  target: null,

  open: (target) => set({ state: 'open', target }),
  minimize: () => set({ state: 'minimized' }),
  restore: () => set({ state: 'open' }),
  close: () => set({ state: 'closed', target: null }),
  setState: (state) =>
    set((prev) => ({
      state,
      target: state === 'closed' ? null : prev.target,
    })),
}));
