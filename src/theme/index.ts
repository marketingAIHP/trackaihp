import {MD3LightTheme, MD3DarkTheme, configureFonts} from 'react-native-paper';
import {colors} from './colors';

const fontConfig = {
  bodyLarge: {
    fontFamily: 'System',
    fontSize: 16,
    fontWeight: '400' as const,
    letterSpacing: 0.5,
  },
  bodyMedium: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '400' as const,
    letterSpacing: 0.25,
  },
  bodySmall: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '400' as const,
    letterSpacing: 0.4,
  },
  displayLarge: {
    fontFamily: 'System',
    fontSize: 57,
    fontWeight: '400' as const,
    letterSpacing: 0,
  },
  displayMedium: {
    fontFamily: 'System',
    fontSize: 45,
    fontWeight: '400' as const,
    letterSpacing: 0,
  },
  displaySmall: {
    fontFamily: 'System',
    fontSize: 36,
    fontWeight: '400' as const,
    letterSpacing: 0,
  },
  headlineLarge: {
    fontFamily: 'System',
    fontSize: 32,
    fontWeight: '400' as const,
    letterSpacing: 0,
  },
  headlineMedium: {
    fontFamily: 'System',
    fontSize: 28,
    fontWeight: '400' as const,
    letterSpacing: 0,
  },
  headlineSmall: {
    fontFamily: 'System',
    fontSize: 24,
    fontWeight: '400' as const,
    letterSpacing: 0,
  },
  labelLarge: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '500' as const,
    letterSpacing: 0.1,
  },
  labelMedium: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '500' as const,
    letterSpacing: 0.5,
  },
  labelSmall: {
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: '500' as const,
    letterSpacing: 0.5,
  },
  titleLarge: {
    fontFamily: 'System',
    fontSize: 22,
    fontWeight: '400' as const,
    letterSpacing: 0,
  },
  titleMedium: {
    fontFamily: 'System',
    fontSize: 16,
    fontWeight: '500' as const,
    letterSpacing: 0.15,
  },
  titleSmall: {
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '500' as const,
    letterSpacing: 0.1,
  },
};

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.deepBurgundy,
    secondary: colors.mutedTeal,
    tertiary: colors.mutedTeal,
    error: colors.danger[600],
    background: colors.almostWhite,
    surface: colors.pureWhite,
    surfaceVariant: colors.modernBeige,
    onPrimary: colors.pureWhite,
    onSecondary: colors.pureWhite,
    onTertiary: colors.pureWhite,
    onError: colors.pureWhite,
    onBackground: colors.navyInk,
    onSurface: colors.navyInk,
    onSurfaceVariant: colors.navyGrey,
    outline: colors.slateGrey,
    outlineVariant: colors.coolGrey,
  },
  fonts: configureFonts({config: fontConfig}),
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: colors.deepBurgundy,
    secondary: colors.mutedTeal,
    tertiary: colors.mutedTeal,
    error: colors.danger[500],
    background: colors.navyInk,
    surface: colors.navyGrey,
    surfaceVariant: colors.slateGrey,
    onPrimary: colors.pureWhite,
    onSecondary: colors.pureWhite,
    onTertiary: colors.pureWhite,
    onError: colors.pureWhite,
    onBackground: colors.pureWhite,
    onSurface: colors.pureWhite,
    onSurfaceVariant: colors.coolGrey,
    outline: colors.slateGrey,
    outlineVariant: colors.coolGrey,
  },
  fonts: configureFonts({config: fontConfig}),
};

