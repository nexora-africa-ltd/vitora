import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type AppTheme } from '@/constants/theme';

type ThemeMode = 'system' | 'light' | 'dark';

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedMode: 'light' | 'dark';
  theme: AppTheme;
  isDarkMode: boolean;
  toggleTheme: () => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
  isHydrating: boolean;
};

const STORAGE_KEY = 'vitora.mobile.theme-mode';

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  resolvedMode: 'light',
  theme: lightTheme,
  isDarkMode: false,
  toggleTheme: async () => undefined,
  setMode: async () => undefined,
  isHydrating: true,
});

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    let active = true;

    async function hydrateTheme() {
      try {
        const storedMode = await AsyncStorage.getItem(STORAGE_KEY);
        if (active && (storedMode === 'system' || storedMode === 'light' || storedMode === 'dark')) {
          setModeState(storedMode);
        }
      } finally {
        if (active) {
          setIsHydrating(false);
        }
      }
    }

    void hydrateTheme();

    return () => {
      active = false;
    };
  }, []);

  async function setMode(nextMode: ThemeMode) {
    setModeState(nextMode);
    await AsyncStorage.setItem(STORAGE_KEY, nextMode);
  }

  async function toggleTheme() {
    if (mode === 'system') {
      await setMode(systemColorScheme === 'dark' ? 'light' : 'dark');
      return;
    }

    await setMode(mode === 'dark' ? 'light' : 'dark');
  }

  const resolvedMode = mode === 'system' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : mode;

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    resolvedMode,
    theme: resolvedMode === 'dark' ? darkTheme : lightTheme,
    isDarkMode: resolvedMode === 'dark',
    toggleTheme,
    setMode,
    isHydrating,
  }), [isHydrating, mode, resolvedMode, systemColorScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  return useContext(ThemeContext);
}