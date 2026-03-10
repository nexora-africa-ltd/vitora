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
};

export const appTheme = {
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

export const Colors = {
  light: {
    text: appTheme.colors.text,
    background: appTheme.colors.background,
    tint: appTheme.colors.primary,
    icon: appTheme.colors.mutedText,
    tabIconDefault: appTheme.colors.mutedText,
    tabIconSelected: appTheme.colors.primary,
  },
  dark: {
    text: appTheme.colors.text,
    background: appTheme.colors.background,
    tint: appTheme.colors.primary,
    icon: appTheme.colors.mutedText,
    tabIconDefault: appTheme.colors.mutedText,
    tabIconSelected: appTheme.colors.primary,
  },
};

export const Fonts = {
  sans: 'System',
  serif: 'Georgia',
  rounded: 'System',
  mono: 'Courier',
};
