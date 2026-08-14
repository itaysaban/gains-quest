import { useState } from 'react';
import { View, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useExercises, useToggleFavoriteExercise, type ExerciseFilters } from '@/hooks/useExercises';
import { splitMuscleGroups, TRACKING_TYPE_LABELS } from '@/lib/utils/exercise';
import { useTheme, spacing, radius } from '@/lib/theme';
import type { ExerciseCategory } from '@/types/database.types';

const CATEGORIES: ExerciseCategory[] = ['push', 'pull', 'legs', 'core', 'cardio'];

export default function ExerciseLibrary() {
  const router = useRouter();
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ExerciseCategory | undefined>();
  const [customOnly, setCustomOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const filters: ExerciseFilters = { search: search || undefined, category, customOnly, favoritesOnly };
  const { data: exercises, isLoading } = useExercises(filters);
  const toggleFavorite = useToggleFavoriteExercise();

  return (
    <Screen padded={false}>
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <TextField placeholder="Search exercises…" value={search} onChangeText={setSearch} autoCapitalize="none" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          <FilterChip label="Custom" active={customOnly} onPress={() => setCustomOnly((v) => !v)} />
          <FilterChip label="Favorites" active={favoritesOnly} onPress={() => setFavoritesOnly((v) => !v)} />
          {CATEGORIES.map((c) => (
            <FilterChip key={c} label={c} active={category === c} onPress={() => setCategory((cur) => (cur === c ? undefined : c))} />
          ))}
        </View>
      </View>

      {isLoading ? (
        <LoadingState />
      ) : exercises && exercises.length === 0 ? (
        <EmptyState
          icon="barbell-outline"
          title="No exercises found"
          message="Try adjusting your filters, or create a custom exercise."
          actionLabel="New Exercise"
          onAction={() => router.push('/(tabs)/library/new')}
        />
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          renderItem={({ item }) => {
            const { primary, secondary } = splitMuscleGroups(item.muscle_groups);
            return (
              <Pressable
                onPress={() => router.push(`/(tabs)/library/${item.id}`)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: spacing.md,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text weight="600">{item.name}</Text>
                  <Text variant="caption" color="muted">
                    {primary ?? item.category}
                    {secondary.length > 0 ? ` (+ ${secondary.join(', ')})` : ''} · {item.equipment} ·{' '}
                    {TRACKING_TYPE_LABELS[item.tracking_type]}
                    {item.is_system ? ' · built-in' : ''}
                  </Text>
                </View>
                <Pressable onPress={() => toggleFavorite.mutate({ id: item.id, isFavorite: !item.is_favorite })} hitSlop={8}>
                  <Ionicons name={item.is_favorite ? 'star' : 'star-outline'} size={22} color={theme.warning} />
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}

      <Pressable
        onPress={() => router.push('/(tabs)/library/new')}
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

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: radius.full,
        backgroundColor: active ? theme.primary : theme.surfaceAlt,
      }}
    >
      <Text variant="caption" weight="600" style={{ color: active ? '#FFF' : theme.text, textTransform: 'capitalize' }}>
        {label}
      </Text>
    </Pressable>
  );
}
