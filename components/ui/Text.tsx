import { Text as RNText, type TextProps } from 'react-native';
import { useTheme } from '@/lib/theme';

type Weight = '400' | '500' | '600' | '700';

interface Props extends TextProps {
  variant?: 'title' | 'subtitle' | 'body' | 'caption' | 'label';
  color?: 'default' | 'muted' | 'secondary' | 'faint' | 'primary' | 'danger' | 'success' | 'warning';
  weight?: Weight;
  /** Design handoff (design_handoff_gainquest) typography: 'display' = Barlow Condensed (headings,
   * big stat numerals, always uppercase), 'mono' = JetBrains Mono (data/labels, e.g. "LAST TIME ·
   * 12 AUG"), 'body' = Barlow at the given `weight`. Omit to keep the system font (every screen not
   * yet migrated to the new design). */
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
  '400': 'Barlow_400Regular',
  '500': 'Barlow_500Medium',
  '600': 'Barlow_600SemiBold',
  '700': 'Barlow_700Bold',
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
    font === 'display' ? 'BarlowCondensed_700Bold' : font === 'mono' ? 'JetBrainsMono_600SemiBold' : font === 'body' ? bodyFamilyByWeight[resolvedWeight] : undefined;

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
