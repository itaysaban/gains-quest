import { Pressable, ActivityIndicator, type PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from './Text';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading,
  fullWidth,
  disabled,
  onPress,
  ...rest
}: ButtonProps) {
  const theme = useTheme();

  const bg = {
    primary: theme.primary,
    secondary: theme.surfaceAlt,
    ghost: 'transparent',
    danger: theme.danger,
  }[variant];

  const textColor = variant === 'primary' || variant === 'danger' ? '#FFFFFF' : theme.text;
  const paddingV = { sm: spacing.sm, md: spacing.md, lg: spacing.lg }[size];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={(e) => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={({ pressed }) => ({
        backgroundColor: bg,
        paddingVertical: paddingV,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
        borderWidth: variant === 'ghost' ? 1 : 0,
        borderColor: theme.border,
      })}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text weight="600" style={{ color: textColor }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
