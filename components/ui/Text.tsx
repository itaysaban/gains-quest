import { Text as RNText, type TextProps } from 'react-native';
import { useTheme } from '@/lib/theme';

interface Props extends TextProps {
  variant?: 'title' | 'subtitle' | 'body' | 'caption' | 'label';
  color?: 'default' | 'muted' | 'primary' | 'danger' | 'success';
  weight?: '400' | '500' | '600' | '700';
}

const sizeByVariant: Record<NonNullable<Props['variant']>, number> = {
  title: 28,
  subtitle: 18,
  body: 15,
  caption: 13,
  label: 12,
};

export function Text({ variant = 'body', color = 'default', weight, style, ...rest }: Props) {
  const theme = useTheme();
  const colorMap = {
    default: theme.text,
    muted: theme.textMuted,
    primary: theme.primary,
    danger: theme.danger,
    success: theme.success,
  };

  return (
    <RNText
      style={[
        {
          fontSize: sizeByVariant[variant],
          color: colorMap[color],
          fontWeight: weight ?? (variant === 'title' ? '700' : variant === 'subtitle' ? '600' : '400'),
        },
        style,
      ]}
      {...rest}
    />
  );
}
