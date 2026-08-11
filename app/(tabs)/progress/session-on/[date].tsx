import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSessionsOnDate } from '@/hooks/useProgress';
import { formatDuration } from '@/lib/utils/date';
import { spacing } from '@/lib/theme';

export default function SessionsOnDate() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const router = useRouter();
  const { data: sessions, isLoading } = useSessionsOnDate(date);

  useEffect(() => {
    if (sessions?.length === 1) {
      router.replace(`/(tabs)/progress/session/${sessions[0].id}`);
    }
  }, [sessions, router]);

  if (isLoading) return <LoadingState />;
  if (!sessions || sessions.length === 0) {
    return (
      <Screen>
        <EmptyState icon="calendar-outline" title="No session on this day" />
      </Screen>
    );
  }
  if (sessions.length === 1) return <LoadingState />;

  return (
    <Screen scroll>
      <View style={{ gap: spacing.sm }}>
        <Text variant="subtitle">{date}</Text>
        {sessions.map((s) => (
          <Card key={s.id} onPress={() => router.push(`/(tabs)/progress/session/${s.id}`)}>
            <Text weight="600">{s.name ?? 'Workout'}</Text>
            <Text variant="caption" color="muted">
              {s.total_sets} sets · {Math.round(s.total_volume)}kg volume
              {s.ended_at ? ` · ${formatDuration((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000)}` : ''}
            </Text>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
