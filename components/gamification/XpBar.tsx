import { View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import type { UserLevel } from '@/types/domain';

export function XpBar({ level }: { level: UserLevel }) {
  const theme = useTheme();
  const ratio = level.xp_for_next_level > 0 ? Math.min(1, level.xp_into_level / level.xp_for_next_level) : 1;

  const animatedStyle = useAnimatedStyle(() => ({
    width: withTiming(`${Math.max(4, ratio * 100)}%`, { duration: 600 }),
  }));

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text weight="600">Level {level.current_level}</Text>
        <Text color="muted" variant="caption">
          {level.xp_into_level} / {level.xp_for_next_level} XP to next level
        </Text>
      </View>
      <View
        style={{
          height: 10,
          borderRadius: radius.full,
          backgroundColor: theme.surfaceAlt,
          overflow: 'hidden',
        }}
      >
        <Animated.View style={[{ height: '100%', backgroundColor: theme.xpBar, borderRadius: radius.full }, animatedStyle]} />
      </View>
    </View>
  );
}
