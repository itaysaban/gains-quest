import { useColorScheme } from 'react-native';

// Brand: dark navy canvas + a warm orange→red flame accent (GainsQuest "Achievement Hall" look).
const light = {
  background: '#FBF7F4',
  surface: '#FFFFFF',
  surfaceAlt: '#F5EFE9',
  border: '#EAE0D8',
  text: '#1A1A22',
  textMuted: '#7A7A8C',
  primary: '#FF6A3D',
  primaryMuted: '#FFE4D6',
  success: '#00B894',
  warning: '#FDCB6E',
  danger: '#E1483A',
  info: '#0984E3',
  xpBar: '#FF6A3D',
  streak: '#FF5A36',
  locked: '#B7B7C4',
  gradientFrom: '#FF9A56',
  gradientTo: '#FF3D3D',
  // M3 Epic 3 Story 3.4: one accent per badge category, matching the Figma Achievement Hall design.
  // Kept separate from the semantic danger/warning/info/success tokens (even where the hue matches)
  // so badge-category styling can't accidentally shift if those tokens' meaning changes later.
  badgeOnboarding: '#E1483A',
  badgeCardio: '#E8B94A',
  badgeConsistency: '#FF6A3D',
  badgeVolume: '#D6428F',
  badgeSocial: '#FF6FA0',
  badgeProgression: '#0984E3',
  badgeVariety: '#00B894',
};

const dark = {
  background: '#0D0D14',
  surface: '#1A1A24',
  surfaceAlt: '#22222E',
  border: '#2B2B38',
  text: '#FFFFFF',
  textMuted: '#8B8B9E',
  primary: '#FF6A3D',
  primaryMuted: '#3A2418',
  success: '#3ECF8E',
  warning: '#FDCB6E',
  danger: '#FF5C5C',
  info: '#4FA8F5',
  xpBar: '#FF6A3D',
  streak: '#FF5A36',
  locked: '#5C5C6E',
  gradientFrom: '#FF9A56',
  gradientTo: '#FF3D3D',
  badgeOnboarding: '#FF5C4D',
  badgeCardio: '#FDCB6E',
  badgeConsistency: '#FF6A3D',
  badgeVolume: '#E14AA0',
  badgeSocial: '#FF7FB0',
  badgeProgression: '#4FA8F5',
  badgeVariety: '#3ECF8E',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 };
