import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import type { Streak } from '@/types/domain';

export function StreakHeroCard({ streak }: { streak: Streak }) {
  const theme = useTheme();

  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderRadius: radius.xl,
        padding: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      }}
    >
      <LinearGradient
        colors={[theme.gradientFrom, theme.gradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 72,
          height: 72,
          borderRadius: radius.xl,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="flame" size={36} color="#FFFFFF" />
      </LinearGradient>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
          <Text style={{ fontSize: 40, fontWeight: '800', color: theme.primary }}>{streak.current_streak_days}</Text>
        </View>
        <Text color="muted" variant="caption">
          Days Streak 🔥
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <Text color="muted" variant="caption">
          Personal Best
        </Text>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>{streak.longest_streak_days} days</Text>
      </View>
    </View>
  );
}
