import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from './Text';

interface ToastProps {
  visible: boolean;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onHide: () => void;
  durationMs?: number;
}

/** Transient top-of-screen toast — used for the instant PR celebration (components/session/PrBadge.tsx),
 * generic enough to reuse elsewhere. Auto-hides after durationMs. */
export function Toast({ visible, message, icon = 'trophy', onHide, durationMs = 2000 }: ToastProps) {
  const theme = useTheme();

  const style = useAnimatedStyle(() => ({
    opacity: visible
      ? withSequence(withTiming(1, { duration: 200 }), withDelay(durationMs - 400, withTiming(0, { duration: 200 })))
      : withTiming(0, { duration: 0 }),
  }));

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onHide, durationMs);
    return () => clearTimeout(timer);
  }, [visible, durationMs, onHide]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: spacing.md,
          left: spacing.lg,
          right: spacing.lg,
          zIndex: 100,
        },
        style,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: theme.primary,
          borderRadius: radius.full,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        }}
      >
        <Ionicons name={icon} size={18} color="#FFFFFF" />
        <Text weight="700" style={{ color: '#FFFFFF' }}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}
