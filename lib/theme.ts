import { useColorScheme } from 'react-native';

const palette = {
  purple: '#6C5CE7',
  purpleDark: '#4834D4',
  green: '#00B894',
  amber: '#FDCB6E',
  red: '#E17055',
  blue: '#0984E3',
};

const light = {
  background: '#F7F7FB',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F0F7',
  border: '#E4E4EE',
  text: '#1A1A2E',
  textMuted: '#6B6B85',
  primary: palette.purple,
  primaryMuted: '#EEEBFC',
  success: palette.green,
  warning: palette.amber,
  danger: palette.red,
  info: palette.blue,
  xpBar: palette.purple,
  streak: '#FF7A45',
};

const dark = {
  background: '#12121C',
  surface: '#1C1C2A',
  surfaceAlt: '#25253A',
  border: '#33334A',
  text: '#F1F1F8',
  textMuted: '#9797B3',
  primary: '#8B7CF6',
  primaryMuted: '#2B2650',
  success: palette.green,
  warning: palette.amber,
  danger: '#FF8A70',
  info: '#4FA8F5',
  xpBar: '#8B7CF6',
  streak: '#FF8F5E',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 };
