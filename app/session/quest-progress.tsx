import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { LoadingState } from '@/components/ui/LoadingState';
import { useQuestGains } from '@/hooks/useChallenges';
import { QuestCard } from '@/components/social/ChallengesSection';
import { useTheme, spacing, radius } from '@/lib/theme';

/** A dedicated post-workout screen for quest progress, per explicit request — rather than folding
 * it into Session Summary's own card stack (GAINPOINTS / RECORDS / SHARE TO FEED), it gets its own
 * moment, the same way Session Summary itself is a separate full-screen step rather than a section
 * bolted onto Active Session. Reached from Session Summary's "Save session" action; Continue here
 * is the actual return to Home. */
export default function QuestProgress() {
  const router = useRouter();
  const theme = useTheme();
  const { gains, isLoading } = useQuestGains();

  return (
    <SafeAreaProvider>
      <Screen scroll padded={false}>
        <LinearGradient
          colors={[theme.gradientFrom, theme.gradientTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.3, y: 1 }}
          style={{ paddingTop: 60, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: 6 }}
        >
          <Text font="mono" size={11} style={{ letterSpacing: 2, color: 'rgba(24,13,2,0.6)' }}>
            SESSION SAVED
          </Text>
          <Text font="display" size={34} style={{ color: theme.onAccent, lineHeight: 36, textTransform: 'uppercase' }}>
            Quest Progress
          </Text>
          <Text font="body" weight="500" size={13} style={{ color: 'rgba(24,13,2,0.72)' }}>
            Here&apos;s where today&apos;s quests stand.
          </Text>
        </LinearGradient>

        <View style={{ padding: spacing.lg, gap: spacing.md, backgroundColor: theme.background }}>
          {isLoading ? (
            <LoadingState />
          ) : gains.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {gains.map(({ challenge, gained }) => (
                <QuestCard key={challenge.id} challenge={challenge} animate={gained} />
              ))}
            </View>
          ) : null}
        </View>

        <View style={{ padding: spacing.lg, paddingTop: 0 }}>
          <Pressable onPress={() => router.dismissTo('/(tabs)/home')}>
            <LinearGradient
              colors={[theme.gradientFrom, theme.gradientTo]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text font="body" weight="700" size={15} style={{ color: theme.onAccent }}>
                Continue
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </Screen>
    </SafeAreaProvider>
  );
}
