import { Text as RNText, type TextProps } from 'react-native';
import { useTheme } from '@/lib/theme';

type Weight = '400' | '500' | '600' | '700';

interface Props extends TextProps {
  variant?: 'title' | 'subtitle' | 'body' | 'caption' | 'label';
  color?: 'default' | 'muted' | 'secondary' | 'faint' | 'primary' | 'danger' | 'success' | 'warning';
  weight?: Weight;
  /** Design handoff v2 (2026-09-01) typography: one family, EB Garamond, across every role —
   * 'display' = 700 uppercase (headings, big stat numerals), 'mono' = 600 uppercase with tracking
   * (data/labels, e.g. "LAST TIME · 12 AUG" — kept as the historical prop name since its semantic
   * role is unchanged even though it's no longer a monospace face; renaming ~30 call sites for a
   * naming-only change wasn't worth the churn), 'body' = EB Garamond at the given `weight`. Omit to
   * keep the system font (every screen not yet migrated to the new design). */
  font?: 'display' | 'body' | 'mono';
  /** Overrides the variant's default font size — the new design's scale (34/26/22/40/30/…) doesn't
   * map cleanly onto the 5 fixed variants. */
  size?: number;
}

const sizeByVariant: Record<NonNullable<Props['variant']>, number> = {
  title: 28,
  subtitle: 18,
  body: 15,
  caption: 13,
  label: 12,
};

const bodyFamilyByWeight: Record<Weight, string> = {
  '400': 'EBGaramond_400Regular',
  '500': 'EBGaramond_500Medium',
  '600': 'EBGaramond_600SemiBold',
  '700': 'EBGaramond_700Bold',
};

export function Text({ variant = 'body', color = 'default', weight, font, size, style, ...rest }: Props) {
  const theme = useTheme();
  const colorMap = {
    default: theme.text,
    muted: theme.textMuted,
    secondary: theme.textSecondary,
    faint: theme.textFaint,
    primary: theme.primary,
    danger: theme.danger,
    success: theme.success,
    warning: theme.warning,
  };

  const resolvedWeight = weight ?? (variant === 'title' ? '700' : variant === 'subtitle' ? '600' : '400');

  // React Native maps a fontFamily to one exact font file — there's no combining a "regular" family
  // with a bold fontWeight the way web does, so display/mono (each loaded at a single fixed weight)
  // and body (loaded at all four) each resolve to a specific family name here, never a fontWeight.
  const fontFamily =
    font === 'display' ? 'EBGaramond_700Bold' : font === 'mono' ? 'EBGaramond_600SemiBold' : font === 'body' ? bodyFamilyByWeight[resolvedWeight] : undefined;

  return (
    <RNText
      style={[
        {
          fontSize: size ?? sizeByVariant[variant],
          color: colorMap[color],
          ...(fontFamily ? { fontFamily } : { fontWeight: resolvedWeight }),
          ...(font === 'display' ? { textTransform: 'uppercase' as const } : null),
        },
        style,
      ]}
      {...rest}
    />
  );
}
