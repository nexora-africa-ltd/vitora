export const palette = {
  sand: '#F4EFE5',
  parchment: '#FFF9F1',
  ink: '#13212C',
  slate: '#5D6B75',
  teal: '#0F766E',
  tealDeep: '#0A4F4E',
  navy: '#17324D',
  orange: '#E08A5C',
  orangeDeep: '#A7572F',
  line: '#DED5C8',
  success: '#1E8E5A',
  warning: '#C67A00',
  danger: '#B9382F',
  white: '#FFFFFF',
  charcoal: '#0F1720',
  graphite: '#162330',
  midnight: '#0C141C',
  mist: '#C5D0D8',
  lineDark: '#274051',
  tealMist: '#7CC7C1',
  orangeMist: '#F0B18B',
};

export const lightTheme = {
  colors: {
    background: palette.sand,
    surface: palette.parchment,
    elevated: palette.white,
    text: palette.ink,
    mutedText: palette.slate,
    primary: palette.teal,
    primaryDark: palette.tealDeep,
    secondary: palette.navy,
    accent: palette.orange,
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
    text: '#EEF4F7',
    mutedText: palette.mist,
    primary: palette.tealMist,
    primaryDark: palette.teal,
    secondary: '#8EB9E3',
    accent: palette.orangeMist,
    border: palette.lineDark,
    success: '#4FC485',
    warning: '#E0AC3A',
    danger: '#E2786E',
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
