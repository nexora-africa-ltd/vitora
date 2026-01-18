/**
 * Theme Context
 *
 * Provides theme state (dark/light mode) across the app.
 * Persists preference to AsyncStorage.
 *
 * @module lib/theme/context
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../../constants/colors';

const THEME_STORAGE_KEY = 'vitora_theme_mode';

type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Theme-aware color palette
 */
export interface ThemeColors {
  background: {
    primary: string;
    secondary: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  border: string;
  card: string;
  // Include static colors
  primary: typeof colors.primary;
  secondary: typeof colors.secondary;
  semantic: typeof colors.semantic;
  neutral: typeof colors.neutral;
}

interface ThemeContextState {
  /** Current resolved theme (light or dark) */
  isDark: boolean;
  /** Current theme mode setting */
  themeMode: ThemeMode;
  /** Toggle between light and dark */
  toggleTheme: () => void;
  /** Set specific theme mode */
  setThemeMode: (mode: ThemeMode) => void;
  /** Theme-aware colors */
  themeColors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextState | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * Theme Provider Component
 */
export function ThemeProvider({ children }: ThemeProviderProps): React.JSX.Element {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved theme preference
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved && ['light', 'dark', 'system'].includes(saved)) {
          setThemeModeState(saved as ThemeMode);
        }
      } catch (error) {
        console.error('Failed to load theme:', error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadTheme();
  }, []);

  // Resolve actual theme based on mode
  const isDark = themeMode === 'system'
    ? systemColorScheme === 'dark'
    : themeMode === 'dark';

  // Generate theme-aware colors
  const themeColors = useMemo<ThemeColors>(() => ({
    background: {
      primary: isDark ? colors.background.dark : colors.background.primary,
      secondary: isDark ? colors.background.paperDark : colors.background.secondary,
    },
    text: {
      primary: isDark ? colors.text.primaryDark : colors.text.primary,
      secondary: isDark ? colors.text.secondaryDark : colors.text.secondary,
      tertiary: isDark ? colors.neutral[500] : colors.text.tertiary,
    },
    border: isDark ? colors.neutral[700] : colors.border.default,
    card: isDark ? colors.neutral[800] : colors.white,
    primary: colors.primary,
    secondary: colors.secondary,
    semantic: colors.semantic,
    neutral: colors.neutral,
  }), [isDark]);

  // Save theme preference
  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  }, []);

  // Toggle between light and dark
  const toggleTheme = useCallback(() => {
    const newMode = isDark ? 'light' : 'dark';
    setThemeMode(newMode);
  }, [isDark, setThemeMode]);

  // Don't render until theme is loaded to prevent flash
  if (!isLoaded) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider
      value={{
        isDark,
        themeMode,
        toggleTheme,
        setThemeMode,
        themeColors,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access theme context
 */
export function useTheme(): ThemeContextState {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
