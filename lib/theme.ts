import { useColorScheme } from 'react-native';

// Brand: deep indigo-navy canvas + a warm orange flame accent. Sourced from the design handoff
// (design_handoff_gainquest/README.md, "Design tokens") — the first real, final palette this app
// has had; supersedes the earlier improvised placeholder colors. That handoff is dark-only (neither
// it nor the PRD's own design-system section ever describes a light mode), so `light` below keeps
// its old placeholder values except for the shared accent/semantic colors, which are updated to
// match dark for consistency — light mode itself isn't a spec'd part of this design system yet.
const light = {
  background: '#FBF7F4',
  surface: '#FFFFFF',
  surfaceAlt: '#F5EFE9',
  border: '#EAE0D8',
  text: '#1A1A22',
  textMuted: '#7A7A8C',
  textSecondary: '#5C5C70',
  textFaint: '#9A9AA8',
  primary: '#FF7A1A',
  primaryMuted: '#FFE4D6',
  success: '#1E9E63',
  warning: '#B8860B',
  danger: '#E1483A',
  info: '#0984E3',
  xpBar: '#FF7A1A',
  streak: '#FF5A36',
  locked: '#B7B7C4',
  gradientFrom: '#FF9A2A',
  gradientTo: '#FF4D1C',
  chrome: '#F5EFE9',
  cardInset: '#EFE7DE',
  hairline: '#EAE0D8',
  borderSubtle: '#D8CCC0',
  onAccent: '#180D02',
  heart: '#E0527A',
  avatarPlaceholder: '#D8CCC0',
  navInactive: '#8A8A96',
  badgeOnboarding: '#E1483A',
  badgeCardio: '#E8B94A',
  badgeConsistency: '#FF7A1A',
  badgeVolume: '#D6428F',
  badgeSocial: '#FF6FA0',
  badgeProgression: '#0984E3',
  badgeVariety: '#1E9E63',
};

const dark = {
  // Screen ground, black as of 2026-09-03 (was #191933, the design handoff's "color.surface" —
  // the handoff calls the screen ground "surface" and the cards "background", the opposite of this
  // app's naming, so values were mapped across rather than renaming every token and usage site).
  // Note this flips the elevation polarity: cards used to sit *darker* than the page, and now sit
  // lighter than it. Anything that wants a visible fill on the page must use a surface token — not
  // `background`, which is now the same black as the ground behind it.
  background: '#000000',
  surface: '#13131F',
  surfaceAlt: '#1C1C2E',
  border: '#24243A', // color.hairline
  text: '#FFFFFF',
  textMuted: '#6D6D88', // color.text.muted
  textSecondary: '#9A9AB4', // color.text.secondary
  textFaint: '#565672', // color.text.faint
  primary: '#FF7A1A', // color.accent
  primaryMuted: '#3A2418',
  success: '#7BE0A5',
  warning: '#FFC93A',
  danger: '#FF5C5C',
  info: '#4FA8F5',
  xpBar: '#FF7A1A',
  streak: '#FF5A36',
  locked: '#5C5C6E',
  gradientFrom: '#FF9A2A', // color.accent.grad
  gradientTo: '#FF4D1C',
  chrome: '#23234D', // header + bottom tab bar
  cardInset: '#1C1C2E', // color.card.inset — nested field / inset row
  hairline: '#24243A',
  borderSubtle: '#3A3A5C', // dashed "add" affordances
  onAccent: '#180D02', // text/icons on top of accent fills
  heart: '#FF6F91', // feed reaction
  avatarPlaceholder: '#3A3A63',
  navInactive: '#7B7B96', // bottom tab bar inactive icon/label — a distinct grey from the handoff's
  // repeated nav markup, not part of its named "Design tokens" list but consistent throughout
  badgeOnboarding: '#FF5C4D',
  badgeCardio: '#FDCB6E',
  badgeConsistency: '#FF7A1A',
  badgeVolume: '#E14AA0',
  badgeSocial: '#FF7FB0',
  badgeProgression: '#4FA8F5',
  badgeVariety: '#7BE0A5',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, full: 999 };
