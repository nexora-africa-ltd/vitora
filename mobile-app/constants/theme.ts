/**
 * Theme configuration for Vitora HMIS Mobile App.
 *
 * @module constants/theme
 */

import { colors } from './colors';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const borderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 24,
  display: 32,
} as const;

export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
} as const;

export const shadow = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: colors.neutral[1000],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: colors.neutral[1000],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: colors.neutral[1000],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
} as const;

export const lightTheme = {
  colors: {
    primary: colors.primary[500],
    primaryLight: colors.primary[100],
    primaryDark: colors.primary[700],
    secondary: colors.secondary[500],
    background: colors.background.default,
    surface: colors.background.paper,
    text: colors.text.primary,
    textSecondary: colors.text.secondary,
    textDisabled: colors.text.disabled,
    border: colors.neutral[300],
    error: colors.error.main,
    success: colors.success.main,
    warning: colors.warning.main,
    info: colors.info.main,
    critical: colors.critical.main,
  },
  isDark: false,
} as const;

export const darkTheme = {
  colors: {
    primary: colors.primary[400],
    primaryLight: colors.primary[800],
    primaryDark: colors.primary[300],
    secondary: colors.secondary[400],
    background: colors.background.dark,
    surface: colors.background.paperDark,
    text: colors.text.primaryDark,
    textSecondary: colors.text.secondaryDark,
    textDisabled: colors.neutral[600],
    border: colors.neutral[700],
    error: colors.error.light,
    success: colors.success.light,
    warning: colors.warning.light,
    info: colors.info.light,
    critical: colors.critical.light,
  },
  isDark: true,
} as const;

export type Theme = typeof lightTheme;

export const theme = {
  light: lightTheme,
  dark: darkTheme,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  lineHeight,
  shadow,
} as const;

export default theme;
