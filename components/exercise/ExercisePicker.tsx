import { useState } from 'react';
import { Modal, View, FlatList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { EmptyState } from '@/components/ui/EmptyState';
import { useExercises } from '@/hooks/useExercises';
import type { Exercise } from '@/types/domain';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
  title?: string;
}

export function ExercisePicker({ visible, onClose, onSelect, title = 'Add Exercise' }: Props) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const { data: exercises, isLoading } = useExercises({ search: search || undefined });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: spacing.xl }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: spacing.lg,
            marginBottom: spacing.md,
          }}
        >
          <Text variant="subtitle">{title}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={26} color={theme.text} />
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
          <TextField placeholder="Search exercises…" value={search} onChangeText={setSearch} autoCapitalize="none" />
        </View>

        {!isLoading && exercises?.length === 0 ? (
          <EmptyState icon="search" title="No exercises found" message="Try a different search term." />
        ) : (
          <FlatList
            data={exercises}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: spacing.md,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                }}
              >
                <View>
                  <Text weight="600">{item.name}</Text>
                  <Text variant="caption" color="muted">
                    {item.category} · {item.equipment}
                  </Text>
                </View>
                {item.is_favorite ? <Ionicons name="star" size={18} color={theme.warning} /> : null}
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}
