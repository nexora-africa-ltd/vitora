// use this as a baseline guide for consistency
/**
 * Design tokens for Vitora HMIS Frontend Apps.
 *
 * Color palette based on #3D000F (Deep Burgundy) as primary.
 * - Primary: Deep burgundy - professional, authoritative
 * - Secondary: Teal - healthcare trust, calm
 * - Accent: Warm gold - warmth, Kenya sun
 *
 * @module constants/colors
 */

export const colors = {
  // Base colors
  white: '#FFFFFF',
  black: '#000000',

  // Brand colors - Deep Burgundy
  primary: {
    50: '#F9E6E9',
    100: '#F0BFC7',
    200: '#E69AA6',
    300: '#D97485',
    400: '#CC4F64',
    500: '#3D000F', // Main primary - Deep Burgundy
    600: '#370010',
    700: '#30000D',
    800: '#29000B',
    900: '#1F0008',
  },

  // Secondary - Teal (healthcare trust)
  secondary: {
    50: '#E6F2F4',
    100: '#C0DFE4',
    200: '#99CCD4',
    300: '#73B8C4',
    400: '#4DA5B4',
    500: '#1A4D5C', // Main secondary - Teal
    600: '#174552',
    700: '#143C48',
    800: '#11333E',
    900: '#0D262E',
  },

  // Accent - Warm Gold (Kenya sun, warmth)
  accent: {
    50: '#FDF6ED',
    100: '#FAE9D1',
    200: '#F5D5A8',
    300: '#EFC17F',
    400: '#EAAD56',
    500: '#D4A574', // Main accent - Warm Gold
    600: '#C49462',
    700: '#B38350',
    800: '#A3733E',
    900: '#8A6034',
  },

  // Semantic colors
  semantic: {
    success: '#2E7D4A',
    warning: '#E6A023',
    error: '#C62828',
    info: '#1A4D5C',
  },

  success: {
    light: '#5FAD76',
    main: '#2E7D4A',
    dark: '#1E5432',
  },

  warning: {
    50: '#FFF8E6',
    100: '#FFEDB8',
    200: '#FFE18A',
    300: '#FFD55C',
    400: '#FFCA2E',
    500: '#E6A023',
    600: '#D4931D',
    700: '#C28617',
    light: '#FFB74D',
    main: '#E6A023',
    dark: '#C28617',
  },

  error: {
    light: '#EF5350',
    main: '#C62828',
    dark: '#8E0000',
  },

  info: {
    light: '#4DA5B4',
    main: '#1A4D5C',
    dark: '#0D262E',
  },

  // Critical alerts (for vitals like SpO2 < 95%)
  critical: {
    light: '#EF5350',
    main: '#C62828',
    dark: '#8E0000',
  },

  // Neutral colors
  neutral: {
    0: '#FFFFFF',
    50: '#FAF9F9',
    100: '#F5F4F4',
    200: '#EDEBEB',
    300: '#DDD9D9',
    400: '#B8B2B2',
    500: '#948C8C',
    600: '#706868',
    700: '#5A5252',
    800: '#3D3636',
    900: '#211C1C',
    1000: '#000000',
  },

  // Background colors
  background: {
    default: '#FFFFFF',
    primary: '#FFFFFF',
    secondary: '#FAF9F9',
    paper: '#F5F4F4',
    dark: '#1A1516',
    paperDark: '#2A2324',
  },

  // Text colors
  text: {
    primary: '#211C1C',
    secondary: '#706868',
    tertiary: '#948C8C',
    disabled: '#B8B2B2',
    hint: '#948C8C',
    primaryDark: '#FFFFFF',
    secondaryDark: '#B8B2B2',
  },

  // Border colors
  border: {
    default: '#DDD9D9',
    light: '#EDEBEB',
    dark: '#B8B2B2',
  },

  // Status colors for sync
  sync: {
    pending: '#E6A023',
    syncing: '#1A4D5C',
    synced: '#2E7D4A',
    failed: '#C62828',
    conflict: '#7B1FA2',
  },

  // Gender colors (for patient cards)
  gender: {
    male: '#1A4D5C',
    female: '#D4A574',
    other: '#7B1FA2',
  },
} as const;

export default colors;
