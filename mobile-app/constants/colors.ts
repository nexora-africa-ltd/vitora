/**
 * Design tokens for Vitora HMIS Mobile App.
 *
 * @module constants/colors
 */

export const colors = {
  // Brand colors
  primary: {
    50: '#E8F5E9',
    100: '#C8E6C9',
    200: '#A5D6A7',
    300: '#81C784',
    400: '#66BB6A',
    500: '#4CAF50', // Main primary
    600: '#43A047',
    700: '#388E3C',
    800: '#2E7D32',
    900: '#1B5E20',
  },

  // Secondary (blue for healthcare)
  secondary: {
    50: '#E3F2FD',
    100: '#BBDEFB',
    200: '#90CAF9',
    300: '#64B5F6',
    400: '#42A5F5',
    500: '#2196F3', // Main secondary
    600: '#1E88E5',
    700: '#1976D2',
    800: '#1565C0',
    900: '#0D47A1',
  },

  // Semantic colors
  success: {
    light: '#81C784',
    main: '#4CAF50',
    dark: '#388E3C',
  },

  warning: {
    light: '#FFB74D',
    main: '#FF9800',
    dark: '#F57C00',
  },

  error: {
    light: '#E57373',
    main: '#F44336',
    dark: '#D32F2F',
  },

  info: {
    light: '#64B5F6',
    main: '#2196F3',
    dark: '#1976D2',
  },

  // Critical alerts (for vitals like SpO2 < 95%)
  critical: {
    light: '#FF8A80',
    main: '#FF5252',
    dark: '#D50000',
  },

  // Neutral colors
  neutral: {
    0: '#FFFFFF',
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#EEEEEE',
    300: '#E0E0E0',
    400: '#BDBDBD',
    500: '#9E9E9E',
    600: '#757575',
    700: '#616161',
    800: '#424242',
    900: '#212121',
    1000: '#000000',
  },

  // Background colors
  background: {
    default: '#FFFFFF',
    paper: '#F5F5F5',
    dark: '#121212',
    paperDark: '#1E1E1E',
  },

  // Text colors
  text: {
    primary: '#212121',
    secondary: '#757575',
    disabled: '#BDBDBD',
    hint: '#9E9E9E',
    primaryDark: '#FFFFFF',
    secondaryDark: '#B0B0B0',
  },

  // Status colors for sync
  sync: {
    pending: '#FF9800',
    syncing: '#2196F3',
    synced: '#4CAF50',
    failed: '#F44336',
    conflict: '#9C27B0',
  },

  // Gender colors (for patient cards)
  gender: {
    male: '#42A5F5',
    female: '#EC407A',
    other: '#AB47BC',
  },
} as const;

export default colors;
