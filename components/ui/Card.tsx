import { View, Pressable, type ViewProps } from 'react-native';
import { useTheme, spacing, radius } from '@/lib/theme';

interface CardProps extends ViewProps {
  onPress?: () => void;
}

export function Card({ children, style, onPress, ...rest }: CardProps) {
  const theme = useTheme();
  const cardStyle = {
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: theme.border,
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [cardStyle, { opacity: pressed ? 0.85 : 1 }, style as object]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={[cardStyle, style]} {...rest}>
      {children}
    </View>
  );
}
