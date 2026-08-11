import { View, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Card } from '@/components/ui/Card';
import { useRoutines } from '@/hooks/useRoutines';
import { useTheme, spacing, radius } from '@/lib/theme';

export default function RoutinesList() {
  const router = useRouter();
  const theme = useTheme();
  const { data: routines, isLoading } = useRoutines();

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
          onAction={() => router.push('/(tabs)/routines/new')}
        />
      ) : (
        <FlatList
          data={routines}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <Card onPress={() => router.push(`/(tabs)/routines/${item.id}`)}>
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
        onPress={() => router.push('/(tabs)/routines/new')}
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
