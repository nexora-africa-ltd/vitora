/**
 * Vitora brand palette — derived from web-app/globals.css design tokens.
 *
 * Primary: Deep Burgundy — professional, authoritative
 * Secondary: Teal — healthcare trust, calm
 * Accent: Warm Gold — warmth, Kenya sun
 */
export const palette = {
  // Backgrounds & surfaces
  sand: '#EDEAD9',           // hsl(40 41% 93%) — web --background
  parchment: '#FFFFFF',      // web --card (pure white)
  ink: '#0B1526',            // hsl(222.2 84% 4.9%) — web --foreground
  slate: '#64748B',          // hsl(215.4 16.3% 46.9%) — web --muted-foreground
  white: '#FFFFFF',

  // Brand
  burgundy: '#3D000F',      // hsl(346 100% 12%) — web --primary
  burgundyDeep: '#2E000B',   // hsl(346 100% 9%) — web --primary-700
  teal: '#1A4D5C',           // hsl(196 53% 23%) — web --secondary
  gold: '#D4A574',           // hsl(32 33% 65%) — web --accent
  goldDeep: '#B8875A',       // hsl(32 33% 51%) — web --accent-700

  // Borders
  line: '#DDE3EA',           // hsl(214.3 31.8% 91.4%) — web --border
  lineDark: '#273449',       // hsl(217.2 32.6% 17.5%) — web dark --border

  // Semantic
  success: '#2E7D4A',       // hsl(145 46% 34%) — web --success
  warning: '#E6A023',       // hsl(40 96% 53%) — web --warning
  danger: '#C62828',        // hsl(0 65% 47%) — web --critical

  // Dark-mode surfaces (kept darker for OLED)
  charcoal: '#0F1720',
  graphite: '#162330',
  midnight: '#0B1526',       // matches ink / web dark --background

  // Dark-mode foregrounds (slightly boosted for mobile contrast)
  mist: '#9CAFC0',           // hsl(215 20.2% 65.1%) — web dark --muted-foreground
  burgundyMist: '#8C3350',   // hsl(346 100% 20%) lightened for dark bg
  goldMist: '#C4935F',       // hsl(32 33% 55%) — web dark --accent
};

export const lightTheme = {
  colors: {
    background: palette.sand,
    surface: palette.parchment,
    elevated: palette.white,
    text: palette.ink,
    mutedText: palette.slate,
    primary: palette.burgundy,
    primaryDark: palette.burgundyDeep,
    secondary: palette.teal,
    accent: palette.gold,
    border: palette.line,
    success: palette.success,
    warning: palette.warning,
    danger: palette.danger,
  },
  radius: {
    sm: 12,
    md: 18,
    lg: 26,
    pill: 999,
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 28,
  },
};

export const darkTheme = {
  colors: {
    background: palette.midnight,
    surface: palette.charcoal,
    elevated: palette.graphite,
    text: '#F1F5F9',             // hsl(210 40% 98%) — web dark --foreground
    mutedText: palette.mist,
    primary: palette.burgundyMist,
    primaryDark: palette.burgundy,
    secondary: '#4DA0B8',        // hsl(196 53% 35%) — web dark --secondary
    accent: palette.goldMist,
    border: palette.lineDark,
    success: '#3DA366',          // hsl(145 46% 40%) — web dark --success
    warning: '#D4930E',          // hsl(40 96% 45%) — web dark --warning
    danger: '#E2786E',           // softened for dark bg readability
  },
  radius: {
    sm: 12,
    md: 18,
    lg: 26,
    pill: 999,
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 28,
  },
} as const;

export type AppTheme = typeof lightTheme;

export const appTheme = lightTheme;

export const Colors = {
  light: {
    text: lightTheme.colors.text,
    background: lightTheme.colors.background,
    tint: lightTheme.colors.primary,
    icon: lightTheme.colors.mutedText,
    tabIconDefault: lightTheme.colors.mutedText,
    tabIconSelected: lightTheme.colors.primary,
  },
  dark: {
    text: darkTheme.colors.text,
    background: darkTheme.colors.background,
    tint: darkTheme.colors.primary,
    icon: darkTheme.colors.mutedText,
    tabIconDefault: darkTheme.colors.mutedText,
    tabIconSelected: darkTheme.colors.primary,
  },
};

export const Fonts = {
  sans: 'System',
  serif: 'Georgia',
  rounded: 'System',
  mono: 'Courier',
};
