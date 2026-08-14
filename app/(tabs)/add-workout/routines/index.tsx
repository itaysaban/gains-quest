import { useMemo } from 'react';
import { SectionList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Card } from '@/components/ui/Card';
import { useRoutines } from '@/hooks/useRoutines';
import { useTheme, spacing, radius } from '@/lib/theme';
import type { Routine } from '@/types/domain';

export default function RoutinesList() {
  const router = useRouter();
  const theme = useTheme();
  const { data: routines, isLoading } = useRoutines();

  const sections = useMemo(() => {
    if (!routines) return [];
    const byFolder = new Map<string, Routine[]>();
    for (const routine of routines) {
      const key = routine.folder ?? '';
      if (!byFolder.has(key)) byFolder.set(key, []);
      byFolder.get(key)!.push(routine);
    }
    // Ungrouped routines (no folder) render first without a header when they're the only group.
    const entries = Array.from(byFolder.entries()).sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([folder, data]) => ({ title: folder || 'Routines', data }));
  }, [routines]);

  return (
    <Screen padded={false}>
      {isLoading ? (
        <LoadingState />
      ) : routines && routines.length === 0 ? (
        <EmptyState
          icon="list-outline"
          title="No routines yet"
          message="Build a reusable workout template like 'Push Day A'."
          actionLabel="New Routine"
          onAction={() => router.push('/(tabs)/add-workout/routines/new')}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
          renderSectionHeader={({ section }) =>
            sections.length > 1 || section.title !== 'Routines' ? (
              <Text variant="label" color="muted" weight="700" style={{ marginBottom: spacing.xs, marginTop: spacing.sm }}>
                {section.title.toUpperCase()}
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Card onPress={() => router.push(`/(tabs)/add-workout/routines/${item.id}`)} style={{ marginBottom: spacing.sm }}>
              <Text weight="600">{item.name}</Text>
              {item.description ? (
                <Text color="muted" variant="caption">
                  {item.description}
                </Text>
              ) : null}
            </Card>
          )}
        />
      )}

      <Pressable
        onPress={() => router.push('/(tabs)/add-workout/routines/new')}
        style={{
          position: 'absolute',
          right: spacing.lg,
          bottom: spacing.lg,
          width: 56,
          height: 56,
          borderRadius: radius.full,
          backgroundColor: theme.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="add" size={28} color="#FFF" />
      </Pressable>
    </Screen>
  );
}
