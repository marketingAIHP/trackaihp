// AIHP Refined Color Palette - Premium Upgrade
export const colors = {
  // Primary Brand Colors
  deepBurgundy: '#8B1212', // Primary CTA buttons & main accents
  navyInk: '#051622', // Headers, primary text & brand anchors
  mutedTeal: '#128AA0', // Secondary accent, chat icons & highlights

  // Background Colors
  pureWhite: '#FFFFFF', // Card backgrounds & text contrast
  almostWhite: '#F9FAFB', // Page backgrounds & subtle fills
  modernBeige: '#F0E8E0', // Warm section backgrounds & accent fills

  // Text Colors
  navyGrey: '#1A2B47', // Body text & readable paragraphs
  coolGrey: '#6B7280', // Metadata, labels & secondary text
  slateGrey: '#5A7C8C', // Dividers, inactive states & subtle accents

  // Legacy support (mapped to new palette)
  primary: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#8B1212', // Deep Burgundy
    700: '#7f1d1d',
    800: '#991b1b',
    900: '#7f1d1d',
  },

  // Status colors (keeping for compatibility)
  success: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },

  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
  },

  danger: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
  },

  info: {
    50: '#ecfeff',
    100: '#cffafe',
    200: '#a5f3fc',
    300: '#67e8f9',
    400: '#22d3ee',
    500: '#06b6d4',
    600: '#128AA0', // Muted Teal
    700: '#0e7490',
    800: '#155e75',
    900: '#164e63',
  },

  // Slate colors (mapped to new palette)
  slate: {
    50: '#F9FAFB', // Almost White
    100: '#F0E8E0', // Modern Beige
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#6B7280', // Cool Grey
    600: '#5A7C8C', // Slate Grey
    700: '#475569',
    800: '#1A2B47', // Navy Grey
    900: '#051622', // Navy Ink
  },

  // Neutral colors
  white: '#FFFFFF',
  black: '#000000',
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6B7280', // Cool Grey
    600: '#4b5563',
    700: '#374151',
    800: '#1A2B47', // Navy Grey
    900: '#111827',
  },
};

// Theme colors using new palette
export const theme = {
  light: {
    background: colors.almostWhite,
    surface: colors.pureWhite,
    text: colors.navyInk,
    textSecondary: colors.coolGrey,
    border: colors.slateGrey,
    primary: colors.deepBurgundy,
    secondary: colors.mutedTeal,
    success: colors.success[600],
    warning: colors.warning[500],
    danger: colors.danger[600],
    info: colors.mutedTeal,
    accent: colors.modernBeige,
  },
  dark: {
    background: colors.navyInk,
    surface: colors.navyGrey,
    text: colors.pureWhite,
    textSecondary: colors.coolGrey,
    border: colors.slateGrey,
    primary: colors.deepBurgundy,
    secondary: colors.mutedTeal,
    success: colors.success[500],
    warning: colors.warning[400],
    danger: colors.danger[500],
    info: colors.mutedTeal,
    accent: colors.modernBeige,
  },
};
